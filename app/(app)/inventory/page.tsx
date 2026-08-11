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
    kaviariCode: row.product.kaviariCode,
    name: row.product.name,
    shortName: shortProductName(row.product.name),
    grade: row.product.grade,
    category: row.product.category,
    tinSizeGrams: row.product.tinSizeGrams,
    unitCost: row.product.unitCost,
    onHandTins: row.onHandTins,
    onHandGrams: row.onHandGrams,
    onOrderTins: row.onOrderTins,
    onOrderGrams: row.onOrderGrams,
    aduGramsPerDay: row.aduGramsPerDay,
    aduIsOverride: row.aduIsOverride,
    aduOverrideGramsPerDay: row.product.aduOverrideGramsPerDay,
    daysOfCover: row.daysOfCover,
    stockValue: row.stockValue,
  }));

  const expiring: ExpiringLotRow[] = expiringLots.map((lot) => ({
    lotId: lot.lotId,
    lotNumber: lot.lotNumber,
    productId: lot.productId,
    productName: shortProductName(lot.productName),
    tinSizeGrams: lot.tinSizeGrams,
    quantityTins: lot.quantityTins,
    expiryDate: lot.expiryDate.toISOString(),
    daysLeft: lot.daysLeft,
  }));

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="On-hand stock, lots and daily usage across the cellar"
      />
      <InventoryTable
        rows={rows}
        expiring={expiring}
        currency={overview.settings.currency}
        expiryAlertDays={overview.settings.expiryAlertDays}
        initialView={filter === "expiring" ? "expiring" : "caviar"}
      />
    </div>
  );
}
