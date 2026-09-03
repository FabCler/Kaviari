import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentActor } from "@/lib/scm/guard";
import { can } from "@/lib/scm/permissions";
import { gateForPo } from "@/lib/scm/workflow";
import { confirmedQuantity } from "@/lib/scm/reconcile";
import { getScmSettings } from "@/lib/scm/settings";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GateChecklist } from "@/components/scm/gate-checklist";
import { NoAccess } from "@/components/scm/no-access";
import { ReceiveForm } from "@/components/scm/warehouse/receive-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Receive goods — Kaviari Cellar" };

/** §7.1 — run the six checks, then record what physically arrived. */
export default async function NewReceivingPage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string }>;
}) {
  const actor = (await currentActor())!;
  if (!can(actor, "warehouse.view")) return <NoAccess what="warehouse receiving" />;

  const { po: poId } = await searchParams;
  if (!poId) redirect("/scm/warehouse/receiving");

  const po = await prisma.scmPurchaseOrder.findUnique({
    where: { id: poId },
    include: {
      supplier: true,
      receivings: true,
      lines: {
        include: {
          product: true,
          recons: true,
          allocations: { include: { lines: { include: { customer: true } } } },
        },
        orderBy: { lineNo: "asc" },
      },
    },
  });
  if (!po) notFound();

  if (po.receivings.length > 0) {
    redirect(`/scm/warehouse/receiving/${po.receivings[0].id}`);
  }

  const [gate, settings] = await Promise.all([gateForPo(po.id), getScmSettings()]);

  return (
    <div>
      <PageHeader
        title={`Receive ${po.poNumber}`}
        description={`${po.supplier.name} · expected ${formatDate(po.expectedDeliveryDate)}`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/scm/warehouse/receiving">Back to the queue</Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Receiving validation</CardTitle>
          </CardHeader>
          <CardContent>
            {gate ? <GateChecklist gate={gate} /> : null}
          </CardContent>
        </Card>

        {gate?.ready && can(actor, "warehouse.receive") ? (
          <ReceiveForm
            poId={po.id}
            poNumber={po.poNumber}
            defaultStorageLocation={settings.defaultStorageLocation}
            lines={po.lines.map((line) => {
              const recon = line.recons[0];
              const expected = confirmedQuantity({
                poQuantity: line.baseQuantity,
                invoiceQuantity: recon?.invoiceQuantity,
                correctedQuantity: line.correctedQuantity ?? recon?.correctedQuantity,
                invoiceVerified: true,
              });
              const allocation = line.allocations[0] ?? null;
              return {
                poLineId: line.id,
                productCode: line.product.prCode,
                productName: line.product.name,
                unit: line.product.unit,
                weightControlled: line.product.weightControlled,
                expectedQuantity: expected,
                allocationLines:
                  allocation?.lines
                    .filter((allocationLine) => allocationLine.target === "customer")
                    .map((allocationLine) => ({
                      id: allocationLine.id,
                      label: `${allocationLine.customer?.name ?? "Customer"} · ${allocationLine.quantity} ${allocationLine.unit}`,
                      quantity: allocationLine.quantity,
                    })) ?? [],
              };
            })}
          />
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {gate?.ready
                ? "Your department can view this order but not receive it."
                : "This order cannot be received yet — clear the failing check on the left first."}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
