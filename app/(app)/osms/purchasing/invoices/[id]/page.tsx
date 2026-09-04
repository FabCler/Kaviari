import Link from "next/link";
import { notFound } from "next/navigation";
import { osms } from "@/lib/osms/db";
import { currentActor } from "@/lib/osms/guard";
import { can } from "@/lib/osms/permissions";
import { auditTrailFor } from "@/lib/osms/audit";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NoAccess } from "@/components/osms/no-access";
import { InvoiceVerify } from "@/components/osms/purchasing/invoice-verify";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await osms.invoice.findUnique({
    where: { id },
    select: { invoiceNumber: true },
  });
  return {
    title: `${invoice?.invoiceNumber ?? "Invoice"}`,
  };
}

/** §1.3 — verify what the reader extracted, field by field. */
export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = (await currentActor())!;
  if (!can(actor, "purchasing.view")) return <NoAccess what="supplier invoices" />;

  const { id } = await params;
  const invoice = await osms.invoice.findUnique({
    where: { id },
    include: {
      supplier: true,
      po: { include: { supplier: true, lines: { include: { product: true } } } },
      lines: { include: { product: true }, orderBy: { lineNo: "asc" } },
    },
  });
  if (!invoice) notFound();

  const [products, purchaseOrders, audit] = await Promise.all([
    osms.product.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true, unit: true },
      orderBy: { code: "asc" },
    }),
    osms.purchaseOrder.findMany({
      where: { status: { notIn: ["cancelled"] } },
      include: { supplier: true },
      orderBy: { orderDate: "desc" },
      take: 100,
    }),
    auditTrailFor("invoice", id, 40),
  ]);

  return (
    <div>
      <PageHeader
        title={invoice.invoiceNumber}
        description={`${invoice.supplier?.name ?? invoice.supplierNameRaw ?? "Unknown supplier"} · ${
          invoice.fileName ?? "no file"
        } · read ${invoice.extractionMode === "ai" ? "automatically" : "manually"}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/osms/purchasing/invoices">All invoices</Link>
            </Button>
            {invoice.poId ? (
              <Button variant="outline" asChild>
                <Link href={`/osms/trace/po/${invoice.poId}`}>Open the PO</Link>
              </Button>
            ) : null}
          </>
        }
      />

      <InvoiceVerify
        canEdit={can(actor, "purchasing.reconcilePoInvoice")}
        invoice={{
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          poId: invoice.poId,
          currency: invoice.currency,
          invoiceDate: invoice.invoiceDate?.toISOString().slice(0, 10) ?? "",
          deliveryDate: invoice.deliveryDate?.toISOString().slice(0, 10) ?? "",
          poNumberRaw: invoice.poNumberRaw,
          supplierNameRaw: invoice.supplierNameRaw,
          rejectReason: invoice.rejectReason,
          verifiedByName: invoice.verifiedByName,
          lines: invoice.lines.map((line) => ({
            id: line.id,
            lineNo: line.lineNo,
            productId: line.productId,
            productCodeRaw: line.productCodeRaw,
            descriptionRaw: line.descriptionRaw,
            quantity: line.quantity,
            unit: line.unit,
            unitPrice: line.unitPrice,
            priceUnit: line.priceUnit,
            deliveryDate: line.deliveryDate?.toISOString().slice(0, 10) ?? "",
            editedFields: (line.editedFields ?? "").split(",").filter(Boolean),
            poLineId: line.poLineId,
          })),
        }}
        products={products}
        purchaseOrders={purchaseOrders.map((po) => ({
          id: po.id,
          poNumber: po.poNumber,
          supplierName: po.supplier.name,
        }))}
        poLines={
          invoice.po?.lines.map((line) => ({
            id: line.id,
            label: `${line.product.code} · ${line.baseQuantity} ${line.product.unit} @ ${line.unitPrice}`,
          })) ?? []
        }
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {audit.map((entry) => (
                <li key={entry.id} className="text-sm">
                  <span className="text-muted-foreground">
                    {formatDate(entry.createdAt)} · {entry.userName ?? "system"} ·{" "}
                    {entry.action}
                  </span>{" "}
                  {entry.field ? (
                    <span>
                      <span className="font-medium">{entry.field}</span>
                      {entry.oldValue != null ? (
                        <>
                          {" "}
                          <span className="line-through opacity-60">
                            {entry.oldValue}
                          </span>
                        </>
                      ) : null}
                      {entry.newValue != null ? <> → {entry.newValue}</> : null}
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
