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
        lotNumber: z.string().min(1).max(80),
        expiryDate: z.string().min(1),
      })
    )
    .min(1)
    .max(200),
});

type Ctx = { params: Promise<{ id: string }> };

/**
 * Receive a delivery: one StockLot + one receipt movement per line, then the
 * PO flips to `received` — all in a single transaction. Partial receipts
 * (receivedTins < ordered) are allowed and recorded in the PO notes.
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
    lotNumber: string;
    expiryDate: Date;
  }[] = [];

  for (const item of parsed.data.lines) {
    const line = linesById.get(item.lineId);
    if (!line) {
      return Response.json(
        { error: "A line in the request does not belong to this order." },
        { status: 400 }
      );
    }
    const expiry = new Date(item.expiryDate);
    if (Number.isNaN(expiry.getTime())) {
      return Response.json(
        { error: `Invalid expiry date for lot ${item.lotNumber}.` },
        { status: 400 }
      );
    }
    receipts.push({
      line,
      receivedTins: item.receivedTins,
      lotNumber: item.lotNumber.trim(),
      expiryDate: expiry,
    });
  }

  const now = new Date();
  const shortfalls = receipts
    .filter((r) => r.receivedTins < r.line.quantityTins)
    .map(
      (r) =>
        `${shortProductName(r.line.product.name)}: received ${formatTins(
          r.receivedTins
        )} of ${formatTins(r.line.quantityTins)} ordered`
    );

  let notes = po.notes ?? "";
  if (shortfalls.length > 0) {
    const partialNote = `Partial receipt (${now
      .toISOString()
      .slice(0, 10)}): ${shortfalls.join("; ")}.`;
    notes = notes ? `${notes}\n${partialNote}` : partialNote;
  }

  await prisma.$transaction(async (tx) => {
    for (const receipt of receipts) {
      if (receipt.receivedTins <= 0) continue;
      const lot = await tx.stockLot.create({
        data: {
          productId: receipt.line.productId,
          lotNumber: receipt.lotNumber,
          quantityTins: receipt.receivedTins,
          receivedTins: receipt.receivedTins,
          receivedDate: now,
          expiryDate: receipt.expiryDate,
          status: "in_stock",
        },
      });
      await tx.stockMovement.create({
        data: {
          productId: receipt.line.productId,
          lotId: lot.id,
          type: "receipt",
          quantityTins: receipt.receivedTins,
          gramsEquivalent:
            receipt.receivedTins * (receipt.line.product.gramsPerUnit ?? 0),
          date: now,
          note: `Received ${po.reference}`,
        },
      });
    }
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: "received",
        receivedDate: now,
        notes: notes || null,
      },
    });
  });

  return Response.json({ ok: true });
}
