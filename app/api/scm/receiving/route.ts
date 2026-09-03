import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, isResponse } from "@/lib/scm/guard";
import { nextReceiptNumber } from "@/lib/scm/numbering";
import { gateForPo, closePoExceptions, syncPoStatuses } from "@/lib/scm/workflow";
import { recordAudit } from "@/lib/scm/audit";
import { notify } from "@/lib/scm/notify";
import { round } from "@/lib/scm/units";
import { confirmedQuantity } from "@/lib/scm/reconcile";
import { validateItemAssignments } from "@/lib/scm/allocation";

export const dynamic = "force-dynamic";

/**
 * §7 — warehouse receiving. Creating a receipt runs the six-check gate
 * server-side; a BLOCKED purchase order is refused here even if the button
 * somehow reached the browser.
 */

const itemSchema = z.object({
  itemNo: z.string().min(1).max(40),
  weight: z.number().positive(),
  lotNumber: z.string().max(60).nullable().optional(),
  storageLocation: z.string().max(120).nullable().optional(),
  allocationLineId: z.string().nullable().optional(),
});

const lineSchema = z.object({
  poLineId: z.string().min(1),
  actualQuantity: z.number().min(0),
  lotNumber: z.string().max(60).nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  storageLocation: z.string().max(120).nullable().optional(),
  remark: z.string().max(500).nullable().optional(),
  items: z.array(itemSchema).max(500).optional(),
});

const createSchema = z.object({
  poId: z.string().min(1),
  receivedDate: z.string().optional(),
  notes: z.string().max(1000).optional(),
  lines: z.array(lineSchema).min(1).max(200),
  complete: z.boolean().default(false),
});

function parseDay(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value.length <= 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: Request) {
  const actor = await requirePermission("warehouse.receive");
  if (isResponse(actor)) return actor;

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid receipt.", detail: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const po = await prisma.scmPurchaseOrder.findUnique({
    where: { id: body.poId },
    include: {
      lines: { include: { product: true, allocations: { include: { lines: true } } } },
      invoices: { where: { status: "verified" }, select: { id: true } },
    },
  });
  if (!po) return Response.json({ error: "PO not found." }, { status: 404 });

  // §21 — the gate is the law, whatever the client believes.
  const gate = await gateForPo(po.id);
  if (!gate?.ready) {
    return Response.json(
      {
        error: `BLOCKED — ${gate?.blockedReason ?? "the workflow checks did not pass."}`,
        checks: gate?.checks ?? [],
      },
      { status: 409 }
    );
  }

  const poLineById = new Map(po.lines.map((line) => [line.id, line]));
  for (const line of body.lines) {
    if (!poLineById.has(line.poLineId)) {
      return Response.json(
        { error: "A receipt line does not belong to this purchase order." },
        { status: 400 }
      );
    }
  }

  // Weight-controlled products: every piece must be weighed and assigned.
  for (const line of body.lines) {
    const poLine = poLineById.get(line.poLineId)!;
    if (!poLine.product.weightControlled) continue;
    const items = line.items ?? [];
    if (items.length === 0) {
      return Response.json(
        {
          error: `${poLine.product.name} is weighed piece by piece — record every item's weight before receiving.`,
        },
        { status: 422 }
      );
    }
    const allocation = poLine.allocations[0];
    const lineQuantities = new Map(
      (allocation?.lines ?? [])
        .filter((allocationLine) => allocationLine.target === "customer")
        .map((allocationLine) => [allocationLine.id, allocationLine.quantity])
    );
    const check = validateItemAssignments(
      items.map((item) => ({
        itemNo: item.itemNo,
        weight: item.weight,
        allocationLineId: item.allocationLineId ?? null,
      })),
      lineQuantities,
      0.05
    );
    if (!check.ok) {
      return Response.json(
        { error: check.errors[0], errors: check.errors },
        { status: 422 }
      );
    }
  }

  const receiptNumber = await nextReceiptNumber();
  const receivedDate = parseDay(body.receivedDate) ?? new Date();

  const receiving = await prisma.scmReceiving.create({
    data: {
      receiptNumber,
      poId: po.id,
      invoiceId: po.invoices[0]?.id ?? null,
      supplierId: po.supplierId,
      receivedDate,
      status: body.complete ? "completed" : "received",
      receivedByName: actor.name,
      notes: body.notes ?? null,
      lines: {
        create: body.lines.map((line) => {
          const poLine = poLineById.get(line.poLineId)!;
          const expected = confirmedQuantity({
            poQuantity: poLine.baseQuantity,
            correctedQuantity: poLine.correctedQuantity,
            invoiceVerified: true,
          });
          const actual = round(line.actualQuantity);
          return {
            poLineId: line.poLineId,
            productId: poLine.productId,
            expectedQuantity: expected,
            actualQuantity: actual,
            unit: poLine.product.unit,
            lotNumber: line.lotNumber ?? null,
            expiryDate: parseDay(line.expiryDate),
            storageLocation: line.storageLocation ?? null,
            remark: line.remark ?? null,
            status: actual >= expected ? "received" : actual > 0 ? "partial" : "pending",
          };
        }),
      },
    },
    include: { lines: true },
  });

  // Individually weighed pieces, with the customer each one goes to.
  for (const line of body.lines) {
    if (!line.items?.length) continue;
    const receivingLine = receiving.lines.find(
      (candidate) => candidate.poLineId === line.poLineId
    );
    if (!receivingLine) continue;
    await prisma.scmReceivingItem.createMany({
      data: line.items.map((item) => ({
        receivingLineId: receivingLine.id,
        itemNo: item.itemNo,
        weight: item.weight,
        unit: "KG",
        lotNumber: item.lotNumber ?? line.lotNumber ?? null,
        storageLocation: item.storageLocation ?? line.storageLocation ?? null,
        allocationLineId: item.allocationLineId ?? null,
        status: item.allocationLineId ? "allocated" : "on_hand",
      })),
    });
  }

  await recordAudit(
    {
      entity: "receiving",
      entityId: receiving.id,
      documentNumber: receiptNumber,
      actor,
    },
    [
      {
        action: "create",
        field: "status",
        newValue: receiving.status,
        reason: `Received against ${po.poNumber}`,
      },
      ...receiving.lines
        .filter((line) => line.actualQuantity !== line.expectedQuantity)
        .map((line) => ({
          action: "update",
          field: "actualQuantity",
          oldValue: line.expectedQuantity,
          newValue: line.actualQuantity,
          reason: line.remark ?? "Counted on arrival",
        })),
    ]
  );

  await prisma.scmPurchaseOrder.update({
    where: { id: po.id },
    data: { status: body.complete ? "closed" : "received" },
  });

  if (body.complete) await closePoExceptions(po.id, actor.name);
  await syncPoStatuses(po.id);

  await notify({
    department: "sales",
    type: "goods_received",
    title: `${po.poNumber} received (${receiptNumber})`,
    body: "Allocated quantities are ready to pick and ship.",
    documentType: "receiving",
    documentId: receiving.id,
    documentNumber: receiptNumber,
    link: `/scm/warehouse/receiving/${receiving.id}`,
  });

  return Response.json(
    { id: receiving.id, receiptNumber, status: receiving.status },
    { status: 201 }
  );
}
