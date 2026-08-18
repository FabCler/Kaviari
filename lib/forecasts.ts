import { prisma } from "@/lib/db";

/**
 * Team forecasts for the upcoming months (summed across users), used by the
 * Inventory and Order Planner tables. Months start at the current calendar
 * month: index 0 = this month, 1 = next month, 2 = the month after.
 */

export interface UpcomingForecasts {
  /** Short month labels, e.g. ["Aug", "Sep", "Oct"]. */
  monthLabels: string[];
  /** productId -> per-month forecast units (same order as monthLabels). */
  byProduct: Map<string, number[]>;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export async function getUpcomingForecasts(
  monthsCount = 3,
  now = new Date()
): Promise<UpcomingForecasts> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthsCount, 1)
  );
  const monthLabels: string[] = [];
  for (let i = 0; i < monthsCount; i++) {
    monthLabels.push(
      MONTH_NAMES[new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)
      ).getUTCMonth()]
    );
  }

  const forecasts = await prisma.forecast.findMany({
    where: { month: { gte: start, lt: end } },
    select: { productId: true, month: true, quantity: true },
  });

  const byProduct = new Map<string, number[]>();
  for (const forecast of forecasts) {
    const index =
      (forecast.month.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      forecast.month.getUTCMonth() -
      start.getUTCMonth();
    if (index < 0 || index >= monthsCount) continue;
    const list = byProduct.get(forecast.productId) ?? Array(monthsCount).fill(0);
    list[index] = Math.round((list[index] + forecast.quantity) * 100) / 100;
    byProduct.set(forecast.productId, list);
  }
  return { monthLabels, byProduct };
}
