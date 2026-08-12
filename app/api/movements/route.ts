import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { allocateFefo } from "@/lib/fefo";
import {
  OUTBOUND_MOVEMENT_TYPES,
  channelSchema,
  movementTypeSchema,
  type MovementType,
} from "@/lib/domain";

/** Round tin quantities to 2dp to avoid float drift on fractional tins. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const postSchema = z
  .object({
    productId: z.string().min(1),
    tins: z.number().positive().optional(),
    grams: z.number().positive().optional(),
    type: movementTypeSchema.refine(
      (t) => (OUTBOUND_MOVEMENT_TYPES as readonly string[]).includes(t),
      { message: "Movement type must remove stock" }
    ),
    channel: channelSchema,
    note: z.string().max(500).optional(),
  })
  .refine((d) => (d.tins != null) !== (d.grams != null), {
    message: "Provide either tins or grams (not both)",
  });

/**
 * Log an outbound movement (consumption / sale / waste / marketing sample).
 * FEFO allocation happens server-side: stock is drawn from the in-stock lot
 * with the soonest expiry first, possibly splitting across lots. One
 * StockMovement row is created per touched lot, inside one transaction.
 */
export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }
  const { productId, type, channel, note } = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  const tinsRequested =
    parsed.data.tins ?? round2((parsed.data.grams ?? 0) / (product.gramsPerUnit || 1));
  if (tinsRequested <= 0) {
    return Response.json(
      { error: "Quantity must be greater than zero" },
      { status: 400 }
    );
  }

  const now = new Date();

  // Lots are read and allocated INSIDE the transaction so two simultaneous
  // logs cannot both draw down the same lot.
  class ShortfallError extends Error {
    constructor(public availableTins: number) {
      super("shortfall");
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const lots = await tx.stockLot.findMany({
        where: { productId, status: "in_stock", quantityTins: { gt: 0 } },
        orderBy: { expiryDate: "asc" },
      });
      const { allocations, shortfallTins } = allocateFefo(lots, tinsRequested);
      if (shortfallTins > 0) {
        throw new ShortfallError(
          round2(lots.reduce((sum, lot) => sum + lot.quantityTins, 0))
        );
      }
      const lotById = new Map(lots.map((lot) => [lot.id, lot]));
      const movements = [];
      const allocatedLots: { lotNumber: string; tins: number }[] = [];
      for (const alloc of allocations) {
        const lot = lotById.get(alloc.lotId);
        if (!lot) continue; // cannot happen: allocations come from `lots`
        const movement = await tx.stockMovement.create({
          data: {
            productId,
            lotId: lot.id,
            type,
            channel,
            note: note?.trim() ? note.trim() : null,
            quantityTins: -alloc.tins,
            gramsEquivalent: -round2(alloc.tins * (product.gramsPerUnit ?? 0)),
            date: now,
          },
        });
        const remaining = round2(lot.quantityTins - alloc.tins);
        await tx.stockLot.update({
          where: { id: lot.id },
          data: {
            quantityTins: Math.max(0, remaining),
            status: remaining <= 0 ? "consumed" : "in_stock",
          },
        });
        movements.push(movement);
        allocatedLots.push({ lotNumber: lot.lotNumber, tins: alloc.tins });
      }
      return { movements, allocatedLots };
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ShortfallError) {
      return Response.json(
        {
          error: `Not enough stock: only ${error.availableTins} tins of ${product.name} available`,
          availableTins: error.availableTins,
        },
        { status: 409 }
      );
    }
    throw error;
  }
}

/**
 * Undo previously logged outbound movements: DELETE /api/movements?ids=a,b
 * Restores each movement's lot quantity (and in_stock status) and removes
 * the movement rows, all in one transaction.
 */
export async function DELETE(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const idsParam = new URL(request.url).searchParams.get("ids");
  const ids = (idsParam ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0 || ids.length > 50) {
    return Response.json(
      { error: "Provide 1-50 movement ids via ?ids=" },
      { status: 400 }
    );
  }

  const movements = await prisma.stockMovement.findMany({
    where: { id: { in: ids } },
  });
  if (movements.length !== ids.length) {
    return Response.json(
      { error: "Some movements no longer exist" },
      { status: 404 }
    );
  }
  const nonOutbound = movements.find(
    (m) =>
      m.quantityTins >= 0 ||
      !(OUTBOUND_MOVEMENT_TYPES as readonly string[]).includes(
        m.type as MovementType
      )
  );
  if (nonOutbound) {
    return Response.json(
      { error: "Only outbound movements can be undone" },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const movement of movements) {
      if (movement.lotId) {
        const lot = await tx.stockLot.findUnique({
          where: { id: movement.lotId },
        });
        if (lot) {
          const restored = round2(
            lot.quantityTins + Math.abs(movement.quantityTins)
          );
          await tx.stockLot.update({
            where: { id: lot.id },
            data: {
              quantityTins: restored,
              status:
                lot.status === "consumed" && restored > 0
                  ? "in_stock"
                  : lot.status,
            },
          });
        }
      }
      await tx.stockMovement.delete({ where: { id: movement.id } });
    }
  });

  return Response.json({ ok: true, deleted: movements.length });
}
