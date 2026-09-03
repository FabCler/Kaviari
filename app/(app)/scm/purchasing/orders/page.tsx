import { prisma } from "@/lib/db";
import { currentActor } from "@/lib/scm/guard";
import { can } from "@/lib/scm/permissions";
import { demandBoard } from "@/lib/scm/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { NoAccess } from "@/components/scm/no-access";
import { OrderBoard } from "@/components/scm/purchasing/order-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order management — Kaviari Cellar" };

/**
 * §2 — everything still to buy: demand with no PO, or with a PO that does
 * not cover the requested quantity. Purchasing selects lines, picks a
 * supplier and issues one PO.
 */
export default async function OrderManagementPage() {
  const actor = (await currentActor())!;
  if (!can(actor, "purchasing.view")) return <NoAccess what="order management" />;

  const [rows, suppliers] = await Promise.all([
    demandBoard(),
    prisma.supplier.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Order management"
        description="PR and SO lines with no purchase order, or a purchase order that does not cover the demand."
      />

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
