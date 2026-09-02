import { prisma } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { loadAllLines } from "@/lib/workspace";
import { Empty, PageHeader } from "@/components/ui";
import { AllocationList } from "./allocation-list";

export const metadata = { title: "SO Adjustment" };

export default async function SoAdjustmentPage({
  searchParams,
}: {
  searchParams: Promise<{ shipment?: string }>;
}) {
  await requireSection("soadjust");
  const params = await searchParams;
  const shipments = await prisma.shipment.findMany({
    orderBy: [{ eta: "asc" }, { code: "asc" }],
  });
  const workspaces = await loadAllLines(
    params.shipment && params.shipment !== "all" ? params.shipment : undefined
  );
  const rows = workspaces.flatMap((w) =>
    w.lines
      .filter((l) => l.invQty || l.soRows.length)
      .map((line) => ({ line, shipmentId: w.shipment.id, tolerance: w.shipment.tolerancePct }))
  );

  return (
    <>
      <PageHeader
        title="Customer SO Adjustment"
        subtitle="The invoice quantity must equal the revised customer SO total plus any Sales-approved free stock before the line can be released."
      />

      <form className="card mb-5 flex flex-wrap gap-3" method="get">
        <div>
          <label className="label">Shipment</label>
          <select name="shipment" className="field w-56" defaultValue={params.shipment ?? "all"}>
            <option value="all">All shipments</option>
            {shipments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn btn-secondary">Apply</button>
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>Import PO, invoice and Sales Order data first.</Empty>
      ) : (
        <AllocationList
          rows={rows.map(({ line, shipmentId, tolerance }) => ({
            shipmentId,
            tolerance,
            key: line.key,
            itemKey: line.itemKey,
            supplierCode: line.supplierCode,
            supplierName: line.supplierName,
            shipmentCode: line.shipmentCode,
            mainCode: line.mainCode,
            itemDesc: line.itemDesc,
            status: line.status,
            uom: line.uom,
            invQty: line.invQty,
            soQty: line.soQty,
            revisedSoQty: line.revisedSoQty,
            freeQty: line.freeQty,
            balance: line.allocationBalance,
            soVar: line.soVar,
            pendingSap: line.pendingSapCount,
            soRows: line.soRows.map((r) => ({
              id: r.id,
              soNo: r.soNo,
              customer: r.customerName || r.customerCode,
              qty: r.qty,
              revisedQty: r.revisedQty,
              sapUpdated: r.sapUpdated,
              uom: r.uom,
            })),
          }))}
        />
      )}
    </>
  );
}
