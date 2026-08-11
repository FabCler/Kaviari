import { prisma } from "@/lib/db";
import { getSettings, type AppSettings } from "@/lib/settings";
import {
  computeAduGramsPerDay,
  daysOfCover,
  type DemandEvent,
} from "@/lib/replenishment";
import { DEMAND_MOVEMENT_TYPES, OPEN_PO_STATUSES } from "@/lib/domain";
import type { Product } from "@prisma/client";

export interface ProductStockView {
  product: Product;
  onHandTins: number;
  onHandGrams: number;
  onOrderTins: number;
  onOrderGrams: number;
  aduGramsPerDay: number;
  aduIsOverride: boolean;
  daysOfCover: number | null;
  stockValue: number;
}

export interface StockOverview {
  settings: AppSettings;
  rows: ProductStockView[];
  totals: {
    tins: number;
    grams: number;
    value: number;
    daysOfCover: number | null;
  };
}

/**
 * One consistent snapshot used by the dashboard, inventory, order planner
 * and AI assistant: on-hand from in-stock lots, pipeline from open POs,
 * ADU from demand movements over the configured trailing window.
 */
export async function getStockOverview(options?: {
  includeInactive?: boolean;
  now?: Date;
}): Promise<StockOverview> {
  const now = options?.now ?? new Date();
  const settings = await getSettings();
  const windowStart = new Date(
    now.getTime() - settings.aduWindowDays * 86_400_000
  );

  const [products, lots, openPoLines, demandMovements] = await Promise.all([
    prisma.product.findMany({
      where: options?.includeInactive ? {} : { active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.stockLot.findMany({
      where: { status: "in_stock", quantityTins: { gt: 0 } },
    }),
    prisma.purchaseOrderLine.findMany({
      where: { purchaseOrder: { status: { in: [...OPEN_PO_STATUSES] } } },
    }),
    prisma.stockMovement.findMany({
      where: {
        type: { in: [...DEMAND_MOVEMENT_TYPES] },
        date: { gte: windowStart, lte: now },
      },
      select: { productId: true, gramsEquivalent: true, date: true },
    }),
  ]);

  const lotsByProduct = new Map<string, number>();
  for (const lot of lots) {
    lotsByProduct.set(
      lot.productId,
      (lotsByProduct.get(lot.productId) ?? 0) + lot.quantityTins
    );
  }

  const onOrderByProduct = new Map<string, number>();
  for (const line of openPoLines) {
    onOrderByProduct.set(
      line.productId,
      (onOrderByProduct.get(line.productId) ?? 0) + line.quantityTins
    );
  }

  const demandByProduct = new Map<string, DemandEvent[]>();
  for (const movement of demandMovements) {
    const list = demandByProduct.get(movement.productId) ?? [];
    list.push({
      grams: Math.abs(movement.gramsEquivalent),
      date: movement.date,
    });
    demandByProduct.set(movement.productId, list);
  }

  const rows: ProductStockView[] = products.map((product) => {
    const onHandTins = lotsByProduct.get(product.id) ?? 0;
    const onHandGrams = onHandTins * product.tinSizeGrams;
    const onOrderTins = onOrderByProduct.get(product.id) ?? 0;
    const adu = computeAduGramsPerDay(
      demandByProduct.get(product.id) ?? [],
      settings.aduWindowDays,
      now,
      product.aduOverrideGramsPerDay
    );
    return {
      product,
      onHandTins,
      onHandGrams,
      onOrderTins,
      onOrderGrams: onOrderTins * product.tinSizeGrams,
      aduGramsPerDay: adu,
      aduIsOverride: product.aduOverrideGramsPerDay != null,
      daysOfCover: daysOfCover(onHandGrams, adu),
      stockValue: onHandTins * product.unitCost,
    };
  });

  const totals = rows.reduce(
    (acc, row) => {
      acc.tins += row.onHandTins;
      acc.grams += row.onHandGrams;
      acc.value += row.stockValue;
      acc.adu += row.aduGramsPerDay;
      return acc;
    },
    { tins: 0, grams: 0, value: 0, adu: 0 }
  );

  return {
    settings,
    rows,
    totals: {
      tins: totals.tins,
      grams: totals.grams,
      value: totals.value,
      daysOfCover: totals.adu > 0 ? totals.grams / totals.adu : null,
    },
  };
}

export interface ExpiringLotView {
  lotId: string;
  lotNumber: string;
  productId: string;
  productName: string;
  tinSizeGrams: number;
  quantityTins: number;
  expiryDate: Date;
  daysLeft: number;
}

export async function getExpiringLots(options?: {
  withinDays?: number;
  now?: Date;
}): Promise<ExpiringLotView[]> {
  const now = options?.now ?? new Date();
  const settings = await getSettings();
  const horizon = options?.withinDays ?? settings.expiryAlertDays;
  const limit = new Date(now.getTime() + horizon * 86_400_000);

  const lots = await prisma.stockLot.findMany({
    where: {
      status: "in_stock",
      quantityTins: { gt: 0 },
      expiryDate: { lte: limit },
    },
    include: { product: true },
    orderBy: { expiryDate: "asc" },
  });

  return lots.map((lot) => ({
    lotId: lot.id,
    lotNumber: lot.lotNumber,
    productId: lot.productId,
    productName: lot.product.name,
    tinSizeGrams: lot.product.tinSizeGrams,
    quantityTins: lot.quantityTins,
    expiryDate: lot.expiryDate,
    daysLeft: Math.ceil((lot.expiryDate.getTime() - now.getTime()) / 86_400_000),
  }));
}
