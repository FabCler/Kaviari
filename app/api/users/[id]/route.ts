import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEPARTMENTS } from "@/lib/scm/domain";
import { recordAudit } from "@/lib/scm/audit";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  action: z.enum(["approve", "reject", "set_department"]),
  // Supply-chain department driving the permission matrix (lib/scm/permissions).
  department: z.enum(DEPARTMENTS).optional(),
});

/** Owner only: approve/reject an access request, or set the department. */
export async function PATCH(request: Request, ctx: Ctx) {
  const gate = await requireOwner();
  if (gate instanceof Response) return gate;

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }
  if (user.role === "owner") {
    return Response.json(
      { error: "The owner account cannot be modified." },
      { status: 400 }
    );
  }
  if (parsed.data.action === "set_department") {
    if (!parsed.data.department) {
      return Response.json(
        { error: "A department is required." },
        { status: 400 }
      );
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { department: parsed.data.department },
      select: { id: true, department: true },
    });
    await recordAudit(
      { entity: "user", entityId: id, documentNumber: user.email, actor: gate },
      [
        {
          action: "update",
          field: "department",
          oldValue: user.department,
          newValue: parsed.data.department,
          reason: "Permission change",
        },
      ]
    );
    return Response.json({ ok: true, user: updated });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { status: parsed.data.action === "approve" ? "approved" : "rejected" },
    select: { id: true, status: true },
  });
  return Response.json({ ok: true, user: updated });
}

/** Owner only: remove an account. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const gate = await requireOwner();
  if (gate instanceof Response) return gate;

  const { id } = await ctx.params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }
  if (user.role === "owner") {
    return Response.json(
      { error: "The owner account cannot be deleted." },
      { status: 400 }
    );
  }
  await prisma.user.delete({ where: { id } });
  return Response.json({ ok: true });
}
