import { z } from "zod";
import { osms } from "@/lib/osms/db";
import { requirePermission, isResponse } from "@/lib/osms/guard";
import { nextPoNumber } from "@/lib/osms/numbering";
import { loadConverter, normalizeUnit, round } from "@/lib/osms/units";
import { auditEvent, recordAudit } from "@/lib/osms/audit";
import { raiseException } from "@/lib/osms/exceptions";
import { notify } from "@/lib/osms/notify";
import { syncPendingDemand, syncPoStatuses } from "@/lib/osms/workflow";
import { ORDER_ADJUSTMENT_REASONS } from "@/lib/osms/domain";

export const dynamic = "force-dynamic";

/**
 * §2 — create a purchase order from the demand board. Ordering more than the
 * demand is allowed (MOQ, pack size…) but never silently: a reason is
 * mandatory and lands on the line, the audit trail and the supplier summary.
 */

const lineSchema = z
  .object({
    productId: z.string().min(1),
    // Demand lines this PO line covers.
    prLineIds: z.array(z.string()).default([]),
    soLineIds: z.array(z.string()).default([]),
    quantity: z.number().positive(),
    unit: z.string().min(1).max(16),
    unitPrice: z.number().min(0).default(0),
    priceUnit: z.string().max(16).nullable().optional(),
    deliveryDate: z.string().min(4),
    moq: z.number().min(0).nullable().optional(),
    adjustmentReason: z.enum(ORDER_ADJUSTMENT_REASONS).nullable().optional(),
    adjustmentNote: z.string().max(500).nullable().optional(),
    remark: z.string().max(500).nullable().optional(),
    // §8 — one SO line may be split across several POs: the planner says how
    // much of each demand line this PO covers. Missing = the whole line.
    soQuantities: z.record(z.string(), z.number().min(0)).optional(),
    mappingReason: z.string().max(500).nullable().optional(),
  })
  .strict();

const bodySchema = z.object({
  supplierId: z.string().min(1),
  poNumber: z.string().max(64).optional(),
  currency: z.string().max(8).default("EUR"),
  expectedDeliveryDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
  lines: z.array(lineSchema).min(1).max(200),
});

function parseDay(value: string): Date {
  const date = new Date(value.length <= 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export async function POST(request: Request) {
  const actor = await requirePermission("purchasing.createPo");
  if (isResponse(actor)) return actor;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid order.", detail: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const supplier = await osms.supplier.findUnique({
    where: { id: body.supplierId },
  });
  if (!supplier) {
    return Response.json({ error: "Supplier not found." }, { status: 404 });
  }

  const productIds = [...new Set(body.lines.map((line) => line.productId))];
  const products = await osms.product.findMany({
    where: { id: { in: productIds } },
  });
  if (products.length !== productIds.length) {
    return Response.json(
      { error: "One or more products do not exist." },
      { status: 400 }
    );
  }
  const productById = new Map(products.map((p) => [p.id, p]));
  const converter = await loadConverter(osms, productIds);

  // Demand covered by each line, in the inventory unit.
  const prLineIds = [...new Set(body.lines.flatMap((line) => line.prLineIds))];
  const soLineIds = [...new Set(body.lines.flatMap((line) => line.soLineIds))];
  const [prLines, soLines] = await Promise.all([
    prLineIds.length
      ? osms.purchaseRequestLine.findMany({ where: { id: { in: prLineIds } } })
      : Promise.resolve([]),
    soLineIds.length
      ? osms.salesOrderLine.findMany({ where: { id: { in: soLineIds } } })
      : Promise.resolve([]),
  ]);
  const prById = new Map(prLines.map((line) => [line.id, line]));
  const soById = new Map(soLines.map((line) => [line.id, line]));

  // Validate before writing anything: a half-created PO is worse than none.
  let prepared: PreparedLine[];
  try {
    prepared = buildLines();
  } catch (error) {
    if (error instanceof UnitError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }

  function buildLines(): PreparedLine[] {
    return body.lines.map((line, index) => {
      const product = productById.get(line.productId)!;
      const unit = normalizeUnit(line.unit);
      const masterUnit = normalizeUnit(product.unit);
      const baseQuantity =
        unit === masterUnit
          ? round(line.quantity)
          : converter.tryConvert(line.quantity, unit, masterUnit, product.id);
      if (baseQuantity == null) {
        throw new UnitError(
          `Line ${index + 1}: no conversion from ${unit} to ${masterUnit}.`
        );
      }
      const required = round(
        line.prLineIds.reduce(
          (sum, id) => sum + (prById.get(id)?.baseQuantity ?? 0),
          0
        ) +
          line.soLineIds
            .filter((id) => !prLines.some((pr) => pr.soLineId === id))
            .reduce((sum, id) => sum + (soById.get(id)?.baseQuantity ?? 0), 0)
      );
      return { input: line, product, unit, baseQuantity, required, index };
    });
  }

  const missingReason = prepared.find(
    (line) =>
      line.required > 0 &&
      line.baseQuantity > line.required &&
      !line.input.adjustmentReason
  );
  if (missingReason) {
    return Response.json(
      {
        error: `Line ${missingReason.index + 1} orders ${missingReason.baseQuantity} against a demand of ${missingReason.required} — a reason for the extra quantity is required.`,
        field: "adjustmentReason",
        lineIndex: missingReason.index,
      },
      { status: 422 }
    );
  }

  const poNumber = body.poNumber?.trim() || (await nextPoNumber());
  const existing = await osms.purchaseOrder.findUnique({
    where: { poNumber },
  });
  if (existing) {
    return Response.json(
      { error: `PO ${poNumber} already exists.` },
      { status: 409 }
    );
  }

  const expected = body.expectedDeliveryDate
    ? parseDay(body.expectedDeliveryDate)
    : prepared.reduce(
        (latest, line) => {
          const date = parseDay(line.input.deliveryDate);
          return date > latest ? date : latest;
        },
        parseDay(prepared[0].input.deliveryDate)
      );

  const po = await osms.purchaseOrder.create({
    data: {
      poNumber,
      supplierId: supplier.id,
      expectedDeliveryDate: expected,
      currency: body.currency.toUpperCase(),
      status: "issued",
      notes: body.notes ?? null,
      createdById: actor.id,
      createdByName: actor.name,
      lines: {
        create: prepared.map((line, index) => ({
          lineNo: index + 1,
          productId: line.product.id,
          quantity: line.input.quantity,
          unit: line.unit,
          baseQuantity: line.baseQuantity,
          unitPrice: line.input.unitPrice,
          priceUnit: line.input.priceUnit
            ? normalizeUnit(line.input.priceUnit)
            : null,
          currency: body.currency.toUpperCase(),
          deliveryDate: parseDay(line.input.deliveryDate),
          requiredQuantity: line.required,
          moq: line.input.moq ?? line.product.moq ?? supplier.moq ?? null,
          adjustmentReason: line.input.adjustmentReason ?? null,
          adjustmentNote: line.input.adjustmentNote ?? null,
          remark: line.input.remark ?? null,
          status: "PO_CREATED",
        })),
      },
    },
    include: { lines: true },
  });

  // Link demand and stamp the PO reference onto the demand lines.
  for (const [index, line] of prepared.entries()) {
    const poLine = po.lines[index];
    for (const prLineId of line.input.prLineIds) {
      const prLine = prById.get(prLineId);
      if (!prLine) continue;
      await osms.soPoMapping.create({
        data: {
          poId: po.id,
          poLineId: poLine.id,
          prLineId,
          soLineId: prLine.soLineId,
          soId: prLine.soLineId
            ? (soById.get(prLine.soLineId)?.soId ?? null)
            : null,
          productId: poLine.productId,
          quantity: prLine.baseQuantity,
          unit: poLine.unit,
          reason: line.input.mappingReason ?? null,
          createdById: actor.id,
          createdByName: actor.name,
        },
      });
      await osms.purchaseRequestLine.update({
        where: { id: prLineId },
        data: { poNumberRef: poNumber, status: "PO_CREATED" },
      });
    }
    for (const soLineId of line.input.soLineIds) {
      const soLine = soById.get(soLineId);
      if (!soLine) continue;
      const alreadyLinked = line.input.prLineIds.some(
        (prLineId) => prById.get(prLineId)?.soLineId === soLineId
      );
      if (!alreadyLinked) {
        await osms.soPoMapping.create({
          data: {
            poId: po.id,
            poLineId: poLine.id,
            soLineId,
            soId: soLine.soId,
            productId: poLine.productId,
            // The share of the PO line this SO line takes: what the planner
            // typed, or the whole demand when they did not split it.
            quantity: line.input.soQuantities?.[soLineId] ?? soLine.baseQuantity,
            unit: poLine.unit,
            reason: line.input.mappingReason ?? null,
            createdById: actor.id,
            createdByName: actor.name,
          },
        });
      }
      await osms.salesOrderLine.update({
        where: { id: soLineId },
        data: { poNumberRef: poNumber, status: "PO_CREATED" },
      });
    }

    if (line.required > 0 && line.baseQuantity > line.required) {
      await raiseException({
        type: line.input.adjustmentReason === "MOQ" ? "MOQ" : "PACK_SIZE",
        severity: "low",
        documentType: "po_line",
        documentId: poLine.id,
        documentNumber: poNumber,
        productId: line.product.id,
        description: `${poNumber} line ${poLine.lineNo}: ordered ${line.baseQuantity} against a demand of ${line.required}.`,
        reason: line.input.adjustmentReason ?? null,
        responsibleDept: "sales",
        action: "Decide where the extra quantity goes once the goods arrive.",
        createdByName: actor.name,
      });
    }
  }

  await recordAudit(
    { entity: "purchase_order", entityId: po.id, documentNumber: poNumber, actor },
    [
      {
        action: "create",
        field: "status",
        newValue: "issued",
        reason: `Created from the order board with ${po.lines.length} line(s)`,
      },
      ...prepared
        .filter((line) => line.baseQuantity > line.required && line.required > 0)
        .map((line, index) => ({
          action: "update",
          field: `line ${index + 1} quantity`,
          oldValue: line.required,
          newValue: line.baseQuantity,
          reason: line.input.adjustmentReason ?? "Quantity adjustment",
        })),
    ]
  );

  await syncPendingDemand();
  await syncPoStatuses(po.id);

  await notify({
    department: "purchasing",
    type: "po_created",
    title: `${poNumber} issued to ${supplier.name}`,
    body: `${po.lines.length} line(s). Upload the supplier invoice when it arrives.`,
    documentType: "po",
    documentId: po.id,
    documentNumber: poNumber,
    link: `/osms/trace/po/${po.id}`,
  });

  return Response.json(
    { id: po.id, poNumber, lineCount: po.lines.length },
    { status: 201 }
  );
}

class UnitError extends Error {}

interface PreparedLine {
  input: z.infer<typeof lineSchema>;
  product: { id: string; unit: string; moq: number | null };
  unit: string;
  baseQuantity: number;
  required: number;
  index: number;
}

export async function PATCH(request: Request) {
  const actor = await requirePermission("purchasing.editPo");
  if (isResponse(actor)) return actor;

  const schema = z.object({
    id: z.string().min(1),
    status: z
      .enum(["draft", "issued", "confirmed", "invoiced", "received", "closed", "cancelled"])
      .optional(),
    notes: z.string().max(2000).optional(),
    reason: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { id, status, notes, reason } = parsed.data;

  const po = await osms.purchaseOrder.findUnique({ where: { id } });
  if (!po) return Response.json({ error: "PO not found." }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (status && status !== po.status) data.status = status;
  if (notes !== undefined && notes !== po.notes) data.notes = notes;
  if (Object.keys(data).length === 0) return Response.json({ ok: true });

  await osms.purchaseOrder.update({ where: { id }, data });
  await auditEvent(
    { entity: "purchase_order", entityId: id, documentNumber: po.poNumber, actor },
    status ? "status_change" : "update",
    {
      field: status ? "status" : "notes",
      oldValue: status ? po.status : po.notes,
      newValue: status ?? notes,
      reason,
    }
  );
  await syncPoStatuses(id);
  return Response.json({ ok: true });
}
