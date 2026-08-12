import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** Read, rename or delete one of the current user's chat sessions. */

async function findOwnedSession(id: string, userId: string) {
  return prisma.chatSession.findFirst({ where: { id, userId } });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await params;

  const session = await findOwnedSession(id, user.id);
  if (!session) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  const messages = await prisma.chatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
  });

  return Response.json({
    session: {
      id: session.id,
      title: session.title,
      updatedAt: session.updatedAt.toISOString(),
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await params;

  const session = await findOwnedSession(id, user.id);
  if (!session) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Title must be 1–120 characters" },
      { status: 400 }
    );
  }

  const updated = await prisma.chatSession.update({
    where: { id: session.id },
    data: { title: parsed.data.title },
  });

  return Response.json({
    session: {
      id: updated.id,
      title: updated.title,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await params;

  const session = await findOwnedSession(id, user.id);
  if (!session) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  await prisma.chatSession.delete({ where: { id: session.id } });
  return Response.json({ ok: true });
}
