/**
 * Reading a scanned supplier document.
 *
 * A scan has no text layer, so lib/import/pdf.ts finds nothing in it. This
 * route hands the pages to Claude, which reads them the way a person does, and
 * returns the lines as data.
 *
 * Two things to know before switching it on:
 *   - the document is sent to Anthropic's API, so it leaves the server;
 *   - what comes back is a reading, not a fact. It goes into the same editable
 *     preview as everything else and nothing is written until a desk confirms
 *     the figures against the paper.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { DocKind } from "@/lib/import/columns";
import type { PdfHeader, PdfRow } from "@/lib/import/pdf";
import { num } from "@/lib/format";

/** OCR is only offered when the server is configured for it. */
export const ocrConfigured = (): boolean => !!process.env.ANTHROPIC_API_KEY;

const ExtractionSchema = z.object({
  documentNo: z.string(),
  supplierName: z.string(),
  currency: z.string(),
  lines: z.array(
    z.object({
      itemCode: z.string(),
      description: z.string(),
      qty: z.number(),
      uom: z.string(),
      unitPrice: z.number(),
      amount: z.number(),
    })
  ),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export type OcrResult = {
  header: PdfHeader;
  rows: PdfRow[];
  confidence: Extraction["confidence"];
  notes: string;
};

/** The reading, mapped onto the shape the import preview already speaks. */
export function mapExtraction(x: Extraction, kind: DocKind): OcrResult {
  const rows: PdfRow[] = x.lines
    .filter((l) => (l.description || l.itemCode) && num(l.qty) > 0)
    .map((l) => ({
      itemCode: String(l.itemCode ?? "").trim(),
      desc: String(l.description ?? "").trim().slice(0, 90),
      qty: num(l.qty),
      uom: String(l.uom ?? "").trim().toUpperCase() || "KG",
      price: num(l.unitPrice),
      amount: num(l.amount),
    }));
  return {
    header: {
      poNo: kind === "po" ? x.documentNo : "",
      invoiceNo: kind === "invoice" ? x.documentNo : "",
      supplierCode: "",
      supplierName: x.supplierName ?? "",
      currency: (x.currency ?? "").toUpperCase().slice(0, 6),
      deliveryDate: "",
    },
    rows,
    confidence: x.confidence,
    notes: x.notes ?? "",
  };
}

const INSTRUCTION = `You are reading a scanned supplier document for a seafood importer's
receiving desk. Read the printed table of goods and return every line of it.

Rules:
- Report the figures exactly as printed. Do not convert units, round, or
  recalculate anything.
- A quantity written 37,056 in a European document means 37.056, and 1.234,56
  means 1234.56. Return plain numbers.
- itemCode is the supplier's own article number when the row shows one,
  otherwise an empty string.
- Include only rows of goods. Leave out totals, subtotals, taxes, freight and
  any line that is not an article.
- If a figure is unreadable, put 0 for it and say which line and which figure
  in notes.
- Never invent a line, a code or a price. If the page is unreadable, return no
  lines and explain in notes.
- confidence is your own reading of how legible the document was.`;

export async function ocrDocument(
  bytes: Uint8Array,
  kind: DocKind
): Promise<OcrResult> {
  if (!ocrConfigured())
    throw new Error(
      "Reading a scan is not switched on for this server. Set ANTHROPIC_API_KEY in the environment to enable it."
    );

  const client = new Anthropic();
  const response = await readWith(client, bytes, kind);

  if (response.stop_reason === "refusal")
    throw new Error("The document could not be read (the request was declined).");
  const parsed = response.parsed_output;
  if (!parsed)
    throw new Error("The document was read but the answer could not be understood.");
  return mapExtraction(parsed, kind);
}

/**
 * The call itself, with the failures a desk can do something about named in
 * words rather than passed through as an API error body.
 */
async function readWith(
  client: Anthropic,
  bytes: Uint8Array,
  kind: DocKind
) {
  try {
    return await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: Buffer.from(bytes).toString("base64"),
            },
          },
          {
            type: "text",
            text: `${INSTRUCTION}\n\nThis document is a ${
              kind === "po"
                ? "purchase order"
                : kind === "invoice"
                  ? "supplier invoice"
                  : "customer sales order"
            }.`,
          },
        ],
      },
    ],
      output_config: { format: zodOutputFormat(ExtractionSchema) },
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError)
      throw new Error(
        "The key this server uses to read scans was refused. Check ANTHROPIC_API_KEY."
      );
    if (e instanceof Anthropic.RateLimitError)
      throw new Error("Reading is busy right now — try the scan again in a minute.");
    if (e instanceof Anthropic.BadRequestError)
      throw new Error(
        "That scan could not be read — it may have too many pages, or not be a PDF at all."
      );
    if (e instanceof Anthropic.APIConnectionError)
      throw new Error("The server could not reach the reading service.");
    if (e instanceof Anthropic.APIError)
      throw new Error(`That scan could not be read (error ${e.status}).`);
    throw e;
  }
}
