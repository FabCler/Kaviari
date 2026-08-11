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

const patchSchema = z
  .object({
    action: z.enum(["send", "confirm", "cancel"]).optional(),
    notes: z.string().max(2000).nullable().optional(),
    expectedDeliveryDate: z.string().optional(),
    lines: z.array(lineSchema).max(200).optional(),
  })
  .refine(
    (v) =>
      v.action !== undefined ||
      v.notes !== undefined ||
      v.expectedDeliveryDate !== undefined ||
      v.lines !== undefined,
    { message: "Nothing to update" }
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
    expectedDelivery = new Date(body.expectedDeliveryDate);
    if (Number.isNaN(expectedDelivery.getTime())) {
      return Response.json(
        { error: "Invalid expected delivery date." },
        { status: 400 }
      );
    }
  }

  if (body.lines !== undefined && body.lines.length > 0) {
    const products = await prisma.product.findMany({
      where: { id: { in: body.lines.map((l) => l.productId) } },
      select: { id: true },
    });
    const known = new Set(products.map((p) => p.id));
    if (body.lines.some((l) => !known.has(l.productId))) {
      return Response.json(
        { error: "One or more products in the order do not exist." },
        { status: 400 }
      );
    }
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
