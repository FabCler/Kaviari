import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEPARTMENTS } from "@/lib/scm/domain";
import { recordAudit } from "@/lib/scm/audit";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  action: z.enum(["approve", "reject", "set_department", "set_channels"]),
  // Supply-chain department driving the permission matrix (lib/scm/permissions).
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

  if (parsed.data.action === "set_channels") {
    const channelIds = parsed.data.channelIds ?? [];
    const allChannels = parsed.data.allChannels ?? false;
    const before = await prisma.scmUserChannel.findMany({
      where: { userId: id },
      include: { channel: { select: { code: true } } },
    });

    await prisma.scmUserChannel.deleteMany({ where: { userId: id } });
    if (!allChannels && channelIds.length > 0) {
      const known = await prisma.businessChannel.findMany({
        where: { id: { in: channelIds } },
        select: { id: true },
      });
      await prisma.scmUserChannel.createMany({
        data: known.map((channel) => ({ userId: id, channelId: channel.id })),
      });
    }
    await prisma.user.update({ where: { id }, data: { allChannels } });

    const after = await prisma.scmUserChannel.findMany({
      where: { userId: id },
      include: { channel: { select: { code: true } } },
    });
    await recordAudit(
      { entity: "user", entityId: id, documentNumber: user.email, actor: gate },
      [
        {
          action: "update",
          field: "channels",
          oldValue: before.map((row) => row.channel.code).join(", ") || "none",
          newValue: allChannels
            ? "all channels"
            : after.map((row) => row.channel.code).join(", ") || "none",
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
