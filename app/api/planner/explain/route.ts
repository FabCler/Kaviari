import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getPlannerData } from "@/lib/planner";
import {
  AI_UNAVAILABLE_MESSAGE,
  completeText,
  isAiConfigured,
} from "@/lib/ai";
import { formatGrams, formatNumber, shortProductName } from "@/lib/format";

const bodySchema = z.object({ productId: z.string().min(1) });

const SYSTEM_PROMPT =
  "You are a knowledgeable inventory planner for a restaurant that buys Kaviari caviar. " +
  "Explain replenishment suggestions produced by a periodic-review (R, S) policy in plain, " +
  "confident language a chef-owner understands. The order-up-to level is " +
  "S = ADU x (lead time + review period + safety days), and the inventory position is " +
  "on hand + on order. Answer in 3-4 plain sentences, no headings, no bullet points, no markdown.";

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!isAiConfigured()) {
    return Response.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Recompute server-side — never trust client numbers.
  const planner = await getPlannerData();
  const row = planner.rows.find((r) => r.product.id === parsed.data.productId);
  if (!row) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  const { settings } = planner;
  const s = row.suggestion;
  const prompt = [
    `Product: ${shortProductName(row.product.name)} (${row.product.tinSizeGrams} g tins)`,
    `Average daily usage (ADU): ${formatNumber(row.aduGramsPerDay)} g/day${
      row.aduIsOverride ? " (manual override)" : ""
    }`,
    `Policy: lead time ${settings.leadTimeDays} days, review period ${settings.reviewPeriodDays} days, safety stock ${settings.safetyStockDays} days`,
    `Order-up-to level S: ${formatGrams(s.orderUpToGrams)}`,
    `On hand: ${formatNumber(row.onHandTins)} tins (${formatGrams(row.onHandGrams)})`,
    `On order (open POs): ${formatNumber(row.onOrderTins)} tins (${formatGrams(row.onOrderGrams)})`,
    `Gap to S: ${formatGrams(s.suggestedGrams)}`,
    `Suggested order: ${s.suggestedTins} tins (${formatGrams(s.roundedGrams)} after rounding up to whole tins)`,
    `Days of cover from on-hand stock: ${
      s.daysOfCover == null ? "no recent consumption" : formatNumber(s.daysOfCover, 0) + " days"
    }`,
    "",
    "Explain why this order quantity is suggested.",
  ].join("\n");

  try {
    const explanation = await completeText({
      system: SYSTEM_PROMPT,
      prompt,
      maxTokens: 512,
    });
    return Response.json({ explanation });
  } catch {
    return Response.json(
      { error: "The AI explanation could not be generated. Please try again." },
      { status: 502 }
    );
  }
}
