import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findOsmsUsers } from "@/lib/osms/access";
import { osms } from "@/lib/osms/db";

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
      createdAt: true,
    },
  });
  // Department and channel scope come from the OSMS database, joined to these
  // accounts by email. An account that has never opened OSMS simply has none.
  const access = await findOsmsUsers(users.map((user) => user.email));
  const channels = await osms.businessChannel.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true },
  });
  return Response.json({
    users: users.map((user) => {
      const osmsUser = access.get(user.email);
      return {
        ...user,
        department: osmsUser?.department ?? "none",
        allChannels: osmsUser?.allChannels ?? false,
        channelIds: osmsUser?.channelIds ?? [],
      };
    }),
    channels,
  });
}
