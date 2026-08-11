import { prisma } from "@/lib/db";
import { getStockOverview, type ProductStockView } from "@/lib/stock";
import {
  nextOrderDate,
  replenishmentSuggestion,
  type ReplenishmentSuggestion,
} from "@/lib/replenishment";
import { OPEN_PO_STATUSES } from "@/lib/domain";
import type { AppSettings } from "@/lib/settings";

export interface PlannerRow extends ProductStockView {
  suggestion: ReplenishmentSuggestion;
}

export interface PlannerData {
  settings: AppSettings;
  now: Date;
  lastOrderDate: Date | null;
  nextOrderDate: Date | null;
  /** Negative = overdue by that many days. */
  daysUntilOrder: number | null;
  orderDue: boolean;
  rows: PlannerRow[];
  totalSuggestedValue: number;
  openPoCount: number;
}

export async function getPlannerData(now = new Date()): Promise<PlannerData> {
  const overview = await getStockOverview({ now });
  const { settings } = overview;

  const rows: PlannerRow[] = overview.rows.map((row) => ({
    ...row,
    suggestion: replenishmentSuggestion(
      {
        aduGramsPerDay: row.aduGramsPerDay,
        onHandGrams: row.onHandGrams,
        onOrderGrams: row.onOrderGrams,
        tinSizeGrams: row.product.tinSizeGrams,
      },
      settings
    ),
  }));

  const lastOrderDate = settings.lastOrderDate
    ? new Date(settings.lastOrderDate)
    : null;
  const next = lastOrderDate
    ? nextOrderDate(lastOrderDate, settings.reviewPeriodDays)
    : null;
  const daysUntilOrder = next
    ? Math.ceil((next.getTime() - now.getTime()) / 86_400_000)
    : null;

  const openPoCount = await prisma.purchaseOrder.count({
    where: { status: { in: [...OPEN_PO_STATUSES] } },
  });

  return {
    settings,
    now,
    lastOrderDate,
    nextOrderDate: next,
    daysUntilOrder,
    // No recorded order yet -> ordering is due immediately.
    orderDue: daysUntilOrder == null || daysUntilOrder <= 0,
    rows,
    totalSuggestedValue: rows.reduce(
      (sum, row) => sum + row.suggestion.suggestedTins * row.product.unitCost,
      0
    ),
    openPoCount,
  };
}

/** PO-20260811-01 style reference, unique per day. */
export async function nextPoReference(now = new Date()): Promise<string> {
  const stamp = now.toISOString().slice(0, 10).replaceAll("-", "");
  const prefix = `PO-${stamp}`;
  const existing = await prisma.purchaseOrder.count({
    where: { reference: { startsWith: prefix } },
  });
  return `${prefix}-${String(existing + 1).padStart(2, "0")}`;
}
