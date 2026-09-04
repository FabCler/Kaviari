import Link from "next/link";
import { currentScope } from "@/lib/osms/guard";
import { narrowScope } from "@/lib/osms/channels";
import { can } from "@/lib/osms/permissions";
import { listWarehouseStock } from "@/lib/osms/warehouse-stock";
import { formatDate, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/osms/kpi-card";
import { NoAccess } from "@/components/osms/no-access";
import { ChannelBadge, ChannelFilter } from "@/components/osms/channel-filter";
import { ToneBadge, documentTone, humanize } from "@/components/osms/status-badge";
import { StockActions } from "@/components/osms/warehouse/stock-actions";
import { daysUntil } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Warehouse stock" };

/**
 * §24 — leftover with its whole origin chain. Every row can be traced back
 * to the supplier, PO, invoice, sales order and channel it came from.
 */
export default async function WarehouseStockPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; search?: string }>;
}) {
  const context = await currentScope();
  if (!context) return <NoAccess what="warehouse stock" />;
  const { actor, scope } = context;
  if (!can(actor, "warehouse.stock")) return <NoAccess what="warehouse stock" />;

  const filters = await searchParams;
  const visible = narrowScope(scope, filters.channel);
  const rows = await listWarehouseStock({
    channelIds: visible.all ? null : visible.ids,
    search: filters.search,
  });

  const total = rows.reduce((sum, row) => sum + row.quantity, 0);
  const expiringSoon = rows.filter(
    (row) => row.expiryDate != null && daysUntil(row.expiryDate) <= 14
  ).length;

  return (
    <div>
      <PageHeader
        title="Warehouse stock &amp; leftover"
        description="Everything received that did not go straight to a customer, with the order it came from."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ChannelFilter channels={scope.channels} />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KpiCard label="Stock lines" value={rows.length} />
        <KpiCard label="Total quantity" value={formatNumber(total)} />
        <KpiCard
          label="Expiring within 14 days"
          value={expiringSoon}
          tone={expiringSoon > 0 ? "danger" : "success"}
        />
      </div>

      <Card>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No leftover in stock — everything received went to a customer.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stock</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Location / lot</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const days =
                      row.expiryDate != null ? daysUntil(row.expiryDate) : null;
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {row.stockNumber}
                        </TableCell>
                        <TableCell className="max-w-[16rem]">
                          <div className="truncate">{row.product.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.product.code}
                          </div>
                        </TableCell>
                        <TableCell className="tnum text-right font-medium">
                          {formatNumber(row.quantity)} {row.unit}
                        </TableCell>
                        <TableCell>
                          <ChannelBadge
                            code={row.channel?.code}
                            name={row.channel?.name}
                          />
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.po ? (
                            <Link
                              href={`/osms/trace/po/${row.poId}`}
                              className="hover:text-gold-deep hover:underline"
                            >
                              {row.po.poNumber}
                            </Link>
                          ) : (
                            "—"
                          )}
                          <div className="text-muted-foreground">
                            {row.supplier?.name ?? "—"}
                          </div>
                          {row.originalSoLine ? (
                            <div className="text-muted-foreground">
                              {row.originalSoLine.so.soNumber} ·{" "}
                              {row.originalSoLine.so.customer.name}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.location ?? "—"}
                          <div className="text-muted-foreground">
                            {row.lotNumber ?? "no lot"}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.expiryDate ? (
                            <span
                              className={
                                days != null && days <= 14
                                  ? "text-destructive"
                                  : undefined
                              }
                            >
                              {formatDate(row.expiryDate)}
                              {days != null ? (
                                <span className="block text-xs">
                                  {days < 0 ? "expired" : `${days} d`}
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="max-w-[14rem] text-xs text-muted-foreground">
                          {row.reason ?? "—"}
                        </TableCell>
                        <TableCell>
                          <ToneBadge tone={documentTone(row.status)}>
                            {humanize(row.status)}
                          </ToneBadge>
                        </TableCell>
                        <TableCell>
                          <StockActions
                            stockId={row.id}
                            stockNumber={row.stockNumber}
                            quantity={row.quantity}
                            unit={row.unit}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
