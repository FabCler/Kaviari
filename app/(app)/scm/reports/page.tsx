import { currentScope } from "@/lib/scm/guard";
import { narrowScope } from "@/lib/scm/channels";
import { can } from "@/lib/scm/permissions";
import { channelPerformance, supplierPerformance } from "@/lib/scm/reports";
import { prisma } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NoAccess } from "@/components/scm/no-access";
import { ChannelBadge, ChannelFilter } from "@/components/scm/channel-filter";
import { ReportFilters } from "@/components/scm/report-filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Performance reports — Kaviari Cellar" };

/** §33 Supplier performance and §34 Channel performance, side by side. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    channel?: string;
    supplier?: string;
    product?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const context = await currentScope();
  if (!context) return <NoAccess what="the performance reports" />;
  const { actor, scope } = context;
  if (!can(actor, "reports.view")) {
    return <NoAccess what="the performance reports" />;
  }

  const filters = await searchParams;
  const parseDay = (value?: string) =>
    value ? new Date(`${value}T00:00:00Z`) : null;

  const visible = narrowScope(scope, filters.channel);

  const common = {
    channelIds: visible.all ? null : visible.ids,
    supplierId: filters.supplier ?? null,
    productId: filters.product ?? null,
    from: parseDay(filters.from),
    to: parseDay(filters.to),
  };

  const [suppliers, channels, supplierRows, channelRows, products] =
    await Promise.all([
      prisma.supplier.findMany({ orderBy: { name: "asc" } }),
      Promise.resolve(scope.channels),
      supplierPerformance(common),
      channelPerformance(common),
      prisma.product.findMany({
        where: { scmPoLines: { some: {} } },
        select: { id: true, prCode: true, name: true },
        orderBy: { prCode: "asc" },
      }),
    ]);

  return (
    <div>
      <PageHeader
        title="Performance reports"
        description="How suppliers delivered against their orders, and how each business channel is served."
      />

      <div className="mb-4 space-y-3">
        <ChannelFilter channels={channels} />
        <ReportFilters
          suppliers={suppliers.map((supplier) => ({
            id: supplier.id,
            name: supplier.name,
          }))}
          products={products.map((product) => ({
            id: product.id,
            name: `${product.prCode} · ${product.name}`,
          }))}
        />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Supplier performance</CardTitle>
          <p className="text-sm text-muted-foreground">
            Quantity accuracy is the share of PO lines that arrived exactly as
            ordered; on-time is measured against each line&apos;s delivery date.
          </p>
        </CardHeader>
        <CardContent className="px-0">
          {supplierRows.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">
              No purchase-order lines match these filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">PO lines</TableHead>
                    <TableHead className="text-right">PO qty</TableHead>
                    <TableHead className="text-right">Invoice qty</TableHead>
                    <TableHead className="text-right">Actual qty</TableHead>
                    <TableHead className="text-right">Short %</TableHead>
                    <TableHead className="text-right">Excess %</TableHead>
                    <TableHead className="text-right">Price variance</TableHead>
                    <TableHead className="text-right">Qty accuracy</TableHead>
                    <TableHead className="text-right">Price accuracy</TableHead>
                    <TableHead className="text-right">On time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierRows.map((row) => (
                    <TableRow key={row.supplierId}>
                      <TableCell>
                        <div className="font-medium">{row.supplierName}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.supplierCode}
                        </div>
                      </TableCell>
                      <TableCell className="tnum text-right">{row.poLines}</TableCell>
                      <TableCell className="tnum text-right">
                        {formatNumber(row.poQuantity)}
                      </TableCell>
                      <TableCell className="tnum text-right">
                        {formatNumber(row.invoiceQuantity)}
                      </TableCell>
                      <TableCell className="tnum text-right">
                        {formatNumber(row.actualQuantity)}
                      </TableCell>
                      <TableCell
                        className={
                          row.shortPct > 0
                            ? "tnum text-right text-destructive"
                            : "tnum text-right"
                        }
                      >
                        {formatNumber(row.shortPct, 1)}%
                      </TableCell>
                      <TableCell
                        className={
                          row.excessPct > 0
                            ? "tnum text-right text-warning"
                            : "tnum text-right"
                        }
                      >
                        {formatNumber(row.excessPct, 1)}%
                      </TableCell>
                      <TableCell className="tnum text-right">
                        {formatNumber(row.priceVariance, 2)}
                      </TableCell>
                      <TableCell className="tnum text-right">
                        {formatNumber(row.quantityAccuracyPct, 1)}%
                      </TableCell>
                      <TableCell className="tnum text-right">
                        {formatNumber(row.priceAccuracyPct, 1)}%
                      </TableCell>
                      <TableCell className="tnum text-right">
                        {formatNumber(row.onTimeDeliveryPct, 1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Channel performance</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Customers</TableHead>
                  <TableHead className="text-right">SOs</TableHead>
                  <TableHead className="text-right">SO qty</TableHead>
                  <TableHead className="text-right">PO qty</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Shipment</TableHead>
                  <TableHead className="text-right">Short</TableHead>
                  <TableHead className="text-right">Excess</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channelRows.map((row) => (
                  <TableRow key={row.channelId ?? "none"}>
                    <TableCell>
                      <ChannelBadge code={row.channelCode} name={row.channelName} />
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {row.channelName}
                      </div>
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {row.customerCount}
                    </TableCell>
                    <TableCell className="tnum text-right">{row.soCount}</TableCell>
                    <TableCell className="tnum text-right">
                      {formatNumber(row.soQuantity)}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {formatNumber(row.poQuantity)}
                    </TableCell>
                    <TableCell className="tnum text-right font-medium">
                      {formatNumber(row.actualQuantity)}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {formatNumber(row.shipmentQuantity)}
                    </TableCell>
                    <TableCell
                      className={
                        row.shortQuantity > 0
                          ? "tnum text-right text-destructive"
                          : "tnum text-right"
                      }
                    >
                      {formatNumber(row.shortQuantity)}
                    </TableCell>
                    <TableCell
                      className={
                        row.excessQuantity > 0
                          ? "tnum text-right text-warning"
                          : "tnum text-right"
                      }
                    >
                      {formatNumber(row.excessQuantity)}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {formatNumber(row.stockQuantity)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
