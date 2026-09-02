"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { record } from "@/lib/audit";
import { DEPARTMENTS } from "@/lib/permissions";

export type Result = { ok: true } | { ok: false; error: string };

const updateSchema = z.object({
  department: z.enum(DEPARTMENTS).optional(),
  role: z.enum(["member", "admin"]).optional(),
  status: z.enum(["pending", "approved", "blocked"]).optional(),
});

/**
 * Only an owner or admin changes an account, and the owner account can never
 * be demoted or blocked — somebody has to be able to let people back in.
 */
export async function updateUser(
  userId: string,
  patch: z.infer<typeof updateSchema>
): Promise<Result> {
  const actor = await requireAdmin();
  const parsed = updateSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "Unknown setting." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "That account no longer exists." };
  if (target.role === "owner" && (parsed.data.role || parsed.data.status))
    return { ok: false, error: "The owner account cannot be changed here." };

  await prisma.user.update({ where: { id: userId }, data: parsed.data });
  await record(
    actor.id,
    "user.update",
    target.email,
    Object.entries(parsed.data)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")
  );
  revalidatePath("/users");
  return { ok: true };
}

export async function removeUser(userId: string): Promise<Result> {
  const actor = await requireAdmin();
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "That account no longer exists." };
  if (target.role === "owner")
    return { ok: false, error: "The owner account cannot be removed." };
  if (target.id === actor.id)
    return { ok: false, error: "You cannot remove your own account." };
  await prisma.user.delete({ where: { id: userId } });
  await record(actor.id, "user.remove", target.email);
  revalidatePath("/users");
  return { ok: true };
}
