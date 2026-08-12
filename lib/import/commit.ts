import { prisma } from "@/lib/db";
import { allocateFefo } from "@/lib/fefo";
import type { z } from "zod";
import type {
  commitPriceListSchema,
  commitSalesSchema,
  commitStockTakeSchema,
} from "@/lib/import/schemas";
import type { CommitResult } from "@/lib/import/types";

/**
 * Commit handlers — the only place an import writes to the DB. Every commit
 * runs in ONE transaction, re-verifies ids against the DB and recomputes all
 * derived quantities (system stock, deltas, FEFO allocations) server-side.
 */

const TX_OPTIONS = { timeout: 30_000 } as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- price list

type PriceListRows = z.infer<typeof commitPriceListSchema>["rows"];

export async function commitPriceList(rows: PriceListRows): Promise<CommitResult> {
  const warnings: string[] = [];
  const stamp = Date.now().toString(36).toUpperCase();

  const result = await prisma.$transaction(async (tx) => {
    let created = 0;
    let updated = 0;

    for (const [index, row] of rows.entries()) {
      const name = row.name.trim();
      const unitCost = round2(row.unitCost);

      // Resolve the target product fresh, inside the transaction.
      let target = row.matchedProductId
        ? await tx.product.findUnique({ where: { id: row.matchedProductId } })
        : null;
      if (row.matchedProductId && !target) {
        warnings.push(`"${name}": matched product no longer exists — skipped.`);
        continue;
      }
      if (!target && row.prCode) {
        // Race guard: a product with this code may exist even if the
        // analysis said "new".
        target = await tx.product.findUnique({
          where: { prCode: row.prCode.trim() },
        });
      }

      if (target) {
        if (Math.abs(target.unitCost - unitCost) <= 0.005) continue; // unchanged
        await tx.product.update({
          where: { id: target.id },
          data: {
            unitCost,
            name,
            caviarType: row.caviarType ?? target.caviarType,
            currency: row.currency,
          },
        });
        updated += 1;
      } else {
        await tx.product.create({
          data: {
            prCode: row.prCode?.trim() || `IMP-${stamp}-${index + 1}`,
            name,
            caviarType: row.caviarType,
            gramsPerUnit: row.gramsPerUnit,
            unitCost,
            currency: row.currency,
            category: "Caviar",
            active: true,
            isPlaceholder: false,
          },
        });
        created += 1;
      }
    }

    return { created, updated };
  }, TX_OPTIONS);

  return { ...result, movements: 0, warnings };
}

// ---------------------------------------------------------------- stock take

type StockTakeRows = z.infer<typeof commitStockTakeSchema>["rows"];

export async function commitStockTake(rows: StockTakeRows): Promise<CommitResult> {
  const warnings: string[] = [];
  const now = new Date();
  const note = "Stock take import";

  // Sum duplicates so one product gets exactly one reconciliation.
  const countedByProduct = new Map<string, number>();
  for (const row of rows) {
    countedByProduct.set(
      row.productId,
      (countedByProduct.get(row.productId) ?? 0) + row.countedTins
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    let created = 0;
    let updatedProducts = 0;
    let movements = 0;

    for (const [productId, countedRaw] of countedByProduct) {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) {
        warnings.push(`Unknown product id ${productId} — skipped.`);
        continue;
      }
      const counted = round2(countedRaw);

      const lots = await tx.stockLot.findMany({
        where: { productId, status: "in_stock", quantityTins: { gt: 0 } },
        orderBy: { expiryDate: "asc" },
      });
      const systemTins = round2(
        lots.reduce((sum, lot) => sum + lot.quantityTins, 0)
      );
      const delta = round2(counted - systemTins);
      if (Math.abs(delta) < 0.005) continue;

      if (delta > 0) {
        // Surplus: add to the most recently received lot, or open an
        // adjustment lot when the product has no stock at all.
        const newest = [...lots].sort(
          (a, b) => b.receivedDate.getTime() - a.receivedDate.getTime()
        )[0];
        let lotId: string;
        if (newest) {
          await tx.stockLot.update({
            where: { id: newest.id },
            data: { quantityTins: round2(newest.quantityTins + delta) },
          });
          lotId = newest.id;
        } else {
          const lot = await tx.stockLot.create({
            data: {
              productId,
              lotNumber: `ADJ-${isoDay(now)}`,
              quantityTins: delta,
              receivedTins: delta,
              receivedDate: now,
              expiryDate: new Date(now.getTime() + 120 * 86_400_000),
              status: "in_stock",
            },
          });
          lotId = lot.id;
          created += 1;
        }
        await tx.stockMovement.create({
          data: {
            productId,
            lotId,
            type: "adjustment",
            quantityTins: delta,
            gramsEquivalent: round2(delta * (product.gramsPerUnit ?? 0)),
            date: now,
            note,
          },
        });
        movements += 1;
      } else {
        // Shrinkage: consume FEFO across lots.
        const needed = Math.abs(delta);
        const { allocations, shortfallTins } = allocateFefo(lots, needed);
        if (shortfallTins > 0) {
          warnings.push(
            `${product.name}: count implied removing ${needed} tins but only ${round2(needed - shortfallTins)} were in stock — floored at zero.`
          );
        }
        const lotById = new Map(lots.map((lot) => [lot.id, lot]));
        for (const alloc of allocations) {
          const lot = lotById.get(alloc.lotId);
          if (!lot) continue;
          const remaining = round2(lot.quantityTins - alloc.tins);
          await tx.stockLot.update({
            where: { id: lot.id },
            data: {
              quantityTins: Math.max(0, remaining),
              status: remaining <= 0 ? "consumed" : "in_stock",
            },
          });
          await tx.stockMovement.create({
            data: {
              productId,
              lotId: lot.id,
              type: "adjustment",
              quantityTins: -alloc.tins,
              gramsEquivalent: -round2(alloc.tins * (product.gramsPerUnit ?? 0)),
              date: now,
              note,
            },
          });
          movements += 1;
        }
      }
      updatedProducts += 1;
    }

    return { created, updated: updatedProducts, movements };
  }, TX_OPTIONS);

  return { ...result, warnings };
}

// -------------------------------------------------------------- sales export

type SalesRows = z.infer<typeof commitSalesSchema>["rows"];

export async function commitSalesExport(rows: SalesRows): Promise<CommitResult> {
  const warnings: string[] = [];

  // Chronological order so FEFO allocation follows the real sequence.
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));

  const result = await prisma.$transaction(async (tx) => {
    let movements = 0;

    const productIds = [...new Set(ordered.map((row) => row.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    // Mutable in-memory lot state per product, FEFO-sorted; final quantities
    // are written once per touched lot at the end.
    const lots = await tx.stockLot.findMany({
      where: {
        productId: { in: productIds },
        status: "in_stock",
        quantityTins: { gt: 0 },
      },
      orderBy: { expiryDate: "asc" },
    });
    const lotState = new Map<
      string,
      { id: string; quantityTins: number; expiryDate: Date }[]
    >();
    for (const lot of lots) {
      const list = lotState.get(lot.productId) ?? [];
      list.push({
        id: lot.id,
        quantityTins: lot.quantityTins,
        expiryDate: lot.expiryDate,
      });
      lotState.set(lot.productId, list);
    }
    const touchedLotIds = new Set<string>();

    for (const row of ordered) {
      const product = productById.get(row.productId);
      if (!product) {
        warnings.push(`Unknown product id ${row.productId} — row skipped.`);
        continue;
      }
      const state = lotState.get(row.productId) ?? [];
      const { allocations, shortfallTins } = allocateFefo(state, row.tins);
      if (shortfallTins > 0) {
        warnings.push(
          `${product.name} on ${row.date}: ${row.tins} tins requested, only ${round2(row.tins - shortfallTins)} in stock — the shortfall was not recorded.`
        );
      }
      const date = new Date(`${row.date}T12:00:00.000Z`);
      for (const alloc of allocations) {
        const lot = state.find((l) => l.id === alloc.lotId);
        if (!lot) continue;
        lot.quantityTins = round2(lot.quantityTins - alloc.tins);
        touchedLotIds.add(lot.id);
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            lotId: lot.id,
            type: "sale",
            channel: row.channel,
            quantityTins: -alloc.tins,
            gramsEquivalent: -round2(alloc.tins * (product.gramsPerUnit ?? 0)),
            date,
            note: row.note ?? "Sales export import",
          },
        });
        movements += 1;
      }
    }

    for (const [, state] of lotState) {
      for (const lot of state) {
        if (!touchedLotIds.has(lot.id)) continue;
        const remaining = Math.max(0, round2(lot.quantityTins));
        await tx.stockLot.update({
          where: { id: lot.id },
          data: {
            quantityTins: remaining,
            status: remaining <= 0 ? "consumed" : "in_stock",
          },
        });
      }
    }

    return { created: 0, updated: 0, movements };
  }, TX_OPTIONS);

  return { ...result, warnings };
}
