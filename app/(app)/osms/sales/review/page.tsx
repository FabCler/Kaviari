import { osms } from "@/lib/osms/db";
import { currentScope } from "@/lib/osms/guard";
import { narrowScope } from "@/lib/osms/channels";
import { can } from "@/lib/osms/permissions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/osms/kpi-card";
import { NoAccess } from "@/components/osms/no-access";
import { ChannelFilter } from "@/components/osms/channel-filter";
import { SalesReviewBoard } from "@/components/osms/sales/review-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sales review" };

/**
 * §4 — the confirmed PO/invoice quantity against the customer order.
 * Short deliveries need a customer decision; over-deliveries need a home.
 * Receiving stays blocked until every row here is completed (§21).
 */
export default async function SalesReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string; channel?: string }>;
}) {
  const context = await currentScope();
  if (!context) return <NoAccess what="the sales review queue" />;
  const { actor, scope } = context;
  if (!can(actor, "sales.view")) return <NoAccess what="the sales review queue" />;

  const filters = await searchParams;
  const visible = narrowScope(scope, filters.channel);
  const channelWhere = visible.all ? null : { channelId: { in: visible.ids } };

  const recons = await osms.soPoRecon.findMany({
    where: {
      ...(filters.po ? { poLine: { poId: filters.po } } : {}),
      ...(channelWhere ? { soLine: { so: channelWhere } } : {}),
    },
    include: {
      soLine: { include: { so: { include: { customer: true, channel: true } } } },
      poLine: { include: { po: { include: { supplier: true } } } },
      product: true,
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 300,
  });

  const pending = recons.filter(
    (row) => row.status === "pending_sales_review"
  ).length;
  const short = recons.filter((row) => row.diffStatus === "short").length;
  const over = recons.filter((row) => row.diffStatus === "over").length;

  return (
    <div>
      <PageHeader
        title="Invoice / PO vs Sales order"
        description="What the supplier actually delivered, compared with what the customer ordered."
      />

      <div className="mb-4">
        <ChannelFilter channels={scope.channels} />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Lines reviewed" value={recons.length} />
        <KpiCard
          label="Waiting for a decision"
          value={pending}
          tone={pending > 0 ? "danger" : "success"}
        />
        <KpiCard label="Short delivery" value={short} tone={short > 0 ? "warning" : "default"} />
        <KpiCard label="Over delivery" value={over} tone={over > 0 ? "warning" : "default"} />
      </div>

      {recons.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nothing to review — differences appear here once purchasing has
            confirmed a corrected quantity.
          </CardContent>
        </Card>
      ) : (
        <SalesReviewBoard
          canDecide={can(actor, "sales.reviewDifference")}
          rows={recons.map((row) => ({
            id: row.id,
            channelCode: row.soLine.so.channel?.code ?? null,
            channelName: row.soLine.so.channel?.name ?? null,
            soNumber: row.soLine.so.soNumber,
            soId: row.soLine.soId,
            customerName: row.soLine.so.customer.name,
            poNumber: row.poLine?.po.poNumber ?? null,
            poId: row.poLine?.poId ?? null,
            supplierName: row.poLine?.po.supplier.name ?? null,
            productCode: row.product.code,
            productName: row.product.name,
            unit: row.product.unit,
            soQuantity: row.soQuantity,
            originalQuantity: row.soLine.originalQuantity,
            confirmedQuantity: row.confirmedQuantity,
            diff: row.diff,
            diffPct: row.diffPct,
            diffStatus: row.diffStatus,
            status: row.status,
            decision: row.decision,
            reason: row.reason,
            customerAccepted: row.customerAccepted,
            newSoQuantity: row.newSoQuantity,
            reviewedByName: row.reviewedByName,
          }))}
        />
      )}
    </div>
  );
}
