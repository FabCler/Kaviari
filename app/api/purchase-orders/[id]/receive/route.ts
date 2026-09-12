import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { OPEN_PO_STATUSES, type PoStatus } from "@/lib/domain";
import { formatTins, shortProductName } from "@/lib/format";

const bodySchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.string().min(1),
        receivedTins: z.number().min(0),
        // Both optional: deliveries can be received before the tins' lot
        // number or DLC is known.
        lotNumber: z.string().max(80).nullish(),
        expiryDate: z.string().nullish(),
      })
    )
    .min(1)
    .max(200),
});

type Ctx = { params: Promise<{ id: string }> };

/**
 * Receive a delivery — informational only. The PO flips to `received` and
 * the received quantities (with any lot/DLC noted) are appended to its
 * notes; NO stock lots or movements are created. Actual stock is set by
 * uploading a count through Import & Analyze. Partial receipts
 * (receivedTins < ordered) are also recorded in the notes.
 */
export async function POST(request: Request, ctx: Ctx) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await ctx.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { lines: { include: { product: true } } },
  });
  if (!po) {
    return Response.json({ error: "Purchase order not found" }, { status: 404 });
  }
  if (!OPEN_PO_STATUSES.includes(po.status as PoStatus)) {
    return Response.json(
      { error: `A purchase order in status "${po.status}" cannot be received.` },
      { status: 409 }
    );
  }

  const linesById = new Map(po.lines.map((line) => [line.id, line]));
  const receipts: {
    line: (typeof po.lines)[number];
    receivedTins: number;
    lotNumber: string | null;
    expiryDate: Date | null;
  }[] = [];

  for (const item of parsed.data.lines) {
    const line = linesById.get(item.lineId);
    if (!line) {
      return Response.json(
        { error: "A line in the request does not belong to this order." },
        { status: 400 }
      );
    }
    let expiry: Date | null = null;
    if (item.expiryDate) {
      expiry = new Date(item.expiryDate);
      if (Number.isNaN(expiry.getTime())) {
        return Response.json(
          { error: `Invalid expiry date for ${line.product.name}.` },
          { status: 400 }
        );
      }
    }
    receipts.push({
      line,
      receivedTins: item.receivedTins,
      lotNumber: item.lotNumber?.trim() || null,
      expiryDate: expiry,
    });
  }

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const shortfalls = receipts
    .filter((r) => r.receivedTins < r.line.quantityTins)
    .map(
      (r) =>
        `${shortProductName(r.line.product.name)}: received ${formatTins(
          r.receivedTins
        )} of ${formatTins(r.line.quantityTins)} ordered`
    );

  // Receiving is INFORMATIONAL ONLY: no stock lots, no movements — real
  // stock is set by uploading a count through Import & Analyze. The
  // received details are kept on the order's notes.
  const receivedLines = receipts
    .filter((r) => r.receivedTins > 0)
    .map((r) => {
      const extras = [
        r.lotNumber ? `lot ${r.lotNumber}` : null,
        r.expiryDate ? `DLC ${r.expiryDate.toISOString().slice(0, 10)}` : null,
      ].filter(Boolean);
      return `${shortProductName(r.line.product.name)}: ${formatTins(
        r.receivedTins
      )}${extras.length > 0 ? ` (${extras.join(", ")})` : ""}`;
    });

  let notes = po.notes ?? "";
  const receiptNote = `Received (${day}): ${
    receivedLines.length > 0 ? receivedLines.join("; ") : "nothing"
  }. Stock unchanged — update it via Import & Analyze.`;
  notes = notes ? `${notes}\n${receiptNote}` : receiptNote;
  if (shortfalls.length > 0) {
    notes += `\nPartial receipt (${day}): ${shortfalls.join("; ")}.`;
  }

  await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status: "received",
      receivedDate: now,
      notes: notes || null,
    },
  });

  return Response.json({ ok: true });
}
