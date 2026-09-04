import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, isResponse } from "@/lib/scm/guard";
import { nextAllocationNumber } from "@/lib/scm/numbering";
import { validateAllocation, type AllocationLineInput } from "@/lib/scm/allocation";
import { confirmedQuantity } from "@/lib/scm/reconcile";
import { recordAudit } from "@/lib/scm/audit";
import { notify } from "@/lib/scm/notify";
import { raiseException, resolveExceptions } from "@/lib/scm/exceptions";
import { syncPoStatuses } from "@/lib/scm/workflow";
import { round } from "@/lib/scm/units";

export const dynamic = "force-dynamic";

/**
 * §6 — allocate the confirmed quantity to customers and to warehouse stock.
 * The invariant is absolute: an allocation only completes when
 * customers + stock = actual, and the receiving gate reads that flag.
 */

const lineSchema = z.object({
  target: z.enum(["customer", "warehouse"]),
  customerId: z.string().nullable().optional(),
  soLineId: z.string().nullable().optional(),
  quantity: z.number(),
  storageLocation: z.string().max(120).nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
  responsibleDept: z.string().max(60).nullable().optional(),
});

const bodySchema = z.object({
  poLineId: z.string().min(1),
  complete: z.boolean().default(false),
  /** Overrides the derived quantity — used after the goods are weighed. */
  actualQuantity: z.number().min(0).optional(),
  lines: z.array(lineSchema).max(100),
});

export async function POST(request: Request) {
  const actor = await requirePermission("sales.allocate");
  if (isResponse(actor)) return actor;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid allocation.", detail: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const poLine = await prisma.scmPurchaseOrderLine.findUnique({
    where: { id: body.poLineId },
    include: {
      po: true,
      product: true,
      recons: true,
      soPoRecons: true,
      shortageCases: {
        where: { status: { in: ["open", "pending_approval"] } },
        select: { caseNumber: true },
      },
      allocations: { include: { lines: true } },
      receivingLines: { include: { items: true } },
    },
  });
  if (!poLine) {
    return Response.json({ error: "PO line not found." }, { status: 404 });
  }

  const recon = poLine.recons[0];
  if (!recon || recon.status !== "approved") {
    return Response.json(
      {
        error:
          "The PO/Invoice reconciliation for this line is not approved yet — allocation is blocked (§21).",
      },
      { status: 409 }
    );
  }
  // §20 — a cross-channel shortage is a management decision, and nothing may
  // be allocated against the disputed quantity until it is made.
  if (poLine.shortageCases.length > 0) {
    return Response.json(
      {
        error: `Cross-channel shortage ${poLine.shortageCases
          .map((entry) => entry.caseNumber)
          .join(", ")} is waiting for a management decision — allocation is blocked.`,
      },
      { status: 409 }
    );
  }

  const openSalesReview = poLine.soPoRecons.filter(
    (row) => row.status === "pending_sales_review"
  ).length;
  if (openSalesReview > 0) {
    return Response.json(
      {
        error: `${openSalesReview} sales review(s) still open for this line — resolve them before allocating.`,
      },
      { status: 409 }
    );
  }

  // The actual quantity is the last confirmed figure, or the weighed total
  // once the warehouse has counted piece by piece (§6.2).
  const weighed = poLine.receivingLines.flatMap((line) => line.items);
  const derived =
    weighed.length > 0
      ? round(weighed.reduce((sum, item) => sum + item.weight, 0))
      : confirmedQuantity({
          poQuantity: poLine.baseQuantity,
          invoiceQuantity: recon.invoiceQuantity,
          correctedQuantity: poLine.correctedQuantity ?? recon.correctedQuantity,
          invoiceVerified: true,
        });
  const actualQuantity = body.actualQuantity ?? derived;

  const lines: AllocationLineInput[] = body.lines.map((line) => ({
    target: line.target,
    quantity: round(line.quantity),
    customerId: line.customerId ?? null,
    soLineId: line.soLineId ?? null,
    storageLocation: line.storageLocation ?? null,
    reason: line.reason ?? null,
    responsibleDept: line.responsibleDept ?? null,
  }));

  const validation = validateAllocation(actualQuantity, lines, {
    requireBalanced: body.complete,
  });
  if (!validation.ok) {
    return Response.json(
      { error: validation.errors[0], errors: validation.errors, totals: validation.totals },
      { status: 422 }
    );
  }

  const existing = poLine.allocations[0] ?? null;
  const allocationNumber = existing?.allocationNumber ?? (await nextAllocationNumber());

  const allocation = existing
    ? await prisma.scmAllocation.update({
        where: { id: existing.id },
        data: {
          actualQuantity,
          allocatedQuantity: validation.totals.allocatedQuantity,
          warehouseQuantity: validation.totals.warehouseQuantity,
          unallocatedQuantity: validation.totals.unallocatedQuantity,
          status: body.complete ? "completed" : "draft",
          completedByName: body.complete ? actor.name : null,
          completedAt: body.complete ? new Date() : null,
          lines: { deleteMany: {} },
        },
      })
    : await prisma.scmAllocation.create({
        data: {
          allocationNumber,
          productId: poLine.productId,
          poLineId: poLine.id,
          actualQuantity,
          unit: poLine.product.unit,
          allocatedQuantity: validation.totals.allocatedQuantity,
          warehouseQuantity: validation.totals.warehouseQuantity,
          unallocatedQuantity: validation.totals.unallocatedQuantity,
          status: body.complete ? "completed" : "draft",
          createdByName: actor.name,
          completedByName: body.complete ? actor.name : null,
          completedAt: body.complete ? new Date() : null,
        },
      });

  await prisma.scmAllocationLine.createMany({
    data: lines.map((line) => ({
      allocationId: allocation.id,
      target: line.target,
      customerId: line.customerId,
      soLineId: line.soLineId,
      quantity: line.quantity,
      unit: poLine.product.unit,
      storageLocation: line.storageLocation,
      reason: line.reason,
      responsibleDept: line.responsibleDept,
    })),
  });

  await recordAudit(
    {
      entity: "allocation",
      entityId: allocation.id,
      documentNumber: allocationNumber,
      actor,
    },
    [
      {
        action: existing ? "update" : "create",
        field: "allocation",
        oldValue: existing
          ? `${existing.allocatedQuantity} customers / ${existing.warehouseQuantity} stock`
          : null,
        newValue: `${validation.totals.allocatedQuantity} customers / ${validation.totals.warehouseQuantity} stock of ${actualQuantity}`,
        reason: body.complete ? "Allocation completed" : "Allocation saved",
      },
    ]
  );

  if (validation.totals.warehouseQuantity > 0) {
    await raiseException({
      type: "EXCESS_STOCK",
      severity: "low",
      documentType: "allocation",
      documentId: allocation.id,
      documentNumber: allocationNumber,
      productId: poLine.productId,
      description: `${validation.totals.warehouseQuantity} ${poLine.product.unit} of ${poLine.product.prCode} going to stock instead of a customer.`,
      reason: lines.find((line) => line.target === "warehouse")?.reason ?? null,
      responsibleDept:
        (lines.find((line) => line.target === "warehouse")?.responsibleDept as
          | "sales"
          | "warehouse"
          | undefined) ?? "warehouse",
      action: "Store the leftover and plan how it will be sold.",
      createdByName: actor.name,
    });
  }

  if (body.complete) {
    await resolveExceptions(
      { documentType: "po_line", documentId: poLine.id },
      { resolution: "Allocation completed.", resolvedByName: actor.name }
    );
    await notify({
      department: "warehouse",
      type: "allocation_completed",
      title: `${poLine.po.poNumber}: allocation completed`,
      body: `${poLine.product.name} — ${validation.totals.allocatedQuantity} to customers, ${validation.totals.warehouseQuantity} to stock.`,
      documentType: "allocation",
      documentId: allocation.id,
      documentNumber: allocationNumber,
      link: `/scm/warehouse/receiving?po=${poLine.poId}`,
    });
  }

  await syncPoStatuses(poLine.poId);

  return Response.json({
    id: allocation.id,
    allocationNumber,
    status: allocation.status,
    totals: validation.totals,
  });
}
