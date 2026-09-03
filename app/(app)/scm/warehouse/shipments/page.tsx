import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentActor } from "@/lib/scm/guard";
import { can } from "@/lib/scm/permissions";
import { formatDate, formatNumber } from "@/lib/format";
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
import { ToneBadge, documentTone, humanize } from "@/components/scm/status-badge";
import { ShipmentPlanner } from "@/components/scm/warehouse/shipment-planner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shipments — Kaviari Cellar" };

/** §18 — pick, pack and ship the allocated quantities to each customer. */
export default async function ShipmentsPage() {
  const actor = (await currentActor())!;
  if (!can(actor, "warehouse.view")) return <NoAccess what="shipments" />;

  const [pending, shipments] = await Promise.all([
    prisma.scmAllocationLine.findMany({
      where: {
        target: "customer",
        shipmentLines: { none: {} },
        allocation: { status: "completed" },
      },
      include: {
        customer: true,
        soLine: { include: { so: true } },
        allocation: { include: { product: true, poLine: { include: { po: true } } } },
        items: true,
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    prisma.scmShipment.findMany({
      include: { customer: true, lines: { include: { product: true } } },
      orderBy: { shipDate: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Shipments"
        description="Allocated quantities that have been received and are ready to leave for the customer."
      />

      {can(actor, "warehouse.ship") ? (
        <ShipmentPlanner
          lines={pending.map((line) => ({
            id: line.id,
            customerId: line.customerId ?? "",
            customerName: line.customer?.name ?? "Unassigned",
            deliveryLocation: line.customer?.deliveryLocation ?? null,
            soNumber: line.soLine?.so.soNumber ?? null,
            poNumber: line.allocation.poLine?.po.poNumber ?? null,
            productCode: line.allocation.product.prCode,
            productName: line.allocation.product.name,
            quantity: line.quantity,
            unit: line.unit,
            itemCount: line.items.length,
            allocationNumber: line.allocation.allocationNumber,
          }))}
        />
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Shipment history</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {shipments.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">
              Nothing has shipped yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shipment</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Ship date</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipments.map((shipment) => (
                  <TableRow key={shipment.id}>
                    <TableCell className="font-medium">
                      {shipment.shipmentNumber}
                      <div className="text-xs text-muted-foreground">
                        {shipment.deliveryLocation ?? "-"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {shipment.customer.name}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(shipment.shipDate)}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {shipment.lines.length}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {formatNumber(
                        shipment.lines.reduce((sum, line) => sum + line.quantity, 0)
                      )}
                    </TableCell>
                    <TableCell>
                      <ToneBadge tone={documentTone(shipment.status)}>
                        {humanize(shipment.status)}
                      </ToneBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Need the whole chain?{" "}
        <Link href="/scm/po-vs-so" className="hover:text-gold-deep hover:underline">
          Compare PO against SO
        </Link>{" "}
        or open any document trace from the workflow dashboard.
      </p>
    </div>
  );
}
