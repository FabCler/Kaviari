import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentActor } from "@/lib/scm/guard";
import { can } from "@/lib/scm/permissions";
import { auditTrailFor } from "@/lib/scm/audit";
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
import { NoAccess } from "@/components/scm/no-access";
import { ToneBadge, documentTone, humanize } from "@/components/scm/status-badge";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const receiving = await prisma.scmReceiving.findUnique({
    where: { id },
    select: { receiptNumber: true },
  });
  return { title: `${receiving?.receiptNumber ?? "Receipt"} — Kaviari Cellar` };
}

/** A completed goods receipt, with every weighed piece and where it went. */
export default async function ReceivingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = (await currentActor())!;
  if (!can(actor, "warehouse.view")) return <NoAccess what="warehouse receiving" />;

  const { id } = await params;
  const receiving = await prisma.scmReceiving.findUnique({
    where: { id },
    include: {
      po: { include: { supplier: true } },
      supplier: true,
      lines: {
        include: {
          product: true,
          items: {
            include: {
              allocationLine: { include: { customer: true } },
            },
            orderBy: { itemNo: "asc" },
          },
        },
      },
    },
  });
  if (!receiving) notFound();

  const audit = await auditTrailFor("receiving", id, 40);

  return (
    <div>
      <PageHeader
        title={receiving.receiptNumber}
        description={`${receiving.supplier.name} · ${receiving.po.poNumber} · received ${formatDate(receiving.receivedDate)} by ${receiving.receivedByName ?? "warehouse"}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/scm/warehouse/receiving">Back to the queue</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/scm/trace/po/${receiving.poId}`}>Document trace</Link>
            </Button>
            <Button variant="gold" asChild>
              <Link href="/scm/warehouse/shipments">Ship to customers</Link>
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Lines</CardTitle>
          <ToneBadge tone={documentTone(receiving.status)}>
            {humanize(receiving.status)}
          </ToneBadge>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Difference</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receiving.lines.map((line) => {
                const difference = line.actualQuantity - line.expectedQuantity;
                return (
                  <TableRow key={line.id}>
                    <TableCell className="max-w-[18rem]">
                      <div className="truncate">{line.product.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {line.product.prCode}
                      </div>
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {formatNumber(line.expectedQuantity)} {line.unit}
                    </TableCell>
                    <TableCell className="tnum text-right font-medium">
                      {formatNumber(line.actualQuantity)} {line.unit}
                    </TableCell>
                    <TableCell
                      className={
                        difference === 0
                          ? "tnum text-right"
                          : difference > 0
                            ? "tnum text-right text-warning"
                            : "tnum text-right text-destructive"
                      }
                    >
                      {difference > 0 ? "+" : ""}
                      {formatNumber(difference)}
                    </TableCell>
                    <TableCell className="text-sm">{line.lotNumber ?? "-"}</TableCell>
                    <TableCell className="text-sm">
                      {line.storageLocation ?? "-"}
                    </TableCell>
                    <TableCell>
                      <ToneBadge tone={documentTone(line.status)}>
                        {humanize(line.status)}
                      </ToneBadge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {receiving.lines.some((line) => line.items.length > 0) ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Weighed items</CardTitle>
            <p className="text-sm text-muted-foreground">
              Each piece with its own weight and the customer it was assigned
              to.
            </p>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item no.</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Lot</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receiving.lines.flatMap((line) =>
                  line.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.itemNo}</TableCell>
                      <TableCell className="text-sm">{line.product.name}</TableCell>
                      <TableCell className="tnum text-right">
                        {formatNumber(item.weight, 2)} {item.unit}
                      </TableCell>
                      <TableCell className="text-sm">
                        {item.allocationLine?.customer?.name ?? "Unassigned"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {item.lotNumber ?? "-"}
                      </TableCell>
                      <TableCell>
                        <ToneBadge tone={documentTone(item.status)}>
                          {humanize(item.status)}
                        </ToneBadge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {audit.map((entry) => (
                <li key={entry.id}>
                  <span className="text-muted-foreground">
                    {formatDate(entry.createdAt)} · {entry.userName ?? "system"} ·{" "}
                    {entry.action}
                  </span>{" "}
                  {entry.field ? (
                    <span>
                      <span className="font-medium">{entry.field}</span>
                      {entry.oldValue != null ? ` ${entry.oldValue} →` : ""}{" "}
                      {entry.newValue ?? ""}
                    </span>
                  ) : null}
                  {entry.reason ? (
                    <span className="text-muted-foreground"> ({entry.reason})</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
