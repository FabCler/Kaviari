import { prisma } from "@/lib/db";

/**
 * The app has two forecast sources that always count together:
 *  - CustomerForecast — the FS team's customer-level template rows
 *    (customer × product × month, stamped with who entered them);
 *  - Forecast — free product-level rows from the on-site editor (per user).
 *
 * Every consumer of "the forecast" (dashboard, inventory, planner,
 * consumption analysis, AI order, reports) reads through this helper so all
 * pages show the same numbers.
 */

export interface ForecastRow {
  productId: string;
  /** First day of the month, UTC midnight. */
  month: Date;
  quantity: number;
  /** The template uploader or editor owner; null when the account is gone. */
  userId: string | null;
  userName: string | null;
}

export async function getForecastRows(monthFilter?: {
  gte?: Date;
  lt?: Date;
  lte?: Date;
}): Promise<ForecastRow[]> {
  const where = monthFilter ? { month: monthFilter } : {};
  const [customer, free] = await Promise.all([
    prisma.customerForecast.findMany({
      where,
      select: {
        productId: true,
        month: true,
        quantity: true,
        enteredById: true,
        enteredBy: { select: { name: true } },
      },
    }),
    prisma.forecast.findMany({
      where,
      select: {
        productId: true,
        month: true,
        quantity: true,
        userId: true,
        user: { select: { name: true } },
      },
    }),
  ]);

  return [
    ...customer.map((row) => ({
      productId: row.productId,
      month: row.month,
      quantity: row.quantity,
      userId: row.enteredById,
      userName: row.enteredBy?.name ?? null,
    })),
    ...free.map((row) => ({
      productId: row.productId,
      month: row.month,
      quantity: row.quantity,
      userId: row.userId,
      userName: row.user.name,
    })),
  ];
}

/** productId → summed quantity, and month → summed quantity, over the rows. */
export function sumByProductMonth(rows: ForecastRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.productId}|${row.month.toISOString().slice(0, 7)}`;
    totals.set(
      key,
      Math.round(((totals.get(key) ?? 0) + row.quantity) * 100) / 100
    );
  }
  return totals;
}
