import { z } from "zod";
import { osms } from "@/lib/osms/db";
import { requirePermission, isResponse } from "@/lib/osms/guard";
import { nextReceiptNumber } from "@/lib/osms/numbering";
import { gateForPo, closePoExceptions, syncPoStatuses } from "@/lib/osms/workflow";
import { recordAudit } from "@/lib/osms/audit";
import { notify } from "@/lib/osms/notify";
import { round } from "@/lib/osms/units";
import { confirmedQuantity } from "@/lib/osms/reconcile";
import { validateItemAssignments } from "@/lib/osms/allocation";
import { receiveIntoStock } from "@/lib/osms/warehouse-stock";

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
  expiryDate: z.string().nullable().optional(),
  storageLocation: z.string().max(120).nullable().optional(),
  allocationLineId: z.string().nullable().optional(),
  condition: z.enum(["good", "damaged", "rejected"]).default("good"),
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

  const po = await osms.purchaseOrder.findUnique({
    where: { id: body.poId },
    include: {
      lines: {
        include: {
          product: true,
          receivingLines: { select: { actualQuantity: true } },
          allocations: {
            include: {
              lines: { include: { customer: true, soLine: { include: { so: true } } } },
            },
          },
          demandLinks: {
            include: { soLine: { include: { so: true } } },
          },
        },
      },
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

  // Lot / expiry are enforced from the product master (§35).
  for (const line of body.lines) {
    const poLine = poLineById.get(line.poLineId)!;
    if (poLine.product.lotRequired && !line.lotNumber?.trim()) {
      return Response.json(
        { error: `${poLine.product.name} requires a lot / batch number.` },
        { status: 422 }
      );
    }
    if (poLine.product.expiryRequired && !line.expiryDate) {
      return Response.json(
        { error: `${poLine.product.name} requires an expiry date.` },
        { status: 422 }
      );
    }
  }

  // §18 / §19 — weight-controlled products: every piece weighed, every piece
  // assigned, no piece assigned twice, and never to a customer outside the SO.
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

    const duplicates = items
      .map((item) => item.itemNo.trim())
      .filter((itemNo, index, all) => all.indexOf(itemNo) !== index);
    if (duplicates.length > 0) {
      return Response.json(
        { error: `Item number ${duplicates[0]} is used twice on this line.` },
        { status: 422 }
      );
    }

    const allocation = poLine.allocations[0];
    const customerLines = (allocation?.lines ?? []).filter(
      (allocationLine) => allocationLine.target === "customer"
    );
    const allowedLineIds = new Set(customerLines.map((entry) => entry.id));
    const stray = items.find(
      (item) => item.allocationLineId && !allowedLineIds.has(item.allocationLineId)
    );
    if (stray) {
      return Response.json(
        {
          error: `${stray.itemNo} is assigned to a customer that is not on this allocation.`,
        },
        { status: 422 }
      );
    }

    const lineQuantities = new Map(
      customerLines.map((allocationLine) => [
        allocationLine.id,
        allocationLine.quantity,
      ])
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

  // §23 — a receipt may not take a line past what was confirmed.
  for (const line of body.lines) {
    const poLine = poLineById.get(line.poLineId)!;
    const expected = confirmedQuantity({
      poQuantity: poLine.baseQuantity,
      correctedQuantity: poLine.correctedQuantity,
      invoiceVerified: true,
    });
    const alreadyReceived = round(
      poLine.receivingLines.reduce((sum, rl) => sum + rl.actualQuantity, 0)
    );
    const total = round(alreadyReceived + line.actualQuantity);
    if (total > expected + 0.0001) {
      return Response.json(
        {
          error: `${poLine.product.name}: ${alreadyReceived} already received, ${line.actualQuantity} more would exceed the confirmed ${expected}.`,
        },
        { status: 422 }
      );
    }
  }

  const receiptNumber = await nextReceiptNumber();
  const receivedDate = parseDay(body.receivedDate) ?? new Date();

  const receiving = await osms.receiving.create({
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
          const alreadyReceived = round(
            poLine.receivingLines.reduce((sum, rl) => sum + rl.actualQuantity, 0)
          );
          const cumulative = round(alreadyReceived + actual);
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
            // The status reflects the running total across deliveries, not
            // this one receipt in isolation (§23).
            status:
              cumulative >= expected - 0.0001
                ? "received"
                : cumulative > 0
                  ? "partial"
                  : "pending",
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
    await osms.receivingItem.createMany({
      data: line.items.map((item) => ({
        receivingLineId: receivingLine.id,
        itemNo: item.itemNo,
        weight: item.weight,
        unit: "KG",
        lotNumber: item.lotNumber ?? line.lotNumber ?? null,
        expiryDate: parseDay(item.expiryDate ?? line.expiryDate),
        storageLocation: item.storageLocation ?? line.storageLocation ?? null,
        allocationLineId: item.allocationLineId ?? null,
        condition: item.condition,
        receivedAt: receivedDate,
        status: item.allocationLineId ? "allocated" : "on_hand",
      })),
    });
  }

  // §24 — everything allocated to the warehouse rather than a customer is
  // booked as stock, carrying the chain that produced it so it can be traced
  // back to the order it was bought for.
  for (const receivingLine of receiving.lines) {
    const poLine = poLineById.get(receivingLine.poLineId)!;
    const allocation = poLine.allocations[0];
    const stockLines = (allocation?.lines ?? []).filter(
      (allocationLine) => allocationLine.target === "warehouse"
    );
    for (const stockLine of stockLines) {
      const existing = await osms.warehouseStock.findFirst({
        where: { allocationLineId: stockLine.id },
      });
      if (existing) continue;
      const originSoLine = poLine.demandLinks.find((link) => link.soLine)?.soLine;
      await receiveIntoStock({
        productId: poLine.productId,
        quantity: stockLine.quantity,
        unit: stockLine.unit,
        supplierId: po.supplierId,
        poId: po.id,
        invoiceId: po.invoices[0]?.id ?? null,
        originalSoLineId: originSoLine?.id ?? null,
        channelId: originSoLine?.so.channelId ?? null,
        receivingLineId: receivingLine.id,
        allocationLineId: stockLine.id,
        reason: stockLine.reason ?? "Leftover after customer allocation",
        location: stockLine.storageLocation ?? receivingLine.storageLocation,
        lotNumber: receivingLine.lotNumber,
        expiryDate: receivingLine.expiryDate,
        createdByName: actor.name,
      });
    }
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

  // The PO closes only when every line has had its confirmed quantity
  // delivered — a first partial delivery leaves it open (§23).
  const refreshedLines = await osms.purchaseOrderLine.findMany({
    where: { poId: po.id },
    include: { receivingLines: { select: { actualQuantity: true } } },
  });
  const allLinesComplete = refreshedLines.every((line) => {
    const expected = confirmedQuantity({
      poQuantity: line.baseQuantity,
      correctedQuantity: line.correctedQuantity,
      invoiceVerified: true,
    });
    const receivedSoFar = round(
      line.receivingLines.reduce((sum, rl) => sum + rl.actualQuantity, 0)
    );
    return receivedSoFar >= expected - 0.0001;
  });

  await osms.purchaseOrder.update({
    where: { id: po.id },
    data: { status: allLinesComplete ? "closed" : "received" },
  });

  if (allLinesComplete) await closePoExceptions(po.id, actor.name);
  await syncPoStatuses(po.id);

  await notify({
    department: "sales",
    type: "goods_received",
    title: `${po.poNumber} ${allLinesComplete ? "fully" : "partially"} received (${receiptNumber})`,
    body: allLinesComplete
      ? "Allocated quantities are ready to pick and ship."
      : "More deliveries are still expected against this order.",
    documentType: "receiving",
    documentId: receiving.id,
    documentNumber: receiptNumber,
    link: `/osms/warehouse/receiving/${receiving.id}`,
  });

  return Response.json(
    {
      id: receiving.id,
      receiptNumber,
      status: receiving.status,
      fullyReceived: allLinesComplete,
    },
    { status: 201 }
  );
}
