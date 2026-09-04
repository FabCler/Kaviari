import { osms } from "@/lib/osms/db";
import { currentActor } from "@/lib/osms/guard";
import { can } from "@/lib/osms/permissions";
import { formatDate } from "@/lib/format";
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
import { ToneBadge, documentTone, humanize } from "@/components/osms/status-badge";
import { ImportView } from "@/components/osms/import/import-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import files" };

/**
 * §1 — the four import entry points. Each one validates first and shows what
 * it found; nothing reaches the database until the row-by-row result has
 * been read and confirmed.
 */
export default async function ImportPage() {
  const actor = (await currentActor())!;

  const [batches, purchaseOrders] = await Promise.all([
    osms.importBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    osms.purchaseOrder.findMany({
      where: { status: { notIn: ["cancelled", "closed"] } },
      include: { supplier: true },
      orderBy: { orderDate: "desc" },
      take: 100,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Import files"
        description="Purchasing demand, purchase orders, sales orders and supplier invoices."
      />

      <ImportView
        permissions={{
          demand: can(actor, "import.demand"),
          po: can(actor, "import.po"),
          so: can(actor, "import.so"),
          invoice: can(actor, "import.invoice"),
        }}
        purchaseOrders={purchaseOrders.map((po) => ({
          id: po.id,
          poNumber: po.poNumber,
          supplierName: po.supplier.name,
        }))}
      />

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Recent imports</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {batches.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">
              No file has been imported yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Imported</TableHead>
                  <TableHead className="text-right">Skipped</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="max-w-[18rem] truncate">
                      {batch.fileName}
                    </TableCell>
                    <TableCell>{humanize(batch.kind)}</TableCell>
                    <TableCell className="tnum text-right">{batch.rowCount}</TableCell>
                    <TableCell className="tnum text-right">{batch.okCount}</TableCell>
                    <TableCell
                      className={
                        batch.errorCount > 0
                          ? "tnum text-right text-destructive"
                          : "tnum text-right"
                      }
                    >
                      {batch.errorCount}
                    </TableCell>
                    <TableCell>
                      <ToneBadge tone={documentTone(batch.status)}>
                        {humanize(batch.status)}
                      </ToneBadge>
                    </TableCell>
                    <TableCell className="text-sm">{batch.createdByName ?? "-"}</TableCell>
                    <TableCell className="text-sm">
                      {formatDate(batch.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
