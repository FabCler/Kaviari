import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, isResponse } from "@/lib/scm/guard";
import { auditEvent, recordAudit } from "@/lib/scm/audit";
import { loadConverter, normalizeUnit, round } from "@/lib/scm/units";
import { matchInvoiceToPo } from "@/lib/scm/import/invoice";
import { runPoInvoiceReconciliation, syncPoStatuses } from "@/lib/scm/workflow";
import { resolveExceptions } from "@/lib/scm/exceptions";
import { notify } from "@/lib/scm/notify";

export const dynamic = "force-dynamic";

/**
 * Verify, correct or reject an extracted invoice (§1.3). Every field a human
 * changes is written to the audit trail *and* flagged on the line itself, so
 * the screen can show "read by the system" vs "corrected by Anna".
 */

const lineSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1).nullable().optional(),
  quantity: z.number().min(0).optional(),
  unit: z.string().min(1).max(16).optional(),
  unitPrice: z.number().min(0).optional(),
  priceUnit: z.string().max(16).nullable().optional(),
  deliveryDate: z.string().nullable().optional(),
  descriptionRaw: z.string().max(500).nullable().optional(),
});

const bodySchema = z.object({
  action: z.enum(["save", "verify", "reject"]).default("save"),
  invoiceNumber: z.string().min(1).max(64).optional(),
  poId: z.string().nullable().optional(),
  supplierId: z.string().nullable().optional(),
  invoiceDate: z.string().nullable().optional(),
  deliveryDate: z.string().nullable().optional(),
  currency: z.string().max(8).optional(),
  rejectReason: z.string().max(500).optional(),
  lines: z.array(lineSchema).max(500).optional(),
});

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(value.length <= 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requirePermission("purchasing.reconcilePoInvoice");
  if (isResponse(actor)) return actor;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const body = parsed.data;

  const invoice = await prisma.scmInvoice.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!invoice) {
    return Response.json({ error: "Invoice not found." }, { status: 404 });
  }
  if (invoice.status === "verified" && body.action !== "reject") {
    return Response.json(
      { error: "A verified invoice can no longer be edited — reject it first." },
      { status: 409 }
    );
  }

  const context = {
    entity: "invoice",
    entityId: invoice.id,
    documentNumber: invoice.invoiceNumber,
    actor,
  };

  // ---- header ------------------------------------------------------------
  const headerAudit: {
    action: string;
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }[] = [];
  const headerData: Record<string, unknown> = {};

  const assign = (field: string, value: unknown, current: unknown) => {
    if (value === undefined) return;
    const same =
      current instanceof Date && value instanceof Date
        ? current.getTime() === value.getTime()
        : current === value;
    if (same) return;
    headerData[field] = value;
    headerAudit.push({ action: "update", field, oldValue: current, newValue: value });
  };

  assign("invoiceNumber", body.invoiceNumber, invoice.invoiceNumber);
  assign("poId", body.poId, invoice.poId);
  assign("supplierId", body.supplierId, invoice.supplierId);
  assign("invoiceDate", toDate(body.invoiceDate), invoice.invoiceDate);
  assign("deliveryDate", toDate(body.deliveryDate), invoice.deliveryDate);
  assign("currency", body.currency?.toUpperCase(), invoice.currency);

  // ---- lines --------------------------------------------------------------
  const productIds = [
    ...new Set(
      (body.lines ?? [])
        .map((line) => line.productId)
        .filter((value): value is string => Boolean(value))
    ),
  ];
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds } } })
    : [];
  const converter = await loadConverter(prisma, productIds);
  const productById = new Map(products.map((p) => [p.id, p]));

  for (const input of body.lines ?? []) {
    const line = invoice.lines.find((candidate) => candidate.id === input.id);
    if (!line) continue;

    const edited = new Set(
      (line.editedFields ?? "").split(",").filter(Boolean)
    );
    const data: Record<string, unknown> = {};
    const audits: {
      action: string;
      field: string;
      oldValue: unknown;
      newValue: unknown;
    }[] = [];

    const setField = (field: string, value: unknown, current: unknown) => {
      if (value === undefined) return;
      const same =
        current instanceof Date && value instanceof Date
          ? current.getTime() === value.getTime()
          : current === value;
      if (same) return;
      data[field] = value;
      edited.add(field);
      audits.push({ action: "update", field, oldValue: current, newValue: value });
    };

    setField("productId", input.productId, line.productId);
    setField("quantity", input.quantity, line.quantity);
    setField(
      "unit",
      input.unit ? normalizeUnit(input.unit) : undefined,
      line.unit
    );
    setField("unitPrice", input.unitPrice, line.unitPrice);
    setField(
      "priceUnit",
      input.priceUnit === undefined
        ? undefined
        : input.priceUnit
          ? normalizeUnit(input.priceUnit)
          : null,
      line.priceUnit
    );
    setField("deliveryDate", toDate(input.deliveryDate), line.deliveryDate);
    setField("descriptionRaw", input.descriptionRaw, line.descriptionRaw);

    if (Object.keys(data).length === 0) continue;

    // Recompute the inventory-unit quantity whenever quantity/unit/product move.
    const productId = (data.productId as string | null) ?? line.productId;
    const product = productId ? productById.get(productId) : null;
    const quantity = (data.quantity as number | undefined) ?? line.quantity;
    const unit = (data.unit as string | undefined) ?? line.unit;
    if (product) {
      const masterUnit = normalizeUnit(product.unit);
      data.baseQuantity =
        normalizeUnit(unit) === masterUnit
          ? round(quantity)
          : (converter.tryConvert(quantity, unit, masterUnit, product.id) ??
            round(quantity));
    } else {
      data.baseQuantity = round(quantity);
    }

    data.editedFields = [...edited].join(",");

    await prisma.scmInvoiceLine.update({ where: { id: line.id }, data });
    await recordAudit(
      { ...context, entity: "invoice_line", entityId: line.id },
      audits.map((entry) => ({ ...entry, reason: "Manual correction after extraction" }))
    );
  }

  // ---- action -------------------------------------------------------------
  if (body.action === "reject") {
    headerData.status = "rejected";
    headerData.rejectReason = body.rejectReason ?? "Rejected by purchasing";
    headerAudit.push({
      action: "reject",
      field: "status",
      oldValue: invoice.status,
      newValue: "rejected",
    });
  } else if (body.action === "verify") {
    const refreshed = await prisma.scmInvoice.findUnique({
      where: { id },
      include: { lines: true },
    });
    const unmatched = refreshed?.lines.filter((line) => !line.productId) ?? [];
    if (unmatched.length > 0) {
      return Response.json(
        {
          error: `${unmatched.length} line(s) have no product — pick a product before verifying.`,
        },
        { status: 422 }
      );
    }
    const poId = (headerData.poId as string | undefined) ?? invoice.poId;
    if (!poId) {
      return Response.json(
        { error: "Link the invoice to a purchase order before verifying it." },
        { status: 422 }
      );
    }
    headerData.status = "verified";
    headerData.verifiedByName = actor.name;
    headerData.verifiedAt = new Date();
    headerAudit.push({
      action: "approve",
      field: "status",
      oldValue: invoice.status,
      newValue: "verified",
    });
  }

  if (Object.keys(headerData).length > 0) {
    await prisma.scmInvoice.update({ where: { id }, data: headerData });
  }
  if (headerAudit.length > 0) {
    await recordAudit(context, headerAudit);
  }

  const finalPoId = (headerData.poId as string | undefined) ?? invoice.poId;

  if (finalPoId && body.action !== "reject") {
    await matchInvoiceToPo(invoice.id);
    await prisma.scmPurchaseOrder.update({
      where: { id: finalPoId },
      data: { status: "invoiced" },
    });
    await resolveExceptions(
      { type: "INVOICE_WITHOUT_PO", documentType: "invoice", documentId: invoice.id },
      { resolution: "Invoice linked to a purchase order.", resolvedByName: actor.name }
    );
  }

  if (body.action === "verify" && finalPoId) {
    const result = await runPoInvoiceReconciliation(finalPoId, actor.name);
    await auditEvent(context, "status_change", {
      field: "reconciliation",
      newValue: `${result.created} line(s) compared, ${result.needsReview} needing review`,
    });
    return Response.json({ ok: true, status: "verified", reconciliation: result });
  }

  if (finalPoId) await syncPoStatuses(finalPoId);

  if (body.action === "reject") {
    await notify({
      department: "purchasing",
      type: "invoice_rejected",
      severity: "warning",
      title: `Invoice ${invoice.invoiceNumber} rejected`,
      body: body.rejectReason ?? null,
      documentType: "invoice",
      documentId: invoice.id,
      documentNumber: invoice.invoiceNumber,
    });
  }

  return Response.json({ ok: true, status: headerData.status ?? invoice.status });
}
