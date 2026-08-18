import { subDays } from "date-fns";
import { prisma } from "@/lib/db";
import { getStockOverview } from "@/lib/stock";
import { DEMAND_MOVEMENT_TYPES } from "@/lib/domain";
import { getUpcomingForecasts } from "@/lib/forecasts";
import { shortProductName } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { InventoryTable } from "@/components/inventory/inventory-table";
import type { InventoryRow } from "@/components/inventory/types";

export default async function InventoryPage() {
  const now = new Date();
  const [overview, forecasts, consumedGroups] = await Promise.all([
    getStockOverview({ now }),
    getUpcomingForecasts(3, now),
    // Units consumed over the last 30 days per product: demand movements are
    // recorded with negative quantities, so sum and flip the sign.
    prisma.stockMovement.groupBy({
      by: ["productId"],
      where: {
        type: { in: [...DEMAND_MOVEMENT_TYPES] },
        quantityTins: { lt: 0 },
        date: { gte: subDays(now, 30), lte: now },
      },
      _sum: { quantityTins: true },
    }),
  ]);

  const consumedByProduct = new Map(
    consumedGroups.map((g) => [
      g.productId,
      Math.abs(g._sum.quantityTins ?? 0),
    ])
  );

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
    consumed30dUnits: consumedByProduct.get(row.product.id) ?? 0,
    forecastMonths: forecasts.byProduct.get(row.product.id) ?? [0, 0, 0],
    aduUnitsPerDay: row.aduUnitsPerDay,
    aduIsOverride: row.aduIsOverride,
    aduOverrideUnitsPerDay: row.product.aduOverrideUnitsPerDay,
    weeksOfCover: row.weeksOfCover,
    stockValue: row.stockValue,
  }));

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="On-hand stock, lots and weekly cover across the cellar"
      />
      <InventoryTable rows={rows} forecastMonthLabels={forecasts.monthLabels} />
    </div>
  );
}
