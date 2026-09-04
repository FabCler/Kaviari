import { prisma } from "@/lib/db";
import { currentScope } from "@/lib/scm/guard";
import { narrowScope } from "@/lib/scm/channels";
import { can } from "@/lib/scm/permissions";
import { demandBoard } from "@/lib/scm/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { NoAccess } from "@/components/scm/no-access";
import { ChannelFilter } from "@/components/scm/channel-filter";
import { OrderBoard } from "@/components/scm/purchasing/order-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Purchase planning — Kaviari Cellar" };

/**
 * §2 — everything still to buy: demand with no PO, or with a PO that does
 * not cover the requested quantity. Purchasing selects lines, picks a
 * supplier and issues one PO.
 */
export default async function OrderManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const context = await currentScope();
  if (!context) return <NoAccess what="purchase planning" />;
  const { actor, scope } = context;
  if (!can(actor, "purchasing.view")) return <NoAccess what="purchase planning" />;

  const filters = await searchParams;

  const visible = narrowScope(scope, filters.channel);

  const [rows, suppliers] = await Promise.all([
    demandBoard({
      channelIds: visible.all ? null : visible.ids,
    }),
    prisma.supplier.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Purchase planning"
        description="Required, already ordered and still remaining — per demand line, across every business channel."
      />

      <div className="mb-4">
        <ChannelFilter channels={scope.channels} />
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Every demand line is covered by a purchase order.
          </CardContent>
        </Card>
      ) : (
        <OrderBoard
          rows={rows.map((row) => ({
            ...row,
            deliveryDate: row.deliveryDate.toISOString(),
          }))}
          suppliers={suppliers.map((supplier) => ({
            id: supplier.id,
            code: supplier.code,
            name: supplier.name,
            currency: supplier.currency,
            defaultUnit: supplier.defaultUnit,
            moq: supplier.moq,
          }))}
          canCreate={can(actor, "purchasing.createPo")}
        />
      )}
    </div>
  );
}
