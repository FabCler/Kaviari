import { prisma } from "@/lib/db";
import { getStockOverview, type ProductStockView } from "@/lib/stock";
import {
  nextOrderDate,
  replenishmentSuggestion,
  type ReplenishmentSuggestion,
} from "@/lib/replenishment";
import { OPEN_PO_STATUSES } from "@/lib/domain";
import { getUpcomingForecasts } from "@/lib/forecasts";
import type { AppSettings } from "@/lib/settings";

export interface PlannerRow extends ProductStockView {
  suggestion: ReplenishmentSuggestion;
  /** Team forecast per upcoming month (index 0 = current month), 3 entries. */
  forecastMonths: number[];
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
  /** Short labels of the 3 upcoming forecast months, e.g. ["Aug","Sep","Oct"]. */
  forecastMonthLabels: string[];
}

export async function getPlannerData(now = new Date()): Promise<PlannerData> {
  const [overview, forecasts] = await Promise.all([
    getStockOverview({ now }),
    getUpcomingForecasts(3, now),
  ]);
  const { settings } = overview;

  const rows: PlannerRow[] = overview.rows.map((row) => ({
    ...row,
    suggestion: replenishmentSuggestion(
      {
        aduUnitsPerDay: row.aduUnitsPerDay,
        onHandUnits: row.onHandUnits,
        onOrderUnits: row.onOrderUnits,
        packingPerBox: row.product.packingPerBox,
      },
      settings
    ),
    forecastMonths: forecasts.byProduct.get(row.product.id) ?? [0, 0, 0],
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
      (sum, row) => sum + row.suggestion.suggestedUnits * row.product.unitCost,
      0
    ),
    openPoCount,
    forecastMonthLabels: forecasts.monthLabels,
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
