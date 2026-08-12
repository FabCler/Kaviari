import { prisma } from "@/lib/db";
import { getSettings, type AppSettings } from "@/lib/settings";
import {
  computeAduUnitsPerDay,
  daysOfCover,
  type DemandEvent,
} from "@/lib/replenishment";
import { DEMAND_MOVEMENT_TYPES, OPEN_PO_STATUSES } from "@/lib/domain";
import type { Product } from "@prisma/client";

export interface ProductStockView {
  product: Product;
  /** On hand in the product's stock unit (tins for caviar). */
  onHandUnits: number;
  /** kg reference (0 when the product has no gramsPerUnit). */
  onHandGrams: number;
  onOrderUnits: number;
  aduUnitsPerDay: number;
  aduIsOverride: boolean;
  daysOfCover: number | null;
  weeksOfCover: number | null;
  stockValue: number;
}

export interface StockOverview {
  settings: AppSettings;
  rows: ProductStockView[];
  totals: {
    units: number;
    grams: number;
    value: number;
    daysOfCover: number | null;
  };
}

/**
 * One consistent snapshot used by the dashboard, inventory, order planner
 * and AI assistant: on-hand from in-stock lots, pipeline from open POs,
 * ADU (units/day) from demand movements over the configured trailing window.
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
      select: { productId: true, quantityTins: true, date: true },
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
    list.push({ units: Math.abs(movement.quantityTins), date: movement.date });
    demandByProduct.set(movement.productId, list);
  }

  const rows: ProductStockView[] = products.map((product) => {
    const onHandUnits = lotsByProduct.get(product.id) ?? 0;
    const adu = computeAduUnitsPerDay(
      demandByProduct.get(product.id) ?? [],
      settings.aduWindowDays,
      now,
      product.aduOverrideUnitsPerDay
    );
    const cover = daysOfCover(onHandUnits, adu);
    return {
      product,
      onHandUnits,
      onHandGrams: onHandUnits * (product.gramsPerUnit ?? 0),
      onOrderUnits: onOrderByProduct.get(product.id) ?? 0,
      aduUnitsPerDay: adu,
      aduIsOverride: product.aduOverrideUnitsPerDay != null,
      daysOfCover: cover,
      weeksOfCover: cover == null ? null : cover / 7,
      stockValue: onHandUnits * product.unitCost,
    };
  });

  const totals = rows.reduce(
    (acc, row) => {
      acc.units += row.onHandUnits;
      acc.grams += row.onHandGrams;
      acc.value += row.stockValue;
      acc.adu += row.aduUnitsPerDay;
      return acc;
    },
    { units: 0, grams: 0, value: 0, adu: 0 }
  );

  return {
    settings,
    rows,
    totals: {
      units: totals.units,
      grams: totals.grams,
      value: totals.value,
      daysOfCover: totals.adu > 0 ? totals.units / totals.adu : null,
    },
  };
}

export interface ExpiringLotView {
  lotId: string;
  lotNumber: string;
  productId: string;
  productName: string;
  unit: string;
  gramsPerUnit: number | null;
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
    unit: lot.product.unit,
    gramsPerUnit: lot.product.gramsPerUnit,
    quantityTins: lot.quantityTins,
    expiryDate: lot.expiryDate,
    daysLeft: Math.ceil((lot.expiryDate.getTime() - now.getTime()) / 86_400_000),
  }));
}
