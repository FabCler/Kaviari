import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import type { PoStatus } from "@/lib/domain";

const lineSchema = z.object({
  productId: z.string().min(1),
  quantityTins: z.number().positive(),
  unitCost: z.number().min(0),
});

/** Statuses in which a PO's header and lines may be corrected in place. */
const EDITABLE_STATUSES: readonly PoStatus[] = ["draft", "sent", "confirmed"];

const editSchema = z
  .object({
    reference: z.string().trim().min(1).max(60).optional(),
    orderDate: z.string().optional(),
    expectedDeliveryDate: z.string().optional(),
    notes: z.string().max(2000).nullable().optional(),
    status: z.enum(["draft", "sent", "confirmed"]).optional(),
    lines: z.array(lineSchema).max(200).optional(),
  })
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: "Nothing to update",
  });

const patchSchema = z
  .object({
    action: z.enum(["send", "confirm", "cancel"]).optional(),
    notes: z.string().max(2000).nullable().optional(),
    expectedDeliveryDate: z.string().optional(),
    lines: z.array(lineSchema).max(200).optional(),
    edit: editSchema.optional(),
  })
  .refine(
    (v) =>
      v.action !== undefined ||
      v.notes !== undefined ||
      v.expectedDeliveryDate !== undefined ||
      v.lines !== undefined ||
      v.edit !== undefined,
    { message: "Nothing to update" }
  )
  .refine(
    (v) =>
      v.edit === undefined ||
      (v.action === undefined &&
        v.notes === undefined &&
        v.expectedDeliveryDate === undefined &&
        v.lines === undefined),
    { message: "edit cannot be combined with other fields" }
  );

/** Legal status transitions keyed by action. */
const TRANSITIONS: Record<
  "send" | "confirm" | "cancel",
  { from: PoStatus[]; to: PoStatus }
> = {
  send: { from: ["draft"], to: "sent" },
  confirm: { from: ["sent"], to: "confirmed" },
  cancel: { from: ["sent", "confirmed"], to: "cancelled" },
};

type Ctx = { params: Promise<{ id: string }> };

function parseDate(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function validateLineProducts(
  lines: { productId: string }[]
): Promise<boolean> {
  if (lines.length === 0) return true;
  const products = await prisma.product.findMany({
    where: { id: { in: lines.map((l) => l.productId) } },
    select: { id: true },
  });
  const known = new Set(products.map((p) => p.id));
  return lines.every((l) => known.has(l.productId));
}

export async function PATCH(request: Request, ctx: Ctx) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await ctx.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const body = parsed.data;

  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) {
    return Response.json({ error: "Purchase order not found" }, { status: 404 });
  }

  // ---- Full edit (header + lines) for draft/sent/confirmed orders ----
  if (body.edit !== undefined) {
    const edit = body.edit;
    if (!EDITABLE_STATUSES.includes(po.status as PoStatus)) {
      return Response.json(
        {
          error: `A purchase order in status "${po.status}" can no longer be edited.`,
        },
        { status: 409 }
      );
    }

    let orderDate: Date | undefined;
    if (edit.orderDate !== undefined) {
      const d = parseDate(edit.orderDate);
      if (!d) {
        return Response.json({ error: "Invalid order date." }, { status: 400 });
      }
      orderDate = d;
    }
    let expectedDelivery: Date | undefined;
    if (edit.expectedDeliveryDate !== undefined) {
      const d = parseDate(edit.expectedDeliveryDate);
      if (!d) {
        return Response.json(
          { error: "Invalid expected delivery date." },
          { status: 400 }
        );
      }
      expectedDelivery = d;
    }

    if (edit.reference !== undefined && edit.reference !== po.reference) {
      const clash = await prisma.purchaseOrder.findUnique({
        where: { reference: edit.reference },
        select: { id: true },
      });
      if (clash && clash.id !== id) {
        return Response.json(
          { error: `Reference "${edit.reference}" is already used by another order.` },
          { status: 409 }
        );
      }
    }

    if (edit.lines !== undefined && !(await validateLineProducts(edit.lines))) {
      return Response.json(
        { error: "One or more products in the order do not exist." },
        { status: 400 }
      );
    }

    // A non-draft order (pipeline stock) must keep at least one line.
    const resultingStatus = (edit.status ?? po.status) as PoStatus;
    const resultingLineCount =
      edit.lines !== undefined
        ? edit.lines.length
        : await prisma.purchaseOrderLine.count({
            where: { purchaseOrderId: id },
          });
    if (resultingStatus !== "draft" && resultingLineCount === 0) {
      return Response.json(
        { error: "An order that has been sent needs at least one line." },
        { status: 422 }
      );
    }

    await prisma.$transaction(async (tx) => {
      if (edit.lines !== undefined) {
        await tx.purchaseOrderLine.deleteMany({
          where: { purchaseOrderId: id },
        });
        if (edit.lines.length > 0) {
          await tx.purchaseOrderLine.createMany({
            data: edit.lines.map((line) => ({
              purchaseOrderId: id,
              productId: line.productId,
              quantityTins: line.quantityTins,
              unitCost: line.unitCost,
            })),
          });
        }
      }
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          ...(edit.reference !== undefined ? { reference: edit.reference } : {}),
          ...(orderDate ? { orderDate } : {}),
          ...(expectedDelivery ? { expectedDeliveryDate: expectedDelivery } : {}),
          ...(edit.notes !== undefined ? { notes: edit.notes } : {}),
          ...(edit.status !== undefined ? { status: edit.status } : {}),
        },
      });
    });

    return Response.json({ ok: true, status: resultingStatus });
  }

  // ---- Draft edits (notes / expected delivery / replace-all lines) ----
  const wantsEdit =
    body.notes !== undefined ||
    body.expectedDeliveryDate !== undefined ||
    body.lines !== undefined;

  if (wantsEdit && po.status !== "draft") {
    return Response.json(
      { error: "Only draft purchase orders can be edited." },
      { status: 409 }
    );
  }

  let expectedDelivery: Date | undefined;
  if (body.expectedDeliveryDate !== undefined) {
    const d = parseDate(body.expectedDeliveryDate);
    if (!d) {
      return Response.json(
        { error: "Invalid expected delivery date." },
        { status: 400 }
      );
    }
    expectedDelivery = d;
  }

  if (body.lines !== undefined && !(await validateLineProducts(body.lines))) {
    return Response.json(
      { error: "One or more products in the order do not exist." },
      { status: 400 }
    );
  }

  // ---- Status transition ----
  let newStatus: PoStatus | undefined;
  if (body.action) {
    const transition = TRANSITIONS[body.action];
    if (!transition.from.includes(po.status as PoStatus)) {
      return Response.json(
        {
          error: `Cannot ${body.action} a purchase order in status "${po.status}".`,
        },
        { status: 409 }
      );
    }
    if (body.action === "send") {
      // An order with no lines (after any replace-all edit in this same
      // request) must not enter the pipeline.
      const lineCount =
        body.lines !== undefined
          ? body.lines.length
          : await prisma.purchaseOrderLine.count({
              where: { purchaseOrderId: id },
            });
      if (lineCount === 0) {
        return Response.json(
          { error: "Add at least one line before sending the order." },
          { status: 422 }
        );
      }
    }
    newStatus = transition.to;
  }

  await prisma.$transaction(async (tx) => {
    if (body.lines !== undefined) {
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      if (body.lines.length > 0) {
        await tx.purchaseOrderLine.createMany({
          data: body.lines.map((line) => ({
            purchaseOrderId: id,
            productId: line.productId,
            quantityTins: line.quantityTins,
            unitCost: line.unitCost,
          })),
        });
      }
    }
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(expectedDelivery ? { expectedDeliveryDate: expectedDelivery } : {}),
        ...(newStatus ? { status: newStatus } : {}),
      },
    });
  });

  // Sending an order starts the next review cycle.
  if (body.action === "send") {
    await setSetting("lastOrderDate", new Date().toISOString());
  }

  return Response.json({ ok: true, status: newStatus ?? po.status });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await ctx.params;
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) {
    return Response.json({ error: "Purchase order not found" }, { status: 404 });
  }
  if (po.status !== "draft") {
    return Response.json(
      { error: "Only draft purchase orders can be deleted." },
      { status: 409 }
    );
  }
  await prisma.purchaseOrder.delete({ where: { id } });
  return Response.json({ ok: true });
}
