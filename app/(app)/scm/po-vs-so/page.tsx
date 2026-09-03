import { currentActor } from "@/lib/scm/guard";
import { poVsSo } from "@/lib/scm/queries";
import { COMPARISON_LABELS, type ComparisonStatus } from "@/lib/scm/domain";
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
import { KpiCard } from "@/components/scm/kpi-card";
import { ExportButton } from "@/components/scm/export-button";
import { ToneBadge } from "@/components/scm/status-badge";
import type { StatusTone } from "@/lib/scm/status";

export const dynamic = "force-dynamic";
export const metadata = { title: "PO vs SO — Kaviari Cellar" };

const TONE: Record<ComparisonStatus, StatusTone> = {
  MATCH: "done",
  PO_GT_SO: "pending",
  PO_LT_SO: "blocked",
  NO_PO: "blocked",
  NO_SO: "pending",
};

/** §5 — Difference = PO qty − SO qty, per product and delivery date. */
export default async function PoVsSoPage() {
  await currentActor();
  const rows = await poVsSo();

  const counts = rows.reduce<Record<ComparisonStatus, number>>(
    (accumulator, row) => {
      accumulator[row.status] += 1;
      return accumulator;
    },
    { MATCH: 0, PO_GT_SO: 0, PO_LT_SO: 0, NO_PO: 0, NO_SO: 0 }
  );

  return (
    <div>
      <PageHeader
        title="PO vs SO"
        description="Difference = PO qty − SO qty · Difference % = (PO − SO) / SO × 100"
        actions={
          <ExportButton href="/api/scm/exports/po-vs-so" />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Match" value={counts.MATCH} tone="success" />
        <KpiCard label="PO > SO" value={counts.PO_GT_SO} tone="warning" />
        <KpiCard label="PO < SO" value={counts.PO_LT_SO} tone="danger" />
        <KpiCard label="No PO" value={counts.NO_PO} tone="danger" />
        <KpiCard label="No SO" value={counts.NO_SO} tone="warning" />
      </div>

      <Card>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              Nothing to compare yet — import sales and purchase orders first.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">SO qty</TableHead>
                    <TableHead className="text-right">PO qty</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead className="text-right">Diff %</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Delivery</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="max-w-[18rem]">
                        <div className="truncate">{row.productName}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.productCode}
                          {row.soNumbers.length > 0
                            ? ` · SO ${row.soNumbers.join(", ")}`
                            : ""}
                          {row.poNumbers.length > 0
                            ? ` · PO ${row.poNumbers.join(", ")}`
                            : ""}
                        </div>
                      </TableCell>
                      <TableCell className="tnum text-right">
                        {formatNumber(row.soQuantity)}
                      </TableCell>
                      <TableCell className="tnum text-right">
                        {formatNumber(row.poQuantity)}
                      </TableCell>
                      <TableCell
                        className={
                          (row.difference ?? 0) > 0
                            ? "tnum text-right text-warning"
                            : (row.difference ?? 0) < 0
                              ? "tnum text-right text-destructive"
                              : "tnum text-right"
                        }
                      >
                        {(row.difference ?? 0) > 0 ? "+" : ""}
                        {formatNumber(row.difference ?? 0)}
                      </TableCell>
                      <TableCell className="tnum text-right">
                        {row.differencePct == null
                          ? "-"
                          : `${formatNumber(row.differencePct, 1)}%`}
                      </TableCell>
                      <TableCell>{row.unit}</TableCell>
                      <TableCell className="text-sm">
                        {row.deliveryDate ? formatDate(row.deliveryDate) : "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.supplierName ?? "-"}
                      </TableCell>
                      <TableCell>
                        <ToneBadge tone={TONE[row.status]}>
                          {COMPARISON_LABELS[row.status]}
                        </ToneBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
