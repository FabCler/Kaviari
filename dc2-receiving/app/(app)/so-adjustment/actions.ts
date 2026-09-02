"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { record } from "@/lib/audit";
import { upsertLineState } from "../validation/actions";
import { norm, r2 } from "@/lib/format";

const payloadSchema = z.object({
  shipmentId: z.string().min(1),
  supplierCode: z.string(),
  itemKey: z.string().min(1),
  freeStockQty: z.number().min(0).max(1_000_000),
  rows: z
    .array(
      z.object({
        id: z.string().min(1),
        revisedQty: z.number().min(0).max(1_000_000),
        sapUpdated: z.boolean(),
      })
    )
    .max(500),
});

export type SavePayload = z.infer<typeof payloadSchema>;
export type Result = { ok: true; balance: number } | { ok: false; error: string };

/**
 * The whole allocation is written in one go, when the desk confirms it —
 * nothing is saved while the numbers are still being worked out. Everything
 * lands together or not at all.
 */
export async function saveAllocation(payload: SavePayload): Promise<Result> {
  const user = await requireSection("soadjust");
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Those quantities could not be read." };
  const { shipmentId, supplierCode, itemKey, freeStockQty, rows } = parsed.data;

  const existing = await prisma.soLine.findMany({
    where: { id: { in: rows.map((r) => r.id) }, shipmentId },
  });
  if (existing.length !== rows.length)
    return { ok: false, error: "Those SO lines have changed — reload the page." };

  await prisma.$transaction([
    ...rows.map((r) =>
      prisma.soLine.update({
        where: { id: r.id },
        data: { revisedQty: r2(r.revisedQty), sapUpdated: r.sapUpdated },
      })
    ),
  ]);
  await upsertLineState(
    shipmentId,
    supplierCode,
    itemKey,
    { freeStockQty: r2(freeStockQty) },
    user.id
  );

  const invoice = await prisma.invoiceLine.aggregate({
    where: {
      shipmentId,
      supplierCode: norm(supplierCode),
      OR: [{ itemBarcode: itemKey }, { rawItem: itemKey }],
    },
    _sum: { qty: true },
  });
  const allocated =
    rows.reduce((a, r) => a + r.revisedQty, 0) + freeStockQty;
  const balance = r2((invoice._sum.qty ?? 0) - allocated);

  await record(
    user.id,
    "allocation.save",
    `${supplierCode} ${itemKey}`,
    `${rows.length} SO lines, free stock ${freeStockQty}, balance ${balance}`
  );
  revalidatePath("/so-adjustment");
  revalidatePath("/validation");
  revalidatePath("/receiving");
  revalidatePath("/");
  return { ok: true, balance };
}
