import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { DEMAND_MOVEMENT_TYPES } from "@/lib/domain";
import { spreadMonthlyQuantity } from "@/lib/import/period";

/**
 * Manage recorded consumption data by month:
 *  - GET             -> months summary (units, movement count)
 *  - GET ?month=     -> per-product totals for that month
 *  - PUT             -> replace one product's quantity for a month
 *  - DELETE ?month=[&productId=] -> remove the month's (or one product's) data
 *
 * Deleting/replacing restores lot quantities for movements that drew stock
 * from a lot, so current stock stays consistent (historical imports carry no
 * lot and are simply removed).
 */

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthRange(month: string): { gte: Date; lt: Date } {
  const [y, m] = month.split("-").map(Number);
  return {
    gte: new Date(Date.UTC(y, m - 1, 1)),
    lt: new Date(Date.UTC(y, m, 1)),
  };
}

const demandFilter = { type: { in: [...DEMAND_MOVEMENT_TYPES] } };

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const month = new URL(request.url).searchParams.get("month");

  if (!month) {
    const movements = await prisma.stockMovement.findMany({
      where: demandFilter,
      select: { date: true, quantityTins: true },
    });
    const byMonth = new Map<string, { units: number; movements: number }>();
    for (const m of movements) {
      const key = m.date.toISOString().slice(0, 7);
      const entry = byMonth.get(key) ?? { units: 0, movements: 0 };
      entry.units += Math.abs(m.quantityTins);
      entry.movements += 1;
      byMonth.set(key, entry);
    }
    const months = [...byMonth.entries()]
      .map(([key, v]) => ({
        month: key,
        units: round2(v.units),
        movements: v.movements,
      }))
      .sort((a, b) => b.month.localeCompare(a.month));
    return Response.json({ months });
  }

  if (!MONTH_RE.test(month)) {
    return Response.json({ error: "Invalid month" }, { status: 400 });
  }
  const range = monthRange(month);
  const movements = await prisma.stockMovement.findMany({
    where: { ...demandFilter, date: { gte: range.gte, lt: range.lt } },
    select: { productId: true, quantityTins: true },
  });
  const byProduct = new Map<string, number>();
  for (const m of movements) {
    byProduct.set(
      m.productId,
      (byProduct.get(m.productId) ?? 0) + Math.abs(m.quantityTins)
    );
  }
  const products = await prisma.product.findMany({
    where: { id: { in: [...byProduct.keys()] } },
    select: { id: true, prCode: true, name: true, unit: true },
  });
  const rows = products
    .map((p) => ({
      productId: p.id,
      prCode: p.prCode,
      name: p.name,
      unit: p.unit,
      units: round2(byProduct.get(p.id) ?? 0),
    }))
    .sort((a, b) => b.units - a.units);
  return Response.json({ month, rows });
}

/** Delete movements, restoring lot stock for lot-linked rows. */
async function removeMovements(where: object): Promise<number> {
  const movements = await prisma.stockMovement.findMany({
    where,
    select: { id: true, lotId: true, quantityTins: true },
  });
  if (movements.length === 0) return 0;
  await prisma.$transaction(async (tx) => {
    for (const movement of movements) {
      if (movement.lotId) {
        const lot = await tx.stockLot.findUnique({
          where: { id: movement.lotId },
        });
        if (lot) {
          const restored = round2(
            lot.quantityTins + Math.abs(movement.quantityTins)
          );
          await tx.stockLot.update({
            where: { id: lot.id },
            data: {
              quantityTins: restored,
              status:
                lot.status === "consumed" && restored > 0
                  ? "in_stock"
                  : lot.status,
            },
          });
        }
      }
      await tx.stockMovement.delete({ where: { id: movement.id } });
    }
  });
  return movements.length;
}

export async function DELETE(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const month = params.get("month");
  const productId = params.get("productId");
  if (!month || !MONTH_RE.test(month)) {
    return Response.json({ error: "Invalid month" }, { status: 400 });
  }
  const range = monthRange(month);
  const deleted = await removeMovements({
    ...demandFilter,
    date: { gte: range.gte, lt: range.lt },
    ...(productId ? { productId } : {}),
  });
  return Response.json({ ok: true, deleted });
}

const putSchema = z.object({
  month: z.string().regex(MONTH_RE),
  productId: z.string().min(1),
  tins: z.number().nonnegative().max(100_000),
});

export async function PUT(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const { month, productId, tins } = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  const range = monthRange(month);
  const deleted = await removeMovements({
    ...demandFilter,
    productId,
    date: { gte: range.gte, lt: range.lt },
  });

  let created = 0;
  if (tins > 0) {
    const chunks = spreadMonthlyQuantity(month, tins);
    await prisma.stockMovement.createMany({
      data: chunks.map((chunk) => ({
        productId,
        lotId: null,
        type: "sale",
        channel: "food_service",
        quantityTins: -chunk.tins,
        gramsEquivalent: -round2(chunk.tins * (product.gramsPerUnit ?? 0)),
        date: new Date(`${chunk.date}T12:00:00.000Z`),
        note: `Manual correction (${month} monthly total)`,
      })),
    });
    created = chunks.length;
  }
  return Response.json({ ok: true, deleted, created });
}
