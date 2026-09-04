import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { round } from "@/lib/scm/units";

/**
 * Warehouse stock / leftover (§24).
 *
 * Anything received that did not go straight to a customer is booked here
 * with the whole chain that produced it — supplier, PO, invoice, the SO it
 * was bought for and the channel — so a box found in the freezer six weeks
 * later can always be traced back to the order that brought it in.
 *
 * Quantity is never edited in place: every movement writes a transaction and
 * the running balance, which is what makes the history reconstructable.
 */

export type StockTransactionType =
  | "in"
  | "out"
  | "adjust"
  | "reserve"
  | "release"
  | "write_off";

export interface CreateStockInput {
  productId: string;
  quantity: number;
  unit: string;
  supplierId?: string | null;
  poId?: string | null;
  invoiceId?: string | null;
  originalSoLineId?: string | null;
  channelId?: string | null;
  receivingLineId?: string | null;
  allocationLineId?: string | null;
  reason?: string | null;
  location?: string | null;
  lotNumber?: string | null;
  expiryDate?: Date | null;
  createdByName?: string | null;
}

type Client = Prisma.TransactionClient | typeof prisma;

export async function nextStockNumber(date = new Date()): Promise<string> {
  const prefix = `STK-${date.getUTCFullYear()}-`;
  const rows = await prisma.scmWarehouseStock.findMany({
    where: { stockNumber: { startsWith: prefix } },
    select: { stockNumber: true },
  });
  let max = 0;
  for (const row of rows) {
    const parsed = Number.parseInt(row.stockNumber.slice(prefix.length), 10);
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/** Book leftover into stock and open its transaction history. */
export async function receiveIntoStock(
  input: CreateStockInput,
  client: Client = prisma
) {
  const quantity = round(input.quantity);
  const stockNumber = await nextStockNumber();

  const stock = await client.scmWarehouseStock.create({
    data: {
      stockNumber,
      productId: input.productId,
      quantity,
      unit: input.unit,
      supplierId: input.supplierId ?? null,
      poId: input.poId ?? null,
      invoiceId: input.invoiceId ?? null,
      originalSoLineId: input.originalSoLineId ?? null,
      channelId: input.channelId ?? null,
      receivingLineId: input.receivingLineId ?? null,
      allocationLineId: input.allocationLineId ?? null,
      reason: input.reason ?? null,
      location: input.location ?? null,
      lotNumber: input.lotNumber ?? null,
      expiryDate: input.expiryDate ?? null,
      status: "on_hand",
      createdByName: input.createdByName ?? null,
    },
  });

  await client.scmWarehouseStockTransaction.create({
    data: {
      stockId: stock.id,
      type: "in",
      quantity,
      balanceAfter: quantity,
      reason: input.reason ?? "Leftover from receiving",
      referenceType: input.receivingLineId ? "receiving_line" : null,
      referenceId: input.receivingLineId ?? null,
      byName: input.createdByName ?? null,
    },
  });

  return stock;
}

/** Move stock out (sold, written off, transferred) with a mandatory reason. */
export async function moveStock(
  stockId: string,
  input: {
    type: StockTransactionType;
    quantity: number;
    reason: string;
    referenceType?: string | null;
    referenceId?: string | null;
    byName?: string | null;
  },
  client: Client = prisma
): Promise<{ ok: boolean; error?: string; balance?: number }> {
  const stock = await client.scmWarehouseStock.findUnique({
    where: { id: stockId },
  });
  if (!stock) return { ok: false, error: "Stock record not found." };

  const delta =
    input.type === "in" || input.type === "release"
      ? round(input.quantity)
      : -round(input.quantity);
  const balance = round(stock.quantity + delta);

  if (balance < 0) {
    return {
      ok: false,
      error: `Only ${stock.quantity} ${stock.unit} on hand — cannot move ${input.quantity}.`,
    };
  }

  await client.scmWarehouseStock.update({
    where: { id: stockId },
    data: {
      quantity: balance,
      status:
        balance === 0
          ? input.type === "write_off"
            ? "written_off"
            : "consumed"
          : input.type === "reserve"
            ? "reserved"
            : stock.status,
    },
  });

  await client.scmWarehouseStockTransaction.create({
    data: {
      stockId,
      type: input.type,
      quantity: round(input.quantity),
      balanceAfter: balance,
      reason: input.reason,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      byName: input.byName ?? null,
    },
  });

  return { ok: true, balance };
}

export interface StockFilters {
  productId?: string;
  channelIds?: string[] | null;
  channelId?: string | null;
  status?: string;
  location?: string;
  search?: string;
}

/** The Warehouse stock board, with the whole origin chain on every row. */
export async function listWarehouseStock(filters: StockFilters = {}) {
  return prisma.scmWarehouseStock.findMany({
    where: {
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.status ? { status: filters.status } : { status: { in: ["on_hand", "reserved"] } }),
      ...(filters.location ? { location: { contains: filters.location } } : {}),
      ...(filters.channelId
        ? { channelId: filters.channelId }
        : filters.channelIds
          ? { channelId: { in: filters.channelIds } }
          : {}),
      ...(filters.search
        ? {
            OR: [
              { stockNumber: { contains: filters.search } },
              { lotNumber: { contains: filters.search } },
              { product: { prCode: { contains: filters.search } } },
              { product: { name: { contains: filters.search } } },
            ],
          }
        : {}),
    },
    include: {
      product: true,
      supplier: true,
      po: true,
      channel: true,
      originalSoLine: { include: { so: { include: { customer: true } } } },
    },
    orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }],
    take: 300,
  });
}
