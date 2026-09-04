import { z } from "zod";
import { osms } from "@/lib/osms/db";
import { requirePermission, isResponse } from "@/lib/osms/guard";
import { nextShipmentNumber } from "@/lib/osms/numbering";
import { recordAudit } from "@/lib/osms/audit";
import { notify } from "@/lib/osms/notify";
import { round } from "@/lib/osms/units";

export const dynamic = "force-dynamic";

/**
 * §18 — pick, pack and ship what was allocated. A shipment can only draw
 * from completed allocations, and never more than the allocation promised.
 */

const bodySchema = z.object({
  customerId: z.string().min(1),
  shipDate: z.string().optional(),
  deliveryLocation: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  allocationLineIds: z.array(z.string().min(1)).min(1).max(200),
});

export async function POST(request: Request) {
  const actor = await requirePermission("warehouse.ship");
  if (isResponse(actor)) return actor;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid shipment." }, { status: 400 });
  }
  const body = parsed.data;

  const customer = await osms.customer.findUnique({
    where: { id: body.customerId },
  });
  if (!customer) {
    return Response.json({ error: "Customer not found." }, { status: 404 });
  }

  const allocationLines = await osms.allocationLine.findMany({
    where: { id: { in: body.allocationLineIds } },
    include: {
      allocation: { include: { product: true } },
      items: true,
      shipmentLines: true,
    },
  });

  if (allocationLines.length !== body.allocationLineIds.length) {
    return Response.json(
      { error: "One or more allocation lines were not found." },
      { status: 404 }
    );
  }

  const wrongCustomer = allocationLines.find(
    (line) => line.target !== "customer" || line.customerId !== customer.id
  );
  if (wrongCustomer) {
    return Response.json(
      { error: "Every line on a shipment must belong to the same customer." },
      { status: 422 }
    );
  }
  const notCompleted = allocationLines.find(
    (line) => line.allocation.status !== "completed"
  );
  if (notCompleted) {
    return Response.json(
      {
        error: `Allocation ${notCompleted.allocation.allocationNumber} is not completed — shipment blocked (§21).`,
      },
      { status: 409 }
    );
  }
  const alreadyShipped = allocationLines.find(
    (line) => line.shipmentLines.length > 0
  );
  if (alreadyShipped) {
    return Response.json(
      { error: "One of the lines has already been shipped." },
      { status: 409 }
    );
  }

  const shipmentNumber = await nextShipmentNumber();
  const shipDate = body.shipDate
    ? new Date(
        body.shipDate.length <= 10 ? `${body.shipDate}T12:00:00Z` : body.shipDate
      )
    : new Date();

  const shipment = await osms.shipment.create({
    data: {
      shipmentNumber,
      customerId: customer.id,
      shipDate: Number.isNaN(shipDate.getTime()) ? new Date() : shipDate,
      deliveryLocation: body.deliveryLocation ?? customer.deliveryLocation ?? null,
      status: "shipped",
      createdByName: actor.name,
      shippedByName: actor.name,
      notes: body.notes ?? null,
      lines: {
        create: allocationLines.map((line) => ({
          allocationLineId: line.id,
          soLineId: line.soLineId,
          productId: line.allocation.productId,
          quantity: line.quantity,
          unit: line.unit,
          weight:
            line.items.length > 0
              ? round(line.items.reduce((sum, item) => sum + item.weight, 0))
              : null,
          itemRefs:
            line.items.length > 0
              ? line.items.map((item) => item.id).join(",")
              : null,
        })),
      },
    },
  });

  const itemIds = allocationLines.flatMap((line) =>
    line.items.map((item) => item.id)
  );
  if (itemIds.length > 0) {
    await osms.receivingItem.updateMany({
      where: { id: { in: itemIds } },
      data: { status: "shipped" },
    });
  }

  const soLineIds = allocationLines
    .map((line) => line.soLineId)
    .filter((id): id is string => Boolean(id));
  if (soLineIds.length > 0) {
    await osms.salesOrderLine.updateMany({
      where: { id: { in: soLineIds } },
      data: { status: "COMPLETED" },
    });
    const soIds = await osms.salesOrderLine.findMany({
      where: { id: { in: soLineIds } },
      select: { soId: true },
    });
    for (const { soId } of soIds) {
      const open = await osms.salesOrderLine.count({
        where: { soId, status: { not: "COMPLETED" } },
      });
      await osms.salesOrder.update({
        where: { id: soId },
        data: { status: open === 0 ? "shipped" : "partially_shipped" },
      });
    }
  }

  await recordAudit(
    {
      entity: "shipment",
      entityId: shipment.id,
      documentNumber: shipmentNumber,
      actor,
    },
    [
      {
        action: "create",
        field: "status",
        newValue: "shipped",
        reason: `${allocationLines.length} line(s) to ${customer.name}`,
      },
    ]
  );

  await notify({
    department: "sales",
    type: "shipment_created",
    title: `${shipmentNumber} shipped to ${customer.name}`,
    body: `${allocationLines.length} line(s).`,
    documentType: "shipment",
    documentId: shipment.id,
    documentNumber: shipmentNumber,
    link: `/osms/warehouse/shipments/${shipment.id}`,
  });

  return Response.json(
    { id: shipment.id, shipmentNumber, status: shipment.status },
    { status: 201 }
  );
}
