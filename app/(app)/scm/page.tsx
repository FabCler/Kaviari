import Link from "next/link";
import { ArrowRight, Bell, ShieldAlert } from "lucide-react";
import { prisma } from "@/lib/db";
import { currentActor } from "@/lib/scm/guard";
import { can, departmentOf } from "@/lib/scm/permissions";
import { dashboardMetrics } from "@/lib/scm/queries";
import { unreadFor } from "@/lib/scm/notify";
import { formatDate, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/scm/kpi-card";
import { StatusBadge, ToneBadge, documentTone, humanize } from "@/components/scm/status-badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Supply chain — Kaviari Cellar" };

/**
 * §9 — the management dashboard, with a section per department. Each tile
 * links straight to the queue it counts, so a number is never a dead end.
 */
export default async function ScmDashboardPage() {
  const actor = (await currentActor())!;
  const department = departmentOf(actor);

  const [metrics, notifications, blocked, exceptions] = await Promise.all([
    dashboardMetrics(),
    unreadFor(department, 8),
    prisma.scmPurchaseOrderLine.findMany({
      where: { status: { in: ["BLOCKED", "PENDING_SALES_REVIEW", "PENDING_ALLOCATION"] } },
      include: { po: { include: { supplier: true } }, product: true },
      orderBy: { deliveryDate: "asc" },
      take: 12,
    }),
    prisma.scmException.findMany({
      where: { status: { in: ["open", "in_progress"] } },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 8,
    }),
  ]);

  const showPurchasing = can(actor, "purchasing.view");
  const showSales = can(actor, "sales.view");
  const showWarehouse = can(actor, "warehouse.view");

  return (
    <div>
      <PageHeader
        title="Supply chain workflow"
        description="Customer order → SO/PR → PO → supplier invoice → reconciliation → allocation → receiving → shipment."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/scm/exceptions">
                <ShieldAlert className="size-4" aria-hidden />
                {metrics.openExceptions} open exception
                {metrics.openExceptions === 1 ? "" : "s"}
              </Link>
            </Button>
            <Button variant="gold" asChild>
              <Link href="/scm/import">Import files</Link>
            </Button>
          </>
        }
      />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Management
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total PO" value={metrics.management.totalPo} href="/scm/purchasing/summary" />
          <KpiCard label="Total SO" value={metrics.management.totalSo} href="/scm/po-vs-so" />
          <KpiCard label="Total invoices" value={metrics.management.totalInvoice} href="/scm/purchasing/invoices" />
          <KpiCard
            label="Total received"
            value={formatNumber(metrics.management.totalReceived)}
            href="/scm/warehouse/receiving"
          />
          <KpiCard
            label="Customer allocation"
            value={formatNumber(metrics.management.totalCustomerAllocation)}
            href="/scm/sales/allocation"
          />
          <KpiCard
            label="Warehouse stock"
            value={formatNumber(metrics.management.totalWarehouseStock)}
            hint="Leftover put into stock"
          />
          <KpiCard
            label="Quantity variance"
            value={formatNumber(metrics.management.quantityVariance)}
            tone={metrics.management.quantityVariance > 0 ? "warning" : "default"}
            href="/scm/purchasing/po-invoice"
          />
          <KpiCard
            label="Price variance"
            value={formatNumber(metrics.management.priceVariance, 2)}
            tone={metrics.management.priceVariance > 0 ? "warning" : "default"}
            href="/scm/purchasing/po-invoice"
          />
        </div>
      </section>

      {showPurchasing ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Purchasing
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard label="PO pending" value={metrics.purchasing.poPending} href="/scm/purchasing/orders" />
            <KpiCard
              label="Invoice mismatch"
              value={metrics.purchasing.poInvoiceMismatch}
              tone={metrics.purchasing.poInvoiceMismatch > 0 ? "danger" : "success"}
              href="/scm/purchasing/po-invoice"
            />
            <KpiCard
              label="Quantity difference"
              value={formatNumber(metrics.purchasing.quantityDifference)}
              tone={metrics.purchasing.quantityDifference > 0 ? "warning" : "default"}
            />
            <KpiCard
              label="Price difference"
              value={formatNumber(metrics.purchasing.priceDifference, 2)}
              tone={metrics.purchasing.priceDifference > 0 ? "warning" : "default"}
            />
            <KpiCard
              label="PO without invoice"
              value={metrics.purchasing.poWithoutInvoice}
              href="/scm/purchasing/invoices"
            />
          </div>
          {metrics.purchasing.latestSuppliers.length > 0 ? (
            <Card className="mt-3">
              <CardHeader>
                <CardTitle className="text-base">Supplier performance</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Lines</TableHead>
                      <TableHead className="text-right">Mismatches</TableHead>
                      <TableHead className="text-right">On spec</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.purchasing.latestSuppliers.map((supplier) => (
                      <TableRow key={supplier.supplierName}>
                        <TableCell>{supplier.supplierName}</TableCell>
                        <TableCell className="tnum text-right">{supplier.lines}</TableCell>
                        <TableCell
                          className={
                            supplier.mismatches > 0
                              ? "tnum text-right text-warning"
                              : "tnum text-right"
                          }
                        >
                          {supplier.mismatches}
                        </TableCell>
                        <TableCell className="tnum text-right">
                          {formatNumber(supplier.onTimePct, 1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </section>
      ) : null}

      {showSales ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Sales
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard
              label="SO ≠ actual"
              value={metrics.sales.soQuantityMismatch}
              tone={metrics.sales.soQuantityMismatch > 0 ? "warning" : "default"}
              href="/scm/sales/review"
            />
            <KpiCard
              label="To ask the customer"
              value={metrics.sales.awaitingCustomer}
              tone={metrics.sales.awaitingCustomer > 0 ? "danger" : "success"}
              href="/scm/sales/review"
            />
            <KpiCard label="To reduce" value={metrics.sales.toReduce} href="/scm/sales/review" />
            <KpiCard label="Supplier over-shipped" value={metrics.sales.excess} href="/scm/sales/review" />
            <KpiCard label="Kept as stock" value={metrics.sales.toStock} href="/scm/sales/allocation" />
          </div>
        </section>
      ) : null}

      {showWarehouse ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Warehouse
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <KpiCard label="Shipments today" value={metrics.warehouse.shipmentsToday} href="/scm/warehouse/shipments" />
            <KpiCard
              label="Ready to receive"
              value={metrics.warehouse.readyToReceive}
              tone="success"
              href="/scm/warehouse/receiving"
            />
            <KpiCard
              label="Pending allocation"
              value={metrics.warehouse.pendingAllocation}
              tone={metrics.warehouse.pendingAllocation > 0 ? "warning" : "default"}
              href="/scm/sales/allocation"
            />
            <KpiCard label="Received" value={metrics.warehouse.received} href="/scm/warehouse/receiving" />
            <KpiCard
              label="Blocked"
              value={metrics.warehouse.blocked}
              tone={metrics.warehouse.blocked > 0 ? "danger" : "default"}
              href="/scm/warehouse/receiving"
            />
            <KpiCard
              label="Unallocated qty"
              value={formatNumber(metrics.warehouse.unallocatedQuantity)}
              tone={metrics.warehouse.unallocatedQuantity > 0 ? "danger" : "success"}
              href="/scm/sales/allocation"
            />
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lines needing attention</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {blocked.length === 0 ? (
              <p className="px-6 pb-2 text-sm text-muted-foreground">
                Nothing is waiting — every line has cleared its checks.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Delivery</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blocked.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <Link
                          href={`/scm/trace/po/${line.poId}`}
                          className="font-medium hover:text-gold-deep hover:underline"
                        >
                          {line.po.poNumber}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {line.po.supplier.name}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[16rem]">
                        <div className="truncate">{line.product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {line.product.prCode}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(line.deliveryDate)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={line.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">
                <Bell className="mr-1.5 inline size-4" aria-hidden />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No unread alerts for {department}.
                </p>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="rounded-md border border-border px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{notification.title}</div>
                        {notification.body ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {notification.body}
                          </p>
                        ) : null}
                      </div>
                      {notification.link ? (
                        <Link
                          href={notification.link}
                          className="shrink-0 text-xs text-gold-deep hover:underline"
                        >
                          Open <ArrowRight className="inline size-3" aria-hidden />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Open exceptions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {exceptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open exceptions.</p>
              ) : (
                exceptions.map((exception) => (
                  <div key={exception.id} className="flex items-start gap-2 text-sm">
                    <ToneBadge tone={documentTone(exception.status)}>
                      {exception.code}
                    </ToneBadge>
                    <div className="min-w-0">
                      <div className="truncate">{exception.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {humanize(exception.type)} · {exception.responsibleDept}
                        {exception.dueDate ? ` · due ${formatDate(exception.dueDate)}` : ""}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
