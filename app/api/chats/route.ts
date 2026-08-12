import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** Per-user chat sessions for the Caviar Assistant. */

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const sessions = await prisma.chatSession.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { messages: true } } },
  });

  return Response.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updatedAt.toISOString(),
      messageCount: s._count.messages,
    })),
  });
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  let title: string | undefined;
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }
    title = parsed.data.title;
  } catch {
    // Empty body is fine — default title.
  }

  const session = await prisma.chatSession.create({
    data: { userId: user.id, title: title ?? "New chat" },
  });

  return Response.json(
    {
      session: {
        id: session.id,
        title: session.title,
        updatedAt: session.updatedAt.toISOString(),
        messageCount: 0,
      },
    },
    { status: 201 }
  );
}
