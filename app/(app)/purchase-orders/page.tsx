import Link from "next/link";
import { PackageOpen } from "lucide-react";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { OPEN_PO_STATUSES, type PoStatus } from "@/lib/domain";
import { daysUntil, formatDate, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PoStatusBadge } from "@/components/purchase-orders/po-status-badge";
import { NewPoButton } from "@/components/purchase-orders/new-po-button";

export const dynamic = "force-dynamic";

export const metadata = { title: "Purchase Orders — Kaviari Cellar" };

const STATUS_ORDER: Record<PoStatus, number> = {
  draft: 0,
  sent: 1,
  confirmed: 2,
  received: 3,
  cancelled: 4,
};

function DeliveryInfo({
  status,
  expectedDeliveryDate,
  receivedDate,
}: {
  status: string;
  expectedDeliveryDate: Date;
  receivedDate: Date | null;
}) {
  if (status === "received" && receivedDate) {
    const lateDays = Math.round(
      (receivedDate.getTime() - expectedDeliveryDate.getTime()) / 86_400_000
    );
    return (
      <span className="text-xs text-muted-foreground">
        {lateDays > 0 ? (
          <span className="text-warning">arrived {lateDays} d late</span>
        ) : (
          <span className="text-success">arrived on time</span>
        )}
      </span>
    );
  }
  if (status === "sent" || status === "confirmed") {
    const days = daysUntil(expectedDeliveryDate);
    return days < 0 ? (
      <span className="text-xs font-medium text-destructive">
        overdue by {Math.abs(days)} d
      </span>
    ) : (
      <span className="text-xs text-muted-foreground">
        in {days} {days === 1 ? "day" : "days"}
      </span>
    );
  }
  return null;
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ receive?: string }>;
}) {
  const { receive } = await searchParams;
  const receiveMode = receive === "1";

  const [orders, settings] = await Promise.all([
    prisma.purchaseOrder.findMany({
      include: { lines: true },
      orderBy: { orderDate: "desc" },
    }),
    getSettings(),
  ]);

  const sorted = [...orders].sort((a, b) => {
    const ga = STATUS_ORDER[a.status as PoStatus] ?? 9;
    const gb = STATUS_ORDER[b.status as PoStatus] ?? 9;
    if (ga !== gb) return ga - gb;
    return b.orderDate.getTime() - a.orderDate.getTime();
  });

  const openCount = orders.filter((o) =>
    OPEN_PO_STATUSES.includes(o.status as PoStatus)
  ).length;

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        description={
          openCount > 0
            ? `${openCount} open ${openCount === 1 ? "order" : "orders"} counted as pipeline stock in the planner.`
            : "Orders placed with Kaviari — drafts, pipeline and history."
        }
        actions={
          <>
            <NewPoButton />
            <Button variant="gold" asChild>
              <Link href="/planner">Open the planner</Link>
            </Button>
          </>
        }
      />

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <PackageOpen
              className="size-10 text-muted-foreground/60"
              aria-hidden
            />
            <p className="font-medium">No purchase orders yet</p>
            <p className="max-w-md text-sm text-muted-foreground">
              The Order Planner watches your consumption and suggests exactly
              what to reorder. Create your first draft from its suggestions.
            </p>
            <Button variant="gold" asChild>
              <Link href="/planner">Go to the Order Planner</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-2">
          <CardContent className="px-2 sm:px-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ordered</TableHead>
                  <TableHead>Expected delivery</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((po) => {
                  const isOpen = OPEN_PO_STATUSES.includes(
                    po.status as PoStatus
                  );
                  const value = po.lines.reduce(
                    (sum, line) => sum + line.quantityTins * line.unitCost,
                    0
                  );
                  return (
                    <TableRow
                      key={po.id}
                      className={
                        receiveMode && isOpen ? "bg-gold/[0.06]" : undefined
                      }
                    >
                      <TableCell>
                        <Link
                          href={`/purchase-orders/${po.id}`}
                          className="font-medium hover:underline"
                        >
                          {po.reference}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <PoStatusBadge status={po.status} />
                      </TableCell>
                      <TableCell className="tnum">
                        {formatDate(po.orderDate)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="tnum">
                            {formatDate(po.expectedDeliveryDate)}
                          </span>
                          <DeliveryInfo
                            status={po.status}
                            expectedDeliveryDate={po.expectedDeliveryDate}
                            receivedDate={po.receivedDate}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right tnum">
                        {po.lines.length}
                      </TableCell>
                      <TableCell className="text-right tnum">
                        {formatMoney(value, settings.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {po.status === "confirmed" || (receiveMode && isOpen) ? (
                          <Button variant="gold" size="sm" asChild>
                            <Link href={`/purchase-orders/${po.id}?receive=1`}>
                              Receive
                            </Link>
                          </Button>
                        ) : po.status === "draft" ? (
                          <Badge variant="outline">editable</Badge>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
