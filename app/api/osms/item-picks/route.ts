import { z } from "zod";
import { osms } from "@/lib/osms/db";
import { requirePermission, isResponse } from "@/lib/osms/guard";
import { recordAudit } from "@/lib/osms/audit";
import { notify } from "@/lib/osms/notify";
import { resolveExceptions } from "@/lib/osms/exceptions";
import { validateItemAssignments } from "@/lib/osms/allocation";

export const dynamic = "force-dynamic";

/**
 * Flow §6.2 → §7 → §8 — sales picks which weighed piece goes to which customer.
 *
 * Ten fish that each weigh something different cannot be divided by arithmetic:
 * somebody has to decide that *this* 2.4 kg fish goes to the hotel and *that*
 * 1.9 kg one goes to the supermarket. That is a commercial decision about who
 * gets what, so it belongs to sales — the warehouse only weighs and, once this
 * endpoint has run, packs exactly what sales chose.
 *
 * The guard is arithmetic, not advice: every piece must be assigned, no piece
 * twice, and the weight assigned to each customer must land on what that
 * customer was allocated.
 */

const bodySchema = z.object({
  receivingLineId: z.string().min(1),
  assignments: z
    .array(
      z.object({
        itemId: z.string().min(1),
        /** null puts the piece back in the pool as unassigned. */
        allocationLineId: z.string().nullable(),
      })
    )
    .min(1)
    .max(500),
  remark: z.string().max(1000).optional(),
});

export async function POST(request: Request) {
  // Sales owns this decision. A warehouse account gets a 403 here even though
  // it is the one holding the fish.
  const actor = await requirePermission("sales.pickItems");
  if (isResponse(actor)) return actor;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request.", detail: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const line = await osms.receivingLine.findUnique({
    where: { id: body.receivingLineId },
    include: {
      product: true,
      items: true,
      receiving: { select: { receiptNumber: true } },
      poLine: {
        include: {
          allocations: {
            where: { status: { not: "cancelled" } },
            include: {
              lines: {
                include: {
                  customer: { select: { id: true, name: true } },
                  soLine: { select: { id: true, so: { select: { soNumber: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!line) {
    return Response.json({ error: "Receiving line not found." }, { status: 404 });
  }
  if (!line.product.weightControlled) {
    return Response.json(
      {
        error: `${line.product.name} divides evenly — the warehouse packs it without a sales pick.`,
      },
      { status: 422 }
    );
  }
  if (line.pickStatus === "not_required") {
    return Response.json(
      { error: "This line is not waiting for a sales pick." },
      { status: 409 }
    );
  }

  const customerLines = (line.poLine.allocations[0]?.lines ?? []).filter(
    (allocationLine) => allocationLine.target === "customer"
  );
  if (customerLines.length === 0) {
    return Response.json(
      {
        error:
          "There is no customer allocation on this purchase-order line yet — allocate the total weight before picking pieces.",
      },
      { status: 422 }
    );
  }

  const allowedLineIds = new Set(customerLines.map((entry) => entry.id));
  const itemById = new Map(line.items.map((item) => [item.id, item]));

  for (const assignment of body.assignments) {
    if (!itemById.has(assignment.itemId)) {
      return Response.json(
        { error: `Item ${assignment.itemId} is not on this receiving line.` },
        { status: 422 }
      );
    }
    if (
      assignment.allocationLineId &&
      !allowedLineIds.has(assignment.allocationLineId)
    ) {
      return Response.json(
        {
          error: `${itemById.get(assignment.itemId)!.itemNo} is assigned to a customer that is not on this allocation.`,
        },
        { status: 422 }
      );
    }
  }

  // Apply the submitted picks over the stored ones, then check the whole line:
  // a partial submission must still add up before it counts as picked.
  const assignmentById = new Map(
    body.assignments.map((entry) => [entry.itemId, entry.allocationLineId])
  );
  const merged = line.items.map((item) => ({
    itemNo: item.itemNo,
    weight: item.weight,
    allocationLineId: assignmentById.has(item.id)
      ? assignmentById.get(item.id)!
      : item.allocationLineId,
  }));

  const check = validateItemAssignments(
    merged,
    new Map(customerLines.map((entry) => [entry.id, entry.quantity])),
    0.05,
    new Map(
      customerLines.map((entry) => [
        entry.id,
        entry.customer?.name ?? entry.soLine?.so.soNumber ?? "Customer",
      ])
    )
  );
  if (!check.ok) {
    return Response.json(
      { error: check.errors[0], errors: check.errors },
      { status: 422 }
    );
  }

  const now = new Date();
  await osms.$transaction(async (tx) => {
    for (const assignment of body.assignments) {
      await tx.receivingItem.update({
        where: { id: assignment.itemId },
        data: {
          allocationLineId: assignment.allocationLineId,
          status: assignment.allocationLineId ? "allocated" : "on_hand",
        },
      });
    }
    await tx.receivingLine.update({
      where: { id: line.id },
      data: {
        pickStatus: "picked",
        pickedByName: actor.name,
        pickedAt: now,
        remark: body.remark ?? line.remark,
      },
    });
  });

  const byLine = new Map(customerLines.map((entry) => [entry.id, entry]));
  await recordAudit(
    {
      entity: "receiving_line",
      entityId: line.id,
      documentNumber: line.receiving.receiptNumber,
      actor,
    },
    body.assignments.map((assignment) => {
      const item = itemById.get(assignment.itemId)!;
      const target = assignment.allocationLineId
        ? byLine.get(assignment.allocationLineId)
        : null;
      return {
        action: "update" as const,
        field: `item ${item.itemNo}`,
        oldValue: item.allocationLineId ?? "unassigned",
        newValue: target
          ? `${target.customer?.name ?? "customer"} (${item.weight} ${item.unit})`
          : "unassigned",
        reason: body.remark ?? "Sales item pick",
      };
    })
  );

  await resolveExceptions(
    { type: "WEIGHT_BASED_PRODUCT", documentType: "receiving_line", documentId: line.id },
    { resolution: "Sales picked every piece.", resolvedByName: actor.name }
  );

  await notify({
    department: "warehouse",
    type: "items_picked",
    severity: "info",
    title: `${line.receiving.receiptNumber}: sales has picked ${line.product.name}`,
    body: `${line.items.length} pieces assigned across ${customerLines.length} customer${customerLines.length === 1 ? "" : "s"} — ready to pack.`,
    documentType: "receiving_line",
    documentId: line.id,
    documentNumber: line.receiving.receiptNumber,
  });

  return Response.json({
    ok: true,
    pickStatus: "picked",
    assigned: merged.filter((item) => item.allocationLineId).length,
    byCustomer: customerLines.map((entry) => ({
      allocationLineId: entry.id,
      customerName: entry.customer?.name ?? null,
      soNumber: entry.soLine?.so.soNumber ?? null,
      allocated: entry.quantity,
      assignedByWeight: check.assignedByLine.get(entry.id) ?? 0,
    })),
  });
}
