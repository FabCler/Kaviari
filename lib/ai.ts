import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-side Anthropic client. Every AI feature degrades gracefully when no
 * key is configured: callers check `isAiConfigured()` and surface
 * `AI_UNAVAILABLE_MESSAGE` instead of failing.
 */

export const AI_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

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
 * Raised when the Anthropic API call itself fails. The message is safe to
 * show to the user and names the actual cause (bad key, credits, limits…)
 * instead of a generic "try again".
 */
export class AiRequestError extends Error {}

function mapAiError(error: unknown): never {
  if (error instanceof Anthropic.APIError) {
    const status = typeof error.status === "number" ? error.status : 0;
    const detail = error.message?.slice(0, 300) ?? "";
    if (status === 401) {
      throw new AiRequestError(
        "The Anthropic API rejected the key — check ANTHROPIC_API_KEY in your environment."
      );
    }
    if (status === 400 && /credit/i.test(detail)) {
      throw new AiRequestError(
        "Your Anthropic account is out of credits — add credits at console.anthropic.com → Billing."
      );
    }
    if (status === 404) {
      throw new AiRequestError(
        `The AI model "${AI_MODEL}" is not available for this API key — remove or fix the ANTHROPIC_MODEL variable.`
      );
    }
    if (status === 429) {
      throw new AiRequestError(
        "The AI is rate-limited right now — wait a minute and try again."
      );
    }
    if (status === 529 || status >= 500) {
      throw new AiRequestError(
        "The AI service is temporarily overloaded — try again in a moment."
      );
    }
    throw new AiRequestError(`AI request failed (${status}): ${detail}`);
  }
  if (error instanceof Error && /timeout|timed out/i.test(error.message)) {
    throw new AiRequestError(
      "The AI took too long to answer — try again, or upload a smaller file."
    );
  }
  throw error;
}

async function runMessage(options: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<Anthropic.Message> {
  const anthropic = getAnthropic();
  try {
    // Streaming avoids HTTP timeouts on long analyses; Claude Opus 5 thinks
    // by default and max_tokens caps thinking + answer together, so keep a
    // 16K floor to avoid truncated output on big extractions.
    const stream = anthropic.messages.stream({
      model: AI_MODEL,
      max_tokens: Math.max(options.maxTokens ?? 0, 16000),
      system: options.system,
      messages: [{ role: "user", content: options.prompt }],
    });
    const response = await stream.finalMessage();
    if (response.stop_reason === "refusal") {
      throw new AiRequestError(
        "The AI declined to process this content. Check the file and try again."
      );
    }
    if (response.stop_reason === "max_tokens") {
      throw new AiRequestError(
        "The file is too large for a single analysis — split it and upload the parts separately."
      );
    }
    return response;
  } catch (error) {
    if (error instanceof AiRequestError) throw error;
    mapAiError(error);
  }
}

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
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
  return parseJsonLoose(textOf(await runMessage(options)));
}

export async function completeText(options: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  return textOf(await runMessage(options)).trim();
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
