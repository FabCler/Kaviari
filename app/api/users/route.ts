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
      createdAt: true,
    },
  });
  return Response.json({ users });
}
