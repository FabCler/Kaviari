import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  AI_UNAVAILABLE_MESSAGE,
  AiRequestError,
  completeJson,
  isAiConfigured,
} from "@/lib/ai";
import { parseUpload, renderContentForPrompt } from "@/lib/import/parse";
import { loadConverter, normalizeUnit, round } from "@/lib/scm/units";
import { parseImportDate } from "@/lib/scm/import/rows";

/**
 * Supplier invoice reading (§1.3). A PDF (or spreadsheet) is parsed to text,
 * the model extracts the fields, and *nothing* is trusted: the extraction is
 * stored as-is, shown to purchasing for verification, and every manual
 * correction is recorded on the line it changed.
 *
 * With no ANTHROPIC_API_KEY the upload still works — the invoice lands in
 * "extracted" with empty lines and purchasing keys it in by hand.
 */

const extractionSchema = z.object({
  invoiceNumber: z.string().nullable(),
  poNumber: z.string().nullable(),
  supplierCode: z.string().nullable(),
  supplierName: z.string().nullable(),
  invoiceDate: z.string().nullable(),
  deliveryDate: z.string().nullable(),
  currency: z.string().nullable(),
  lines: z
    .array(
      z.object({
        productCode: z.string().nullable(),
        description: z.string().nullable(),
        quantity: z.number().nullable(),
        unit: z.string().nullable(),
        unitPrice: z.number().nullable(),
        priceUnit: z.string().nullable(),
        currency: z.string().nullable(),
        deliveryDate: z.string().nullable(),
      })
    )
    .default([]),
});

export type InvoiceExtraction = z.infer<typeof extractionSchema>;

const SYSTEM_PROMPT = [
  "You read supplier invoices for a seafood import business and return structured data.",
  "You receive the PRODUCT CATALOG as JSON and the raw text of one invoice document.",
  "Extract EVERY line item in document order. Never merge, deduplicate or aggregate lines: the same product on two document lines stays two entries.",
  "Reply with ONLY strict JSON — no markdown, no commentary — in exactly this shape:",
  '{"invoiceNumber": string|null, "poNumber": string|null, "supplierCode": string|null, "supplierName": string|null, "invoiceDate": "YYYY-MM-DD"|null, "deliveryDate": "YYYY-MM-DD"|null, "currency": string|null, "lines": [{"productCode": string|null, "description": string|null, "quantity": number|null, "unit": string|null, "unitPrice": number|null, "priceUnit": string|null, "currency": string|null, "deliveryDate": "YYYY-MM-DD"|null}]}',
  "Rules:",
  "- productCode must be a code from the catalog when you can match the line confidently (match on code first, then description and pack size); otherwise null.",
  "- Copy quantity, unit, unit price and price unit exactly as printed. Do not convert units or recompute prices.",
  "- unit is the unit of the quantity (KG, PC, BOX, CARTON, PACK, CASE); priceUnit is the unit the price is quoted per.",
  "- Dates are formatted YYYY-MM-DD, or null when the document does not show them.",
  "- Ignore totals, subtotals, VAT, freight and any non-product row.",
  "- Never invent a value. A field you cannot read is null — a human verifies every invoice before it counts.",
].join("\n");

export interface ExtractedInvoiceLine {
  lineNo: number;
  productId: string | null;
  productCodeRaw: string | null;
  descriptionRaw: string | null;
  quantity: number;
  unit: string;
  baseQuantity: number;
  unitPrice: number;
  priceUnit: string | null;
  currency: string;
  deliveryDate: Date | null;
  /** Set when the catalog match failed — purchasing must pick the product. */
  unmatched: boolean;
}

export interface ExtractedInvoice {
  invoiceNumber: string | null;
  poNumber: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  invoiceDate: Date | null;
  deliveryDate: Date | null;
  currency: string;
  lines: ExtractedInvoiceLine[];
  raw: unknown;
  mode: "ai" | "manual";
  notices: string[];
}

export async function extractInvoice(
  buffer: Buffer,
  fileName: string
): Promise<ExtractedInvoice> {
  const parsed = await parseUpload(buffer, fileName);
  const notices = [...parsed.notices];

  if (!isAiConfigured()) {
    return {
      invoiceNumber: null,
      poNumber: null,
      supplierCode: null,
      supplierName: null,
      invoiceDate: null,
      deliveryDate: null,
      currency: "EUR",
      lines: [],
      raw: null,
      mode: "manual",
      notices: [
        ...notices,
        `${AI_UNAVAILABLE_MESSAGE} The invoice was stored — enter the lines manually below.`,
      ],
    };
  }

  const products = await prisma.product.findMany({
    where: { active: true },
    select: {
      id: true,
      prCode: true,
      name: true,
      nameTh: true,
      unit: true,
      purchaseUnit: true,
      gramsPerUnit: true,
    },
  });

  const catalog = products.map((product) => ({
    code: product.prCode,
    name: product.name,
    nameTh: product.nameTh,
    unit: product.unit,
    purchaseUnit: product.purchaseUnit,
    grams: product.gramsPerUnit,
  }));

  let raw: unknown;
  try {
    raw = await completeJson({
      system: SYSTEM_PROMPT,
      prompt: [
        `PRODUCT CATALOG:\n${JSON.stringify(catalog)}`,
        `INVOICE FILE: ${fileName}`,
        renderContentForPrompt(parsed.content),
      ].join("\n\n"),
      maxTokens: 24000,
    });
  } catch (error) {
    if (error instanceof AiRequestError) {
      return {
        invoiceNumber: null,
        poNumber: null,
        supplierCode: null,
        supplierName: null,
        invoiceDate: null,
        deliveryDate: null,
        currency: "EUR",
        lines: [],
        raw: null,
        mode: "manual",
        notices: [...notices, `${error.message} Enter the lines manually below.`],
      };
    }
    throw error;
  }

  const result = extractionSchema.safeParse(raw);
  if (!result.success) {
    return {
      invoiceNumber: null,
      poNumber: null,
      supplierCode: null,
      supplierName: null,
      invoiceDate: null,
      deliveryDate: null,
      currency: "EUR",
      lines: [],
      raw,
      mode: "manual",
      notices: [
        ...notices,
        "The reader returned data in an unexpected shape — enter the lines manually below.",
      ],
    };
  }

  const extraction = result.data;
  const byCode = new Map(products.map((p) => [p.prCode.toUpperCase(), p]));
  const converter = await loadConverter(prisma, products.map((p) => p.id));
  const invoiceCurrency = (extraction.currency ?? "EUR").toUpperCase();

  const lines: ExtractedInvoiceLine[] = extraction.lines.map((line, index) => {
    const code = line.productCode?.trim().toUpperCase() ?? "";
    const product = code ? byCode.get(code) : undefined;
    const quantity = line.quantity ?? 0;
    const unit = normalizeUnit(line.unit ?? product?.unit ?? "");
    let baseQuantity = quantity;
    if (product && unit && normalizeUnit(product.unit) !== unit) {
      baseQuantity =
        converter.tryConvert(quantity, unit, product.unit, product.id) ??
        quantity;
    }
    return {
      lineNo: index + 1,
      productId: product?.id ?? null,
      productCodeRaw: line.productCode ?? null,
      descriptionRaw: line.description ?? null,
      quantity: round(quantity),
      unit: unit || "PC",
      baseQuantity: round(baseQuantity),
      unitPrice: round(line.unitPrice ?? 0),
      priceUnit: line.priceUnit ? normalizeUnit(line.priceUnit) : null,
      currency: (line.currency ?? invoiceCurrency).toUpperCase(),
      deliveryDate: parseImportDate(line.deliveryDate ?? undefined),
      unmatched: !product,
    };
  });

  if (lines.some((line) => line.unmatched)) {
    notices.push(
      `${lines.filter((line) => line.unmatched).length} line(s) could not be matched to a product — pick the product before confirming.`
    );
  }

  return {
    invoiceNumber: extraction.invoiceNumber,
    poNumber: extraction.poNumber,
    supplierCode: extraction.supplierCode,
    supplierName: extraction.supplierName,
    invoiceDate: parseImportDate(extraction.invoiceDate ?? undefined),
    deliveryDate: parseImportDate(extraction.deliveryDate ?? undefined),
    currency: invoiceCurrency,
    lines,
    raw,
    mode: "ai",
    notices,
  };
}

/**
 * Match invoice lines to the PO lines they pay for. Product first, then the
 * delivery date when a PO has the same product on several dates.
 */
export async function matchInvoiceToPo(invoiceId: string): Promise<number> {
  const invoice = await prisma.scmInvoice.findUnique({
    where: { id: invoiceId },
    include: { lines: true, po: { include: { lines: true } } },
  });
  if (!invoice?.po) return 0;

  let matched = 0;
  for (const line of invoice.lines) {
    if (!line.productId || line.poLineId) continue;
    const candidates = invoice.po.lines.filter(
      (poLine) => poLine.productId === line.productId
    );
    if (candidates.length === 0) continue;
    const best =
      candidates.length === 1
        ? candidates[0]
        : (candidates.find(
            (poLine) =>
              line.deliveryDate &&
              poLine.deliveryDate.toISOString().slice(0, 10) ===
                line.deliveryDate.toISOString().slice(0, 10)
          ) ?? candidates[0]);
    await prisma.scmInvoiceLine.update({
      where: { id: line.id },
      data: { poLineId: best.id },
    });
    matched += 1;
  }
  return matched;
}
