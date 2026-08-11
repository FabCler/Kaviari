import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await ctx.params;

  const existing = await prisma.contentAsset.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Asset not found" }, { status: 404 });
  }
  await prisma.contentAsset.delete({ where: { id } });
  return Response.json({ ok: true });
}
