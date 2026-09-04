import { z } from "zod";
import { requirePermission, isResponse } from "@/lib/osms/guard";
import { moveStock } from "@/lib/osms/warehouse-stock";
import { auditEvent } from "@/lib/osms/audit";
import { osms } from "@/lib/osms/db";

export const dynamic = "force-dynamic";

/**
 * §24 — move warehouse stock. Quantity is never edited in place: every
 * movement writes a transaction with its running balance and a mandatory
 * reason, so the leftover's history stays reconstructable.
 */

const bodySchema = z.object({
  stockId: z.string().min(1),
  type: z.enum(["out", "adjust", "reserve", "release", "write_off"]),
  quantity: z.number().positive(),
  reason: z.string().min(1).max(500),
  referenceType: z.string().max(40).nullable().optional(),
  referenceId: z.string().max(60).nullable().optional(),
});

export async function POST(request: Request) {
  const actor = await requirePermission("warehouse.stock");
  if (isResponse(actor)) return actor;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid movement." },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const stock = await osms.warehouseStock.findUnique({
    where: { id: body.stockId },
  });
  if (!stock) {
    return Response.json({ error: "Stock record not found." }, { status: 404 });
  }

  const result = await moveStock(body.stockId, {
    type: body.type,
    quantity: body.quantity,
    reason: body.reason,
    referenceType: body.referenceType ?? null,
    referenceId: body.referenceId ?? null,
    byName: actor.name,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 422 });
  }

  await auditEvent(
    {
      entity: "warehouse_stock",
      entityId: body.stockId,
      documentNumber: stock.stockNumber,
      actor,
    },
    "update",
    {
      field: "quantity",
      oldValue: stock.quantity,
      newValue: result.balance,
      reason: `${body.type}: ${body.reason}`,
    }
  );

  return Response.json({ ok: true, balance: result.balance });
}
