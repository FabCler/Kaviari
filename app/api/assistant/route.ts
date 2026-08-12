import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  AI_MODEL,
  AI_UNAVAILABLE_MESSAGE,
  getAnthropic,
  isAiConfigured,
} from "@/lib/ai";
import { buildBusinessSummary } from "@/lib/data-summary";

const bodySchema = z.object({
  /** Existing chat session to continue; omit/null to start a new chat. */
  sessionId: z.string().min(1).nullish(),
  message: z.string().trim().min(1).max(4000),
});

const SYSTEM_INTRO =
  "You are the Caviar Assistant for a seafood business buying from Kaviari Paris. " +
  "You help with inventory, replenishment, purchasing, consumption analysis and " +
  "marketing for their caviar cellar. Be concise, concrete and numerate — cite the " +
  "actual figures from the snapshot when you answer. Use short paragraphs and " +
  "bullet lists; bold key numbers. Use the business snapshot below as your only " +
  "data source; if asked something outside it, say plainly what data you would " +
  "need. Quantities are in tins and grams; money is in the snapshot currency.";

/** First ~40 chars of the opening message, used as the session title. */
function titleFrom(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length > 40 ? `${compact.slice(0, 40).trimEnd()}…` : compact;
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  if (!isAiConfigured()) {
    return Response.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }
  const { sessionId, message } = parsed.data;

  // Continue an existing chat only if it belongs to this user.
  let session: { id: string; title: string } | null = null;
  if (sessionId) {
    session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId: user.id },
      select: { id: true, title: true },
    });
    if (!session) {
      return Response.json({ error: "Chat not found" }, { status: 404 });
    }
  }

  // Recent history (last 20 messages incl. the new one) goes to the model.
  let history: { role: "user" | "assistant"; content: string }[] = [];
  if (session) {
    const recent = await prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "desc" },
      take: 19,
    });
    history = recent
      .reverse()
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  }

  let reply: string;
  try {
    const summary = await buildBusinessSummary();
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1500,
      system: `${SYSTEM_INTRO}\n\n${summary}`,
      messages: [...history, { role: "user", content: message }],
    });
    reply = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
  } catch {
    return Response.json(
      { error: "The assistant request failed. Please try again." },
      { status: 502 }
    );
  }

  // Persist only after a successful AI call so no orphan messages are stored.
  const now = new Date();
  const replyAt = new Date(now.getTime() + 1);
  let title: string;
  let persistedSessionId: string;

  if (!session) {
    title = titleFrom(message);
    const created = await prisma.chatSession.create({
      data: {
        userId: user.id,
        title,
        messages: {
          create: [
            { role: "user", content: message, createdAt: now },
            { role: "assistant", content: reply, createdAt: replyAt },
          ],
        },
      },
    });
    persistedSessionId = created.id;
  } else {
    // Auto-title untitled sessions from their first user message.
    title = session.title === "New chat" ? titleFrom(message) : session.title;
    const updated = await prisma.chatSession.update({
      where: { id: session.id },
      data: {
        title,
        messages: {
          create: [
            { role: "user", content: message, createdAt: now },
            { role: "assistant", content: reply, createdAt: replyAt },
          ],
        },
      },
    });
    persistedSessionId = updated.id;
  }

  return Response.json({ reply, sessionId: persistedSessionId, title });
}
