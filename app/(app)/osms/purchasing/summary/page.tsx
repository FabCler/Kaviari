import Link from "next/link";
import { osms } from "@/lib/osms/db";
import { currentScope } from "@/lib/osms/guard";
import { narrowScope } from "@/lib/osms/channels";
import { can } from "@/lib/osms/permissions";
import { supplierSummary } from "@/lib/osms/queries";
import { ORDER_ADJUSTMENT_LABELS } from "@/lib/osms/domain";
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
import { NoAccess } from "@/components/osms/no-access";
import { ExportButton } from "@/components/osms/export-button";
import { ChannelBadge, ChannelFilter } from "@/components/osms/channel-filter";
import { StatusBadge } from "@/components/osms/status-badge";
import { SummaryFilters } from "@/components/osms/purchasing/summary-filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Supplier order summary" };

/** §2.1 — ordered vs required per supplier and product, with the reason. */
export default async function SupplierSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{
    supplier?: string;
    product?: string;
    status?: string;
    channel?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const context = await currentScope();
  if (!context) return <NoAccess what="the supplier summary" />;
  const { actor, scope } = context;
  if (!can(actor, "purchasing.view")) {
    return <NoAccess what="the supplier summary" />;
  }

  const filters = await searchParams;
  const parseDay = (value?: string) =>
    value ? new Date(`${value}T00:00:00Z`) : undefined;

  const visible = narrowScope(scope, filters.channel);

  const [rows, suppliers, products] = await Promise.all([
    supplierSummary({
      supplierId: filters.supplier,
      productId: filters.product,
      status: filters.status,
      channelIds: visible.all ? null : visible.ids,
      from: parseDay(filters.from),
      to: parseDay(filters.to),
    }),
    osms.supplier.findMany({ orderBy: { name: "asc" } }),
    osms.product.findMany({
      where: { poLines: { some: {} } },
      orderBy: { name: "asc" },
    }),
  ]);

  const totals = rows.reduce(
    (accumulator, row) => ({
      required: accumulator.required + row.requiredQuantity,
      ordered: accumulator.ordered + row.orderQuantity,
      difference: accumulator.difference + row.difference,
    }),
    { required: 0, ordered: 0, difference: 0 }
  );

  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => Boolean(value)) as [
      string,
      string,
    ][]
  ).toString();

  return (
    <div>
      <PageHeader
        title="Supplier order summary"
        description="What was ordered against what was asked for, per supplier and product."
        actions={
          <ExportButton
            href={`/api/osms/exports/supplier-summary${query ? `?${query}` : ""}`}
          />
        }
      />

      <div className="mb-3">
        <ChannelFilter channels={scope.channels} />
      </div>

      <SummaryFilters
        suppliers={suppliers.map((supplier) => ({
          id: supplier.id,
          name: supplier.name,
        }))}
        products={products.map((product) => ({
          id: product.id,
          name: `${product.code} · ${product.name}`,
        }))}
      />

      <Card className="mt-4">
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No purchase-order lines match these filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>PO</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Required qty</TableHead>
                    <TableHead className="text-right">Order qty</TableHead>
                    <TableHead className="text-right">MOQ</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead className="text-right">Diff %</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Delivery</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.poLineId}>
                      <TableCell>{row.supplierName}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.channelCodes.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            row.channelCodes.map((code) => (
                              <ChannelBadge key={code} code={code} />
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/osms/trace/po/${row.poId}`}
                          className="font-medium hover:text-gold-deep hover:underline"
                        >
                          {row.poNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[16rem]">
                        <div className="truncate">{row.productName}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.productCode}
                        </div>
                      </TableCell>
                      <TableCell className="tnum text-right">
                        {formatNumber(row.requiredQuantity)} {row.unit}
                      </TableCell>
                      <TableCell className="tnum text-right font-medium">
                        {formatNumber(row.orderQuantity)} {row.unit}
                      </TableCell>
                      <TableCell className="tnum text-right">
                        {row.moq ? formatNumber(row.moq) : "-"}
                      </TableCell>
                      <TableCell
                        className={
                          row.difference > 0
                            ? "tnum text-right text-warning"
                            : row.difference < 0
                              ? "tnum text-right text-destructive"
                              : "tnum text-right"
                        }
                      >
                        {row.difference > 0 ? "+" : ""}
                        {formatNumber(row.difference)}
                      </TableCell>
                      <TableCell className="tnum text-right">
                        {row.differencePct == null
                          ? "-"
                          : `${formatNumber(row.differencePct, 1)}%`}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.reason
                          ? (ORDER_ADJUSTMENT_LABELS[
                              row.reason as keyof typeof ORDER_ADJUSTMENT_LABELS
                            ] ?? row.reason)
                          : "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(row.deliveryDate)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 border-gold/40 font-medium">
                    <TableCell colSpan={4}>Total</TableCell>
                    <TableCell className="tnum text-right">
                      {formatNumber(totals.required)}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {formatNumber(totals.ordered)}
                    </TableCell>
                    <TableCell />
                    <TableCell
                      className={
                        totals.difference > 0
                          ? "tnum text-right text-warning"
                          : "tnum text-right"
                      }
                    >
                      {totals.difference > 0 ? "+" : ""}
                      {formatNumber(totals.difference)}
                    </TableCell>
                    <TableCell colSpan={4} />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
