import { prisma } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ShipmentBoard } from "./shipment-board";

export const metadata = { title: "Shipment Setup" };

export default async function ShipmentsPage() {
  await requireSection("shipments");
  const shipments = await prisma.shipment.findMany({
    orderBy: [{ eta: "asc" }, { code: "asc" }],
    include: {
      _count: { select: { poLines: true, invoiceLines: true, soLines: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Shipment Setup"
        subtitle="Create the shipment before importing the SAP extracts."
      />
      <ShipmentBoard
        shipments={shipments.map((s) => ({
          id: s.id,
          code: s.code,
          eta: s.eta ? s.eta.toISOString().slice(0, 10) : "",
          mode: s.mode,
          tolerancePct: s.tolerancePct,
          notes: s.notes,
          po: s._count.poLines,
          invoice: s._count.invoiceLines,
          so: s._count.soLines,
        }))}
      />
    </>
  );
}
