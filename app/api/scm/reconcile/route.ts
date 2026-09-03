import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, isResponse } from "@/lib/scm/guard";
import { recordAudit } from "@/lib/scm/audit";
import { resolveExceptions } from "@/lib/scm/exceptions";
import { notify } from "@/lib/scm/notify";
import { runSoReconciliation, syncPoStatuses } from "@/lib/scm/workflow";
import {
  PRICE_VARIANCE_REASONS,
  QUANTITY_VARIANCE_REASONS,
  SALES_DECISIONS,
} from "@/lib/scm/domain";
import { round } from "@/lib/scm/units";

export const dynamic = "force-dynamic";

/**
 * The two human decision points of the pipeline.
 *
 * `po_invoice` (§3.1/§3.2) — purchasing confirms the quantity that actually
 * arrived and why it differs. From that moment the corrected quantity, not
 * the ordered quantity, is what every later step uses (§14).
 *
 * `so` (§4.1/§4.2) — sales decides who absorbs a shortfall, or where an
 * excess goes. Receiving stays blocked until every open decision is made.
 */

const poInvoiceSchema = z.object({
  target: z.literal("po_invoice"),
  id: z.string().min(1),
  action: z.enum(["approve", "reject", "hold"]),
  correctedQuantity: z.number().min(0).optional(),
  quantityReason: z.enum(QUANTITY_VARIANCE_REASONS).nullable().optional(),
  priceReason: z.enum(PRICE_VARIANCE_REASONS).nullable().optional(),
  remark: z.string().max(1000).optional(),
});

const salesSchema = z.object({
  target: z.literal("so"),
  id: z.string().min(1),
  decision: z.enum(SALES_DECISIONS),
  newSoQuantity: z.number().min(0).optional(),
  customerAccepted: z.boolean().optional(),
  reason: z.string().min(1).max(500),
  remark: z.string().max(1000).optional(),
});

const bodySchema = z.discriminatedUnion("target", [poInvoiceSchema, salesSchema]);

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request.", detail: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }
  const body = parsed.data;

  return body.target === "po_invoice"
    ? handlePoInvoice(body)
    : handleSalesReview(body);
}

async function handlePoInvoice(body: z.infer<typeof poInvoiceSchema>) {
  const actor = await requirePermission("purchasing.approveVariance");
  if (isResponse(actor)) return actor;

  const recon = await prisma.scmPoInvoiceRecon.findUnique({
    where: { id: body.id },
    include: { po: true, poLine: true },
  });
  if (!recon) {
    return Response.json({ error: "Reconciliation line not found." }, { status: 404 });
  }
  if (recon.status === "approved" && body.action !== "reject") {
    return Response.json(
      { error: "This line is already approved." },
      { status: 409 }
    );
  }

  const context = {
    entity: "po_invoice_reconciliation",
    entityId: recon.id,
    documentNumber: recon.po.poNumber,
    actor,
  };

  if (body.action === "hold") {
    await prisma.scmPoInvoiceRecon.update({
      where: { id: recon.id },
      data: { status: "purchasing_review", remark: body.remark ?? recon.remark },
    });
    await recordAudit(context, [
      {
        action: "status_change",
        field: "status",
        oldValue: recon.status,
        newValue: "purchasing_review",
        reason: body.remark ?? null,
      },
    ]);
    return Response.json({ ok: true, status: "purchasing_review" });
  }

  if (body.action === "reject") {
    await prisma.scmPoInvoiceRecon.update({
      where: { id: recon.id },
      data: {
        status: "rejected",
        remark: body.remark ?? recon.remark,
        reviewedByName: actor.name,
        reviewedAt: new Date(),
      },
    });
    await prisma.scmPurchaseOrderLine.update({
      where: { id: recon.poLineId },
      data: {
        blockedReason: `PO/Invoice reconciliation rejected: ${body.remark ?? "no reason given"}`,
        status: "BLOCKED",
      },
    });
    await recordAudit(context, [
      {
        action: "reject",
        field: "status",
        oldValue: recon.status,
        newValue: "rejected",
        reason: body.remark ?? null,
      },
    ]);
    await notify({
      department: "purchasing",
      type: "recon_rejected",
      severity: "critical",
      title: `${recon.po.poNumber}: reconciliation rejected`,
      body: body.remark ?? "The line is blocked until the supplier issue is resolved.",
      documentType: "po",
      documentId: recon.poId,
      documentNumber: recon.po.poNumber,
    });
    return Response.json({ ok: true, status: "rejected" });
  }

  // ---- approve -----------------------------------------------------------
  const corrected =
    body.correctedQuantity != null
      ? round(body.correctedQuantity)
      : (recon.invoiceQuantity ?? recon.poQuantity);

  const quantityDiffers = recon.qtyStatus !== "match";
  const priceDiffers = recon.priceStatus === "higher" || recon.priceStatus === "lower";

  if (quantityDiffers && !body.quantityReason) {
    return Response.json(
      {
        error:
          "The invoice quantity differs from the PO — a reason is required before you can confirm.",
        field: "quantityReason",
      },
      { status: 422 }
    );
  }
  if (priceDiffers && !body.priceReason) {
    return Response.json(
      {
        error:
          "The invoice price differs from the PO — a reason is required before you can confirm.",
        field: "priceReason",
      },
      { status: 422 }
    );
  }

  await prisma.scmPoInvoiceRecon.update({
    where: { id: recon.id },
    data: {
      status: "approved",
      correctedQuantity: corrected,
      quantityReason: body.quantityReason ?? null,
      priceReason: body.priceReason ?? null,
      remark: body.remark ?? recon.remark,
      reviewedByName: actor.name,
      reviewedAt: new Date(),
    },
  });

  await prisma.scmPurchaseOrderLine.update({
    where: { id: recon.poLineId },
    data: {
      correctedQuantity: corrected,
      correctedReason: body.quantityReason ?? "CONFIRMED",
      correctedAt: new Date(),
      correctedByName: actor.name,
      remark: body.remark ?? recon.poLine.remark,
      blockedReason: null,
    },
  });

  await recordAudit(context, [
    {
      action: "approve",
      field: "status",
      oldValue: recon.status,
      newValue: "approved",
      reason: body.quantityReason ?? body.priceReason ?? null,
    },
    {
      action: "update",
      field: "correctedQuantity",
      oldValue: recon.poQuantity,
      newValue: corrected,
      reason: body.quantityReason ?? "Confirmed as ordered",
    },
  ]);
  await recordAudit(
    {
      entity: "purchase_order_line",
      entityId: recon.poLineId,
      documentNumber: recon.po.poNumber,
      actor,
    },
    [
      {
        action: "update",
        field: "quantity",
        oldValue: recon.poQuantity,
        newValue: corrected,
        reason: body.quantityReason ?? "PO/Invoice reconciliation",
      },
    ]
  );

  await resolveExceptions(
    { documentType: "po_line", documentId: recon.poLineId },
    {
      resolution: `Confirmed at ${corrected} (${body.quantityReason ?? "as ordered"}).`,
      resolvedByName: actor.name,
    }
  );

  const sales = await runSoReconciliation(recon.poId, actor.name);
  await syncPoStatuses(recon.poId);

  return Response.json({
    ok: true,
    status: "approved",
    correctedQuantity: corrected,
    salesReviewsCreated: sales.pending,
  });
}

async function handleSalesReview(body: z.infer<typeof salesSchema>) {
  const actor = await requirePermission("sales.reviewDifference");
  if (isResponse(actor)) return actor;

  const recon = await prisma.scmSoPoRecon.findUnique({
    where: { id: body.id },
    include: { soLine: { include: { so: true } }, poLine: { include: { po: true } } },
  });
  if (!recon) {
    return Response.json({ error: "Sales review not found." }, { status: 404 });
  }

  const context = {
    entity: "so_po_reconciliation",
    entityId: recon.id,
    documentNumber: recon.soLine.so.soNumber,
    actor,
  };

  // A shortfall must land somewhere: either the SO is reduced to the agreed
  // quantity, or the customer keeps the original order and someone else's
  // allocation covers it. Both need an explicit number.
  const newQuantity =
    body.decision === "reduce_so"
      ? (body.newSoQuantity ?? recon.confirmedQuantity)
      : body.decision === "increase_customer"
        ? (body.newSoQuantity ?? recon.confirmedQuantity)
        : recon.soQuantity;

  if (body.decision === "reduce_so" && newQuantity > recon.soQuantity) {
    return Response.json(
      { error: "A reduced order cannot be larger than the original SO quantity." },
      { status: 422 }
    );
  }
  if (body.decision === "increase_customer" && newQuantity < recon.soQuantity) {
    return Response.json(
      { error: "An increased order cannot be smaller than the original SO quantity." },
      { status: 422 }
    );
  }
  if (newQuantity > recon.confirmedQuantity && body.decision !== "keep_so") {
    return Response.json(
      {
        error: `Only ${recon.confirmedQuantity} was confirmed — the customer cannot be promised ${newQuantity}.`,
      },
      { status: 422 }
    );
  }

  await prisma.scmSoPoRecon.update({
    where: { id: recon.id },
    data: {
      status: "completed",
      decision: body.decision,
      reason: body.reason,
      customerAccepted: body.customerAccepted ?? null,
      newSoQuantity: newQuantity,
      remark: body.remark ?? null,
      reviewedByName: actor.name,
      reviewedAt: new Date(),
    },
  });

  const previous = recon.soLine.quantity;
  await prisma.scmSalesOrderLine.update({
    where: { id: recon.soLineId },
    data: {
      // The original quantity is never overwritten (originalQuantity) —
      // `quantity` becomes the agreed figure, `confirmedQuantity` what is
      // actually available to allocate.
      quantity: newQuantity,
      confirmedQuantity: Math.min(newQuantity, recon.confirmedQuantity),
      status: "SALES_REVIEW_COMPLETED",
    },
  });

  await recordAudit(context, [
    {
      action: "approve",
      field: "decision",
      oldValue: recon.decision,
      newValue: body.decision,
      reason: body.reason,
    },
    ...(newQuantity !== previous
      ? [
          {
            action: "update",
            field: "soQuantity",
            oldValue: previous,
            newValue: newQuantity,
            reason: body.reason,
          },
        ]
      : []),
    ...(body.customerAccepted != null
      ? [
          {
            action: "update",
            field: "customerAccepted",
            oldValue: null,
            newValue: body.customerAccepted,
            reason: body.reason,
          },
        ]
      : []),
  ]);

  await resolveExceptions(
    { documentType: "so_line", documentId: recon.soLineId },
    {
      resolution: `${body.decision} — ${body.reason}`,
      resolvedByName: actor.name,
    }
  );

  if (recon.poLine) {
    await syncPoStatuses(recon.poLine.poId);
  }

  const stillOpen = recon.poLine
    ? await prisma.scmSoPoRecon.count({
        where: {
          poLine: { poId: recon.poLine.poId },
          status: "pending_sales_review",
        },
      })
    : 0;

  if (stillOpen === 0 && recon.poLine) {
    await notify({
      department: "sales",
      type: "sales_review_done",
      title: `${recon.poLine.po.poNumber}: all differences reviewed`,
      body: "Allocate the confirmed quantities to customers and stock.",
      documentType: "po",
      documentId: recon.poLine.poId,
      documentNumber: recon.poLine.po.poNumber,
      link: `/scm/sales/allocation?po=${recon.poLine.poId}`,
    });
  }

  return Response.json({
    ok: true,
    status: "completed",
    newSoQuantity: newQuantity,
    remainingReviews: stillOpen,
  });
}
