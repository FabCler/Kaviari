import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEPARTMENTS } from "@/lib/osms/domain";
import { recordAudit } from "@/lib/osms/audit";
import {
  findOsmsUser,
  resolveOsmsUser,
  setChannels,
  setDepartment,
} from "@/lib/osms/access";
import type { Actor } from "@/lib/osms/permissions";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  action: z.enum(["approve", "reject", "set_department", "set_channels"]),
  // OSMS department driving the permission matrix (lib/osms/permissions).
  department: z.enum(DEPARTMENTS).optional(),
  // Business channels a sales user may see (§39).
  channelIds: z.array(z.string().min(1)).max(50).optional(),
  // A sales manager sees every channel, including ones added later.
  allChannels: z.boolean().optional(),
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
  // OSMS writes its own audit rows, so the actor has to be the OSMS operator
  // behind this owner — resolved through the same email seam as everything else.
  const auditActor = async (): Promise<Actor> => {
    const operator = await resolveOsmsUser(gate.email, gate.name);
    return {
      id: operator.id,
      name: operator.name,
      role: gate.role,
      department: operator.department,
      allChannels: operator.allChannels,
    };
  };

  if (parsed.data.action === "set_department") {
    if (!parsed.data.department) {
      return Response.json(
        { error: "A department is required." },
        { status: 400 }
      );
    }
    // Departments live in the OSMS database, not on the host account. The two
    // are matched by email, so granting access here creates the OSMS operator
    // if this is the first time the address has been seen.
    const before = await findOsmsUser(user.email);
    const updated = await setDepartment(
      user.email,
      user.name,
      parsed.data.department
    );
    await recordAudit(
      { entity: "user", entityId: updated.id, documentNumber: user.email, actor: await auditActor() },
      [
        {
          action: "update",
          field: "department",
          oldValue: before?.department ?? "none",
          newValue: parsed.data.department,
          reason: "Permission change",
        },
      ]
    );
    return Response.json({
      ok: true,
      user: { id, department: updated.department },
    });
  }

  if (parsed.data.action === "set_channels") {
    const before = await findOsmsUser(user.email);
    const after = await setChannels(
      user.email,
      user.name,
      parsed.data.channelIds ?? [],
      parsed.data.allChannels ?? false
    );
    await recordAudit(
      { entity: "user", entityId: after.id, documentNumber: user.email, actor: await auditActor() },
      [
        {
          action: "update",
          field: "channels",
          oldValue: before?.allChannels
            ? "all channels"
            : before?.channelCodes.join(", ") || "none",
          newValue: after.allChannels
            ? "all channels"
            : after.channelCodes.join(", ") || "none",
          reason: "Channel permission change",
        },
      ]
    );
    return Response.json({ ok: true });
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
