import { osms } from "@/lib/osms/db";
import { currentScope } from "@/lib/osms/guard";
import { narrowScope } from "@/lib/osms/channels";
import { can } from "@/lib/osms/permissions";
import { confirmedQuantity } from "@/lib/osms/reconcile";
import { getScmSettings } from "@/lib/osms/settings";
import { round } from "@/lib/osms/units";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/osms/kpi-card";
import { NoAccess } from "@/components/osms/no-access";
import { AllocationBoard } from "@/components/osms/sales/allocation-board";
import { ChannelFilter } from "@/components/osms/channel-filter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer allocation" };

/**
 * §6 — allocate what actually arrived. A line can only be completed when
 * customers + warehouse stock = actual, i.e. UNALLOCATED = 0.
 */
export default async function AllocationPage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string; channel?: string }>;
}) {
  const context = await currentScope();
  if (!context) return <NoAccess what="customer allocation" />;
  const { actor, scope } = context;
  if (!can(actor, "sales.view") && !can(actor, "warehouse.view")) {
    return <NoAccess what="customer allocation" />;
  }

  const filters = await searchParams;
  const visible = narrowScope(scope, filters.channel);
  const channelWhere = visible.all ? null : { channelId: { in: visible.ids } };
  const settings = await getScmSettings();

  const poLines = await osms.purchaseOrderLine.findMany({
    where: {
      ...(filters.po ? { poId: filters.po } : {}),
      recons: { some: { status: "approved" } },
      ...(channelWhere
        ? { demandLinks: { some: { soLine: { so: channelWhere } } } }
        : {}),
    },
    include: {
      po: { include: { supplier: true } },
      product: true,
      recons: true,
      soPoRecons: true,
      shortageCases: {
        where: { status: { in: ["open", "pending_approval"] } },
        select: { id: true, caseNumber: true },
      },
      demandLinks: {
        include: {
          soLine: { include: { so: { include: { customer: true, channel: true } } } },
        },
      },
      allocations: { include: { lines: { include: { customer: true } } } },
      receivingLines: { include: { items: true } },
    },
    orderBy: { deliveryDate: "asc" },
    take: 200,
  });

  const customers = await osms.customer.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  const rows = poLines.map((line) => {
    const recon = line.recons[0];
    const weighed = line.receivingLines.flatMap((receivingLine) => receivingLine.items);
    const actual =
      weighed.length > 0
        ? round(weighed.reduce((sum, item) => sum + item.weight, 0))
        : confirmedQuantity({
            poQuantity: line.baseQuantity,
            invoiceQuantity: recon?.invoiceQuantity,
            correctedQuantity: line.correctedQuantity ?? recon?.correctedQuantity,
            invoiceVerified: true,
          });
    const allocation = line.allocations[0] ?? null;

    return {
      poLineId: line.id,
      poId: line.poId,
      poNumber: line.po.poNumber,
      supplierName: line.po.supplier.name,
      productCode: line.product.code,
      productName: line.product.name,
      unit: line.product.unit,
      weightControlled: line.product.weightControlled,
      orderedQuantity: line.baseQuantity,
      actualQuantity: actual,
      openSalesReviews: line.soPoRecons.filter(
        (recon) => recon.status === "pending_sales_review"
      ).length,
      // A cross-channel shortage waiting for management blocks allocation
      // just as firmly as an open sales review (§20).
      openShortage: line.shortageCases[0]
        ? {
            id: line.shortageCases[0].id,
            caseNumber: line.shortageCases[0].caseNumber,
          }
        : null,
      demands: line.demandLinks
        .filter((link) => link.soLine)
        .map((link) => ({
          soLineId: link.soLine!.id,
          soNumber: link.soLine!.so.soNumber,
          customerId: link.soLine!.so.customerId,
          customerName: link.soLine!.so.customer.name,
          channelCode: link.soLine!.so.channel?.code ?? null,
          quantity: link.soLine!.confirmedQuantity ?? link.soLine!.quantity,
        })),
      allocation: allocation
        ? {
            id: allocation.id,
            allocationNumber: allocation.allocationNumber,
            status: allocation.status,
            unallocatedQuantity: allocation.unallocatedQuantity,
            lines: allocation.lines.map((allocationLine) => ({
              target: allocationLine.target as "customer" | "warehouse",
              customerId: allocationLine.customerId,
              soLineId: allocationLine.soLineId,
              quantity: allocationLine.quantity,
              storageLocation: allocationLine.storageLocation,
              reason: allocationLine.reason,
              responsibleDept: allocationLine.responsibleDept,
            })),
          }
        : null,
    };
  });

  const unallocated = rows.reduce(
    (sum, row) => sum + (row.allocation?.unallocatedQuantity ?? row.actualQuantity),
    0
  );
  const completed = rows.filter(
    (row) => row.allocation?.status === "completed"
  ).length;

  return (
    <div>
      <PageHeader
        title="Customer allocation"
        description="Assign the confirmed quantity to customers and to warehouse stock. Total allocation must equal the actual quantity."
      />

      <div className="mb-4">
        <ChannelFilter channels={scope.channels} />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KpiCard label="Lines to allocate" value={rows.length} />
        <KpiCard label="Completed" value={completed} tone="success" />
        <KpiCard
          label="Unallocated quantity"
          value={round(unallocated)}
          tone={unallocated > 0 ? "danger" : "success"}
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nothing to allocate — lines appear here once purchasing has approved
            the PO/Invoice reconciliation.
          </CardContent>
        </Card>
      ) : (
        <AllocationBoard
          rows={rows}
          customers={customers.map((customer) => ({
            id: customer.id,
            code: customer.code,
            name: customer.name,
          }))}
          defaultStorageLocation={settings.defaultStorageLocation}
          canAllocate={can(actor, "sales.allocate")}
        />
      )}
    </div>
  );
}
