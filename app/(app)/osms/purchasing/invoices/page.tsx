import Link from "next/link";
import { osms } from "@/lib/osms/db";
import { currentActor } from "@/lib/osms/guard";
import { can } from "@/lib/osms/permissions";
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "@/lib/osms/domain";
import { formatDate, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
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
import { NoAccess } from "@/components/osms/no-access";
import { ToneBadge, documentTone } from "@/components/osms/status-badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Supplier invoices" };

/** §1.3 — every uploaded invoice and where it sits in the review flow. */
export default async function InvoicesPage() {
  const actor = (await currentActor())!;
  if (!can(actor, "purchasing.view")) return <NoAccess what="supplier invoices" />;

  const invoices = await osms.invoice.findMany({
    include: { supplier: true, po: true, lines: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Supplier invoices"
        description="Uploaded → extracted → verified. Nothing reaches reconciliation until purchasing has confirmed the lines."
        actions={
          <Button variant="gold" asChild>
            <Link href="/osms/import">Upload an invoice</Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="px-0">
          {invoices.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No invoice has been uploaded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>PO</TableHead>
                    <TableHead>Invoice date</TableHead>
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Read by</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => {
                    const value = invoice.lines.reduce(
                      (sum, line) => sum + line.quantity * line.unitPrice,
                      0
                    );
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell>
                          <Link
                            href={`/osms/purchasing/invoices/${invoice.id}`}
                            className="font-medium hover:text-gold-deep hover:underline"
                          >
                            {invoice.invoiceNumber}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {invoice.fileName ?? "-"}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {invoice.supplier?.name ??
                            invoice.supplierNameRaw ??
                            "Unknown"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {invoice.po ? (
                            <Link
                              href={`/osms/trace/po/${invoice.poId}`}
                              className="hover:text-gold-deep hover:underline"
                            >
                              {invoice.po.poNumber}
                            </Link>
                          ) : (
                            <span className="text-destructive">Not linked</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {invoice.invoiceDate ? formatDate(invoice.invoiceDate) : "-"}
                        </TableCell>
                        <TableCell className="tnum text-right">
                          {invoice.lines.length}
                        </TableCell>
                        <TableCell className="tnum text-right">
                          {formatMoney(value, invoice.currency)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {invoice.extractionMode === "ai" ? "Automatic" : "Manual"}
                        </TableCell>
                        <TableCell>
                          <ToneBadge tone={documentTone(invoice.status)}>
                            {INVOICE_STATUS_LABELS[invoice.status as InvoiceStatus] ??
                              invoice.status}
                          </ToneBadge>
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
