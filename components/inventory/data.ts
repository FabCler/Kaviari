import { subDays } from "date-fns";
import { prisma } from "@/lib/db";
import { getStockOverview } from "@/lib/stock";
import { DEMAND_MOVEMENT_TYPES } from "@/lib/domain";
import { getUpcomingForecasts } from "@/lib/forecasts";
import { shortProductName } from "@/lib/format";
import type { InventoryRow } from "@/components/inventory/types";

/**
 * Server-side loader shared by the Inventory page and the Excel export so
 * both see identical rows.
 */
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export async function loadInventoryRows(now = new Date()): Promise<{
  rows: InventoryRow[];
  forecastMonthLabels: string[];
  /** Short labels for the consumption columns: current and previous month. */
  consumedMonthLabels: { current: string; previous: string };
}> {
  const currentMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const prevMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
  );

  const consumedByProduct = async (gte: Date, lt: Date) => {
    // Demand movements are recorded with negative quantities, so sum and
    // flip the sign.
    const groups = await prisma.stockMovement.groupBy({
      by: ["productId"],
      where: {
        type: { in: [...DEMAND_MOVEMENT_TYPES] },
        quantityTins: { lt: 0 },
        date: { gte, lt },
      },
      _sum: { quantityTins: true },
    });
    return new Map(
      groups.map((g) => [g.productId, Math.abs(g._sum.quantityTins ?? 0)])
    );
  };

  const [overview, forecasts, consumedThisMonth, consumedPrevMonth, consumed30d] =
    await Promise.all([
      getStockOverview({ now }),
      getUpcomingForecasts(3, now),
      consumedByProduct(currentMonthStart, now),
      consumedByProduct(prevMonthStart, currentMonthStart),
      consumedByProduct(subDays(now, 30), now),
    ]);

  const rows: InventoryRow[] = overview.rows.map((row) => ({
    productId: row.product.id,
    prCode: row.product.prCode,
    name: row.product.name,
    shortName: shortProductName(row.product.name),
    caviarType: row.product.caviarType,
    category: row.product.category,
    unit: row.product.unit,
    gramsPerUnit: row.product.gramsPerUnit,
    unitCost: row.product.unitCost,
    onHandUnits: row.onHandUnits,
    onOrderUnits: row.onOrderUnits,
    consumedThisMonthUnits: consumedThisMonth.get(row.product.id) ?? 0,
    consumedPrevMonthUnits: consumedPrevMonth.get(row.product.id) ?? 0,
    consumed30dUnits: consumed30d.get(row.product.id) ?? 0,
    forecastMonths: forecasts.byProduct.get(row.product.id) ?? [0, 0, 0],
    aduUnitsPerDay: row.aduUnitsPerDay,
    aduIsOverride: row.aduIsOverride,
    aduOverrideUnitsPerDay: row.product.aduOverrideUnitsPerDay,
    weeksOfCover: row.weeksOfCover,
    stockValue: row.stockValue,
  }));

  return {
    rows,
    forecastMonthLabels: forecasts.monthLabels,
    consumedMonthLabels: {
      current: MONTH_NAMES[now.getUTCMonth()],
      previous: MONTH_NAMES[prevMonthStart.getUTCMonth()],
    },
  };
}
