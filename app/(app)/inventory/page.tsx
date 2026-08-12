import { getExpiringLots, getStockOverview } from "@/lib/stock";
import { shortProductName } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { InventoryTable } from "@/components/inventory/inventory-table";
import type {
  ExpiringLotRow,
  InventoryRow,
} from "@/components/inventory/types";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const [overview, expiringLots] = await Promise.all([
    getStockOverview(),
    getExpiringLots(),
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
    aduUnitsPerDay: row.aduUnitsPerDay,
    aduIsOverride: row.aduIsOverride,
    aduOverrideUnitsPerDay: row.product.aduOverrideUnitsPerDay,
    weeksOfCover: row.weeksOfCover,
    stockValue: row.stockValue,
  }));

  const expiring: ExpiringLotRow[] = expiringLots.map((lot) => ({
    lotId: lot.lotId,
    lotNumber: lot.lotNumber,
    productId: lot.productId,
    productName: shortProductName(lot.productName),
    unit: lot.unit,
    gramsPerUnit: lot.gramsPerUnit,
    quantityTins: lot.quantityTins,
    expiryDate: lot.expiryDate.toISOString(),
    daysLeft: lot.daysLeft,
  }));

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="On-hand stock, lots and weekly cover across the cellar"
      />
      <InventoryTable
        rows={rows}
        expiring={expiring}
        currency={overview.settings.currency}
        expiryAlertDays={overview.settings.expiryAlertDays}
        initialView={filter === "expiring" ? "expiring" : "products"}
      />
    </div>
  );
}
