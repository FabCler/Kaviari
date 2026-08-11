import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-side Anthropic client. Every AI feature degrades gracefully when no
 * key is configured: callers check `isAiConfigured()` and surface
 * `AI_UNAVAILABLE_MESSAGE` instead of failing.
 */

export const AI_MODEL =
  process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929";

export const AI_UNAVAILABLE_MESSAGE =
  "AI features are disabled — set ANTHROPIC_API_KEY in your environment to enable the assistant, import analysis and content generation. Everything else works without it.";

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!isAiConfigured()) {
    throw new Error(AI_UNAVAILABLE_MESSAGE);
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Ask the model for a single JSON document. Strips markdown fences if the
 * model wraps its answer. Throws on unparseable output — callers validate
 * the parsed value with zod and surface a friendly error.
 */
export async function completeJson(options: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<unknown> {
  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: options.maxTokens ?? 8192,
    system: options.system,
    messages: [{ role: "user", content: options.prompt }],
  });
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  return parseJsonLoose(text);
}

export async function completeText(options: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: options.maxTokens ?? 2048,
    system: options.system,
    messages: [{ role: "user", content: options.prompt }],
  });
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(unfenced);
  } catch {
    // Fall back to the first {...} or [...] block in the text.
    const match = unfenced.match(/[[{][\s\S]*[\]}]/);
    if (match) return JSON.parse(match[0]);
    throw new Error("The AI response was not valid JSON.");
  }
}
