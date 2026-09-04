import { osms } from "@/lib/osms/db";
import { currentActor } from "@/lib/osms/guard";
import { can } from "@/lib/osms/permissions";
import { getScmSettings } from "@/lib/osms/settings";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/osms/kpi-card";
import { NoAccess } from "@/components/osms/no-access";
import { ReconBoard } from "@/components/osms/purchasing/recon-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "PO vs Invoice" };

/**
 * §3 — PO against invoice, quantity and price, with the difference and the
 * difference %. Purchasing confirms the corrected quantity here, and that
 * figure becomes the source of truth for everything downstream (§14).
 */
export default async function PoInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string; status?: string }>;
}) {
  const actor = (await currentActor())!;
  if (!can(actor, "purchasing.view")) {
    return <NoAccess what="the PO vs Invoice board" />;
  }

  const filters = await searchParams;
  const settings = await getScmSettings();

  const recons = await osms.poInvoiceRecon.findMany({
    where: {
      ...(filters.po ? { poId: filters.po } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: {
      po: { include: { supplier: true } },
      poLine: true,
      invoice: true,
      product: true,
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take: 300,
  });

  const pending = recons.filter((row) => row.status !== "approved").length;
  // Flow §4: a difference has to be settled BEFORE the goods arrive. Anything
  // still open past its delivery date is a truck the warehouse cannot unload.
  const now = new Date();
  const lateForDelivery = recons.filter(
    (row) =>
      row.status !== "approved" &&
      row.deliveryDate != null &&
      row.deliveryDate < now
  ).length;
  const quantityIssues = recons.filter((row) => row.qtyStatus !== "match").length;
  const priceIssues = recons.filter(
    (row) => row.priceStatus === "higher" || row.priceStatus === "lower"
  ).length;

  return (
    <div>
      <PageHeader
        title="PO vs Invoice"
        description={`Quantity and price compared line by line, to be settled before the goods arrive. Tolerance: ${settings.qtyTolerancePct}% on quantity, ${settings.priceTolerancePct}% on price.`}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Lines compared" value={recons.length} />
        <KpiCard
          label="Waiting for purchasing"
          value={pending}
          tone={pending > 0 ? "danger" : "success"}
        />
        <KpiCard
          label="Quantity differences"
          value={quantityIssues}
          tone={quantityIssues > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Price differences"
          value={priceIssues}
          tone={priceIssues > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Past the delivery date"
          value={lateForDelivery}
          tone={lateForDelivery > 0 ? "danger" : "success"}
          hint="Receiving is blocked until these are settled"
        />
      </div>

      {recons.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nothing to reconcile — verify a supplier invoice to start the
            comparison.
          </CardContent>
        </Card>
      ) : (
        <ReconBoard
          canApprove={can(actor, "purchasing.approveVariance")}
          rows={recons.map((row) => ({
            id: row.id,
            poId: row.poId,
            poNumber: row.po.poNumber,
            supplierName: row.po.supplier.name,
            invoiceNumber: row.invoice?.invoiceNumber ?? null,
            productCode: row.product.code,
            productName: row.product.name,
            unit: row.product.unit,
            poQuantity: row.poQuantity,
            invoiceQuantity: row.invoiceQuantity,
            qtyDiff: row.qtyDiff,
            qtyDiffPct: row.qtyDiffPct,
            poUnitPrice: row.poUnitPrice,
            invoiceUnitPrice: row.invoiceUnitPrice,
            priceDiff: row.priceDiff,
            priceDiffPct: row.priceDiffPct,
            qtyStatus: row.qtyStatus,
            priceStatus: row.priceStatus,
            status: row.status,
            correctedQuantity: row.correctedQuantity,
            quantityReason: row.quantityReason,
            priceReason: row.priceReason,
            remark: row.remark,
            reviewedByName: row.reviewedByName,
            currency: row.po.currency,
            deliveryDate: row.deliveryDate?.toISOString() ?? null,
            dueDate: row.dueDate?.toISOString() ?? null,
            priority: row.priority,
          }))}
        />
      )}
    </div>
  );
}
