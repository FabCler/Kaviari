import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { nextPoReference } from "@/lib/planner";
import { expectedDeliveryDate } from "@/lib/replenishment";
import { AI_UNAVAILABLE_MESSAGE, completeJson, isAiConfigured } from "@/lib/ai";
import {
  ImportParseError,
  parseUpload,
  renderContentForPrompt,
} from "@/lib/import/parse";
import { MAX_FILE_BYTES } from "@/lib/import/types";

export const dynamic = "force-dynamic";

/**
 * Upload a supplier PO file (.xlsx/.xls/.csv/.pdf). The AI reads the parsed
 * content against the product catalog and returns structured lines; the PO is
 * created as "sent" (it was already sent to the supplier) in one transaction.
 */

const aiPoSchema = z.object({
  reference: z.string().nullable(),
  orderDate: z.string().nullable(),
  expectedDeliveryDate: z.string().nullable(),
  lines: z.array(
    z.object({
      productId: z.string().min(1),
      quantityTins: z.number().positive(),
      unitCost: z.number().min(0).nullable(),
    })
  ),
  unmatched: z
    .array(
      z.object({
        description: z.string(),
        quantity: z.number().nullable().optional(),
      })
    )
    .default([]),
});

const SYSTEM_PROMPT = [
  "You extract purchase-order data from supplier order files for Kaviari Cellar, a caviar inventory app.",
  "You receive the PRODUCT CATALOG as JSON and the raw content of an uploaded order file.",
  "Match every order line in the file to exactly one catalog product: match by PR code first, then by product name (and tin size / weight when names are ambiguous).",
  "Extract EVERY line item, in the exact order it appears in the document. Do NOT merge, deduplicate or aggregate lines: if the same product appears on several document lines, output one entry per document line, each with that line's quantity exactly as written.",
  "Reply with ONLY strict JSON — no markdown, no commentary — in exactly this shape:",
  '{"reference": string|null, "orderDate": "YYYY-MM-DD"|null, "expectedDeliveryDate": "YYYY-MM-DD"|null, "lines": [{"productId": string, "quantityTins": number, "unitCost": number|null}], "unmatched": [{"description": string, "quantity": number|null}]}',
  "Rules:",
  "- productId MUST be one of the ids from the catalog. Never invent an id.",
  "- quantityTins is the ordered quantity in the product's stock unit (tins, pieces, kg or packs) and must be a positive number.",
  "- unitCost is the price per unit from the file, or null when the file has no price for that line.",
  "- reference is the purchase-order number/reference printed in the document, or null when there is none.",
  "- orderDate / expectedDeliveryDate come from the document when present, formatted YYYY-MM-DD, else null.",
  "- Any row you cannot confidently match goes to unmatched with a short description and its quantity (or null).",
  "- Ignore headers, totals, subtotals, shipping and tax rows.",
].join("\n");

function parseDay(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function describeUnmatched(
  unmatched: { description: string; quantity?: number | null }[]
): string {
  return unmatched
    .slice(0, 8)
    .map(
      (u) => `${u.description}${u.quantity != null ? ` (×${u.quantity})` : ""}`
    )
    .join("; ");
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!isAiConfigured()) {
    return Response.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "Expected a multipart form with a file." },
      { status: 400 }
    );
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file was uploaded." }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json(
      { error: "That file is larger than 10 MB." },
      { status: 413 }
    );
  }

  // ---- Parse the raw file content -----------------------------------------
  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = await parseUpload(buffer, file.name);
  } catch (error) {
    if (error instanceof ImportParseError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: "The file could not be read." },
      { status: 400 }
    );
  }

  // ---- Ask the AI for structured PO data ----------------------------------
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  const catalog = products.map((p) => ({
    id: p.id,
    prCode: p.prCode,
    name: p.name,
    unit: p.unit,
    packingPerBox: p.packingPerBox,
    unitCost: p.unitCost,
  }));

  let raw: unknown;
  try {
    raw = await completeJson({
      system: SYSTEM_PROMPT,
      prompt: [
        `PRODUCT CATALOG (JSON):\n${JSON.stringify(catalog)}`,
        `UPLOADED FILE: ${file.name}`,
        renderContentForPrompt(parsed.content),
      ].join("\n\n"),
      maxTokens: 8192,
    });
  } catch {
    return Response.json(
      { error: "The file could not be analyzed. Please try again." },
      { status: 502 }
    );
  }

  const validated = aiPoSchema.safeParse(raw);
  if (!validated.success) {
    return Response.json(
      {
        error:
          "The AI could not extract a purchase order from this file. Check that it contains order lines with products and quantities.",
      },
      { status: 422 }
    );
  }
  const ai = validated.data;

  // ---- Server-side verification: never trust invented product ids ---------
  // The source document is respected line by line: one PurchaseOrderLine per
  // document line, in file order, quantities exactly as written — no merging.
  const byId = new Map(products.map((p) => [p.id, p]));
  const unmatched = [...ai.unmatched];
  const lines: {
    productId: string;
    quantityTins: number;
    unitCost: number;
  }[] = [];
  for (const line of ai.lines) {
    const product = byId.get(line.productId);
    if (!product) {
      unmatched.push({
        description: `Unknown product id ${line.productId}`,
        quantity: line.quantityTins,
      });
      continue;
    }
    lines.push({
      productId: product.id,
      quantityTins: line.quantityTins,
      unitCost: line.unitCost ?? product.unitCost,
    });
  }

  if (lines.length === 0) {
    const detail = describeUnmatched(unmatched);
    return Response.json(
      {
        error: `No catalog products could be matched in this file${
          detail ? ` — unmatched: ${detail}` : ""
        }. Check that the file lists Kaviari products with PR codes or full names.`,
        unmatched,
      },
      { status: 422 }
    );
  }

  // ---- Resolve reference & dates -------------------------------------------
  const now = new Date();
  const settings = await getSettings();

  const orderDate = parseDay(ai.orderDate) ?? now;
  const expectedDelivery =
    parseDay(ai.expectedDeliveryDate) ??
    expectedDeliveryDate(orderDate, settings.leadTimeDays);

  let reference = ai.reference?.trim().slice(0, 60) || null;
  if (reference) {
    const clash = await prisma.purchaseOrder.findUnique({
      where: { reference },
      select: { id: true },
    });
    if (clash) reference = null;
  }
  if (!reference) reference = await nextPoReference(now);

  // ---- Create the PO (single atomic create) --------------------------------
  let po;
  try {
    po = await prisma.purchaseOrder.create({
      data: {
        reference,
        status: "sent",
        orderDate,
        expectedDeliveryDate: expectedDelivery,
        uploadedFileName: file.name,
        lines: {
          create: lines.map((line) => ({
            productId: line.productId,
            quantityTins: line.quantityTins,
            unitCost: line.unitCost,
          })),
        },
      },
    });
  } catch {
    // Reference collided in a race — retry once with a generated one.
    po = await prisma.purchaseOrder.create({
      data: {
        reference: await nextPoReference(now),
        status: "sent",
        orderDate,
        expectedDeliveryDate: expectedDelivery,
        uploadedFileName: file.name,
        lines: {
          create: lines.map((line) => ({
            productId: line.productId,
            quantityTins: line.quantityTins,
            unitCost: line.unitCost,
          })),
        },
      },
    });
  }

  return Response.json(
    {
      id: po.id,
      reference: po.reference,
      matched: lines.length,
      unmatched,
    },
    { status: 201 }
  );
}
