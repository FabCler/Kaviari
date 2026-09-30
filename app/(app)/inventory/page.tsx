import { PageHeader } from "@/components/page-header";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { loadInventoryRows } from "@/components/inventory/data";

export default async function InventoryPage() {
  const { rows, forecastMonthLabels } = await loadInventoryRows();

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="On-hand stock, lots and weekly cover across the cellar"
      />
      <InventoryTable rows={rows} forecastMonthLabels={forecastMonthLabels} />
    </div>
  );
}
