import { osms } from "@/lib/osms/db";
import { currentScope } from "@/lib/osms/guard";
import { narrowScope, channelWhere } from "@/lib/osms/channels";
import { can } from "@/lib/osms/permissions";
import { formatDate, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/osms/kpi-card";
import { NoAccess } from "@/components/osms/no-access";
import { ChannelFilter } from "@/components/osms/channel-filter";
import { ItemPickBoard } from "@/components/osms/sales/item-pick-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Item picks" };

/**
 * Flow §7 — sales decides which weighed piece goes to which customer.
 *
 * The warehouse has weighed ten fish; they are not ten equal fish. Sales looks
 * at the actual weights and matches them to the customers who are waiting,
 * then the warehouse packs exactly that. Until this screen is finished, no
 * shipment may include a single one of these pieces.
 */
export default async function ItemPicksPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const context = await currentScope();
  if (!context) return <NoAccess what="item picks" />;
  const { actor } = context;
  if (!can(actor, "sales.view")) return <NoAccess what="item picks" />;

  const filters = await searchParams;
  const scope = narrowScope(context.scope, filters.channel ?? null);

  const lines = await osms.receivingLine.findMany({
    where: {
      pickStatus: { in: ["awaiting_sales_pick", "picked"] },
      // A scoped sales user only sees the deliveries feeding their channels.
      poLine: {
        demandLinks: {
          some: { soLine: { so: { channelId: channelWhere(scope) } } },
        },
      },
    },
    include: {
      product: true,
      items: { orderBy: { itemNo: "asc" } },
      receiving: { select: { id: true, receiptNumber: true, receivedDate: true } },
      poLine: {
        include: {
          po: { select: { poNumber: true } },
          allocations: {
            where: { status: { not: "cancelled" } },
            include: {
              lines: {
                where: { target: "customer" },
                include: {
                  customer: { select: { name: true, channel: { select: { code: true } } } },
                  soLine: { select: { so: { select: { soNumber: true } } } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ pickStatus: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  const waiting = lines.filter((line) => line.pickStatus === "awaiting_sales_pick");
  const pieces = waiting.reduce((sum, line) => sum + line.items.length, 0);

  return (
    <div>
      <PageHeader
        title="Item picks"
        description="Weighed goods the warehouse has landed. Each piece weighs something different, so sales decides who gets which — then the warehouse packs exactly that."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <KpiCard
            label="Deliveries waiting"
            value={waiting.length}
            tone={waiting.length > 0 ? "warning" : "success"}
          />
          <KpiCard label="Pieces to place" value={pieces} />
          <KpiCard
            label="Picked"
            value={lines.length - waiting.length}
            tone="success"
          />
        </div>
        <ChannelFilter channels={context.scope.channels} />
      </div>

      {lines.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nothing waiting. Weighed goods appear here the moment the warehouse
            records their weights.
          </CardContent>
        </Card>
      ) : (
        <ItemPickBoard
          canPick={can(actor, "sales.pickItems")}
          lines={lines.map((line) => ({
            id: line.id,
            receiptNumber: line.receiving.receiptNumber,
            receivedDate: formatDate(line.receiving.receivedDate),
            poNumber: line.poLine.po.poNumber,
            productCode: line.product.code,
            productName: line.product.name,
            unit: line.unit,
            actualQuantity: line.actualQuantity,
            pickStatus: line.pickStatus,
            pickedByName: line.pickedByName,
            weighedTotal: Number(
              formatNumber(
                line.items.reduce((sum, item) => sum + item.weight, 0),
                3
              ).replace(/,/g, "")
            ),
            items: line.items.map((item) => ({
              id: item.id,
              itemNo: item.itemNo,
              weight: item.weight,
              unit: item.unit,
              condition: item.condition,
              allocationLineId: item.allocationLineId,
            })),
            customers: (line.poLine.allocations[0]?.lines ?? []).map((entry) => ({
              id: entry.id,
              name: entry.customer?.name ?? "Customer",
              channelCode: entry.customer?.channel?.code ?? null,
              soNumber: entry.soLine?.so.soNumber ?? null,
              allocated: entry.quantity,
            })),
          }))}
        />
      )}
    </div>
  );
}
