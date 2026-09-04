import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Owner only: list all accounts (pending first). */
export async function GET() {
  const gate = await requireOwner();
  if (gate instanceof Response) return gate;

  const users = await prisma.user.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      department: true,
      allChannels: true,
      createdAt: true,
      channels: { select: { channelId: true } },
    },
  });
  const channels = await prisma.businessChannel.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true },
  });
  return Response.json({
    users: users.map((user) => ({
      ...user,
      channelIds: user.channels.map((row) => row.channelId),
    })),
    channels,
  });
}
