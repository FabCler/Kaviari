import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "@/lib/auth";
import {
  AI_MODEL,
  AI_UNAVAILABLE_MESSAGE,
  getAnthropic,
  isAiConfigured,
} from "@/lib/ai";
import { buildBusinessSummary } from "@/lib/data-summary";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(20)
    .refine((msgs) => msgs[msgs.length - 1]?.role === "user", {
      message: "The last message must come from the user",
    }),
});

const SYSTEM_INTRO =
  "You are the Caviar Assistant for a seafood business buying from Kaviari Paris. " +
  "You help with inventory, replenishment, purchasing, consumption analysis and " +
  "marketing for their caviar cellar. Be concise, concrete and numerate — cite the " +
  "actual figures from the snapshot when you answer. Use short paragraphs and " +
  "bullet lists; bold key numbers. Use the business snapshot below as your only " +
  "data source; if asked something outside it, say plainly what data you would " +
  "need. Quantities are in tins and grams; money is in the snapshot currency.";

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

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

  try {
    const summary = await buildBusinessSummary();
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1500,
      system: `${SYSTEM_INTRO}\n\n${summary}`,
      messages: parsed.data.messages,
    });
    const reply = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    return Response.json({ reply });
  } catch {
    return Response.json(
      { error: "The assistant request failed. Please try again." },
      { status: 502 }
    );
  }
}
