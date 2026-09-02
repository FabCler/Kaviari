"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { record } from "@/lib/audit";

const shipmentSchema = z.object({
  code: z.string().min(1).max(60),
  eta: z.string().max(20).optional(),
  mode: z.enum(["Container", "Air", "Truck"]),
  tolerancePct: z.coerce.number().min(0).max(100),
  notes: z.string().max(2000).optional(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveShipment(
  id: string | null,
  formData: FormData
): Promise<ActionResult> {
  // A Server Function is reachable by a direct POST, so it checks access
  // itself rather than trusting the screen it was called from.
  const user = await requireSection("shipments");
  const parsed = shipmentSchema.safeParse({
    code: formData.get("code"),
    eta: formData.get("eta") ?? "",
    mode: formData.get("mode"),
    tolerancePct: formData.get("tolerancePct"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "Check the shipment details." };

  const data = {
    code: parsed.data.code.trim(),
    eta: parsed.data.eta ? new Date(parsed.data.eta) : null,
    mode: parsed.data.mode,
    tolerancePct: parsed.data.tolerancePct,
    notes: parsed.data.notes ?? "",
  };

  const clash = await prisma.shipment.findFirst({
    where: { code: data.code, ...(id ? { NOT: { id } } : {}) },
  });
  if (clash) return { ok: false, error: "A shipment with that ID already exists." };

  if (id) {
    await prisma.shipment.update({ where: { id }, data });
    await record(user.id, "shipment.update", data.code);
  } else {
    const created = await prisma.shipment.create({ data });
    await record(user.id, "shipment.create", created.code);
  }
  revalidatePath("/shipments");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteShipment(id: string): Promise<ActionResult> {
  const user = await requireSection("shipments");
  const shipment = await prisma.shipment.findUnique({ where: { id } });
  if (!shipment) return { ok: false, error: "That shipment no longer exists." };
  // Cascades to its documents, batches and line decisions.
  await prisma.shipment.delete({ where: { id } });
  await record(user.id, "shipment.delete", shipment.code);
  revalidatePath("/shipments");
  revalidatePath("/");
  return { ok: true };
}
