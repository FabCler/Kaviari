import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  AI_UNAVAILABLE_MESSAGE,
  completeText,
  isAiConfigured,
} from "@/lib/ai";
import { contentTypeSchema } from "@/lib/domain";
import { formatDate } from "@/lib/format";

const TONES = ["refined", "warm", "playful"] as const;
const LENGTHS = ["short", "medium", "long"] as const;

const postSchema = z.object({
  type: contentTypeSchema,
  campaignId: z.string().min(1).nullable().optional(),
  productIds: z.array(z.string().min(1)).max(20).optional(),
  tone: z.enum(TONES).default("refined"),
  length: z.enum(LENGTHS).default("medium"),
  instructions: z.string().max(2000).optional(),
});

const SYSTEM_PROMPT =
  "You write for a premium seafood house sourcing caviar from Kaviari, Paris. " +
  "Luxury brand voice: elegant, knowledgeable, sensory, never pompous, no clichés, " +
  "no exclamation marks, no emoji. Write in English. Be specific about products " +
  "when facts are provided; never invent tasting notes, prices or availability " +
  "that were not given. Return only the finished copy — no preamble, no options, " +
  "no commentary.";

const TYPE_BRIEFS: Record<z.infer<typeof contentTypeSchema>, string> = {
  caption:
    "Write a social media caption. May end with 2-4 tasteful hashtags on a final line.",
  email:
    "Write a marketing email: a subject line on the first line prefixed 'Subject: ', then the body. Sign off as 'The Cellar'.",
  menu_description:
    "Write a menu description for a restaurant menu — evocative, precise, no headline.",
  event_invite:
    "Write an event invitation: an inviting headline, the occasion, what guests will taste, and a closing line asking them to reserve.",
};

const LENGTH_BRIEFS: Record<(typeof LENGTHS)[number], string> = {
  short: "Length: very short — 1-2 sentences (or ~40 words).",
  medium: "Length: a short paragraph, roughly 60-100 words.",
  long: "Length: 150-250 words.",
};

const TONE_BRIEFS: Record<(typeof TONES)[number], string> = {
  refined: "Tone: refined and understated.",
  warm: "Tone: warm and personal, still elegant.",
  playful: "Tone: playful but elegant — light, witty, never silly.",
};

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
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }
  const { type, campaignId, productIds, tone, length, instructions } =
    parsed.data;

  const [products, campaign] = await Promise.all([
    productIds && productIds.length > 0
      ? prisma.product.findMany({ where: { id: { in: productIds } } })
      : Promise.resolve([]),
    campaignId
      ? prisma.campaign.findUnique({
          where: { id: campaignId },
          include: { products: { include: { product: true } } },
        })
      : Promise.resolve(null),
  ]);

  const lines: string[] = [];
  lines.push(TYPE_BRIEFS[type]);
  lines.push(TONE_BRIEFS[tone]);
  lines.push(LENGTH_BRIEFS[length]);

  const factProducts =
    products.length > 0
      ? products
      : (campaign?.products.map((cp) => cp.product) ?? []);
  if (factProducts.length > 0) {
    lines.push("");
    lines.push("Product facts (use only these, do not invent):");
    for (const p of factProducts) {
      const facts = [
        p.name,
        p.caviarType ? `caviar type: ${p.caviarType}` : null,
        p.gramsPerUnit ? `tin size: ${p.gramsPerUnit} g` : null,
      ].filter(Boolean);
      lines.push(`- ${facts.join(", ")}`);
    }
  }

  if (campaign) {
    lines.push("");
    lines.push(
      `Campaign context: "${campaign.name}" (${campaign.type}), ` +
        `${formatDate(campaign.startDate)}${campaign.endDate ? ` to ${formatDate(campaign.endDate)}` : ""}.` +
        (campaign.notes ? ` Notes: ${campaign.notes}` : "")
    );
  }

  if (instructions?.trim()) {
    lines.push("");
    lines.push(`Extra instructions: ${instructions.trim()}`);
  }

  try {
    const text = await completeText({
      system: SYSTEM_PROMPT,
      prompt: lines.join("\n"),
      maxTokens: length === "long" ? 1200 : 600,
    });
    return Response.json({ text });
  } catch {
    return Response.json(
      { error: "The AI request failed. Please try again." },
      { status: 502 }
    );
  }
}
