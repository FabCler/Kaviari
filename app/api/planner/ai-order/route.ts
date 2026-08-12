import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPlannerData } from "@/lib/planner";
import { roundUpToBox } from "@/lib/replenishment";
import { shortProductName } from "@/lib/format";
import { AI_UNAVAILABLE_MESSAGE, completeJson, isAiConfigured } from "@/lib/ai";

export const dynamic = "force-dynamic";

/**
 * AI order recommendation: the model reads the full replenishment picture
 * (stock, pipeline, ADU, policy and the team's monthly forecasts) and returns
 * a prioritized order plan — what to order NOW, what to order soon, what to
 * merely monitor. Quantities are always re-rounded to full supplier boxes
 * server-side and unknown PR codes are dropped: the AI proposes, the server
 * verifies.
 */

const SECTION_KEYS = ["order_now", "order_soon", "monitor"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

const SECTION_TITLES: Record<SectionKey, string> = {
  order_now: "Order now",
  order_soon: "Order soon",
  monitor: "Monitor",
};

const aiPlanSchema = z.object({
  summary: z.string(),
  sections: z.array(
    z.object({
      key: z.enum(SECTION_KEYS),
      title: z.string().optional().nullable(),
      items: z.array(
        z.object({
          prCode: z.string().min(1),
          name: z.string().optional().nullable(),
          units: z.number(),
          boxes: z.number().nullable().optional(),
          reason: z.string(),
        })
      ),
    })
  ),
});

interface AiOrderItem {
  prCode: string;
  name: string;
  units: number;
  boxes: number | null;
  reason: string;
}

interface AiOrderSection {
  key: SectionKey;
  title: string;
  items: AiOrderItem[];
}

interface AiOrderPlan {
  summary: string;
  sections: AiOrderSection[];
}

const SYSTEM_PROMPT = [
  "You are a senior purchasing analyst for Kaviari Cellar, a restaurant group that imports Kaviari caviar and fine seafood.",
  "Ordering follows a periodic-review policy: every order should cover demand over lead time + review period + safety days, counting stock on hand PLUS stock already on order (never double-order the pipeline).",
  "You receive one JSON snapshot per product: current stock, open-PO pipeline, average daily usage (ADU), box packing, and the team's summed monthly sales forecasts for the coming months.",
  "IMPORTANT: consumption logging has just started, so ADU may be 0 for most products — treat the monthly forecasts as the primary demand signal (convert them to daily demand: monthly quantity / 30) and fall back to ADU when no forecast exists.",
  "Produce the most precise prioritized order plan possible, as strict JSON only — no markdown, no commentary — in exactly this shape:",
  '{"summary": string, "sections": [{"key": "order_now"|"order_soon"|"monitor", "title": string, "items": [{"prCode": string, "name": string, "units": number, "boxes": number|null, "reason": string}]}]}',
  "Rules:",
  '- Sections in priority order: "order_now" first (stock + pipeline will not cover demand through the next delivery: order in the upcoming order), then "order_soon" (will need ordering within roughly the next review cycle), then "monitor" (worth watching: rising forecast, thin cover, no demand signal yet). Omit a section entirely when it has no items.',
  "- prCode MUST be one of the PR codes from the data. Never invent a code.",
  "- units is the recommended order quantity in the product's stock unit, a positive whole number, rounded UP to a multiple of packingPerBox when packing applies.",
  "- boxes = units / packingPerBox when packing applies, else null.",
  "- reason is one short sentence citing the numbers that drove the call (forecast vs. cover, pipeline, etc.).",
  "- summary is 2-3 sentences: overall order value of the moment, the biggest risks, what to do first.",
  "- Products with no demand signal and healthy stock need no item at all — keep the plan focused.",
].join("\n");

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export async function POST() {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!isAiConfigured()) {
    return Response.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  // ---- Gather the full replenishment picture -------------------------------
  const now = new Date();
  const planner = await getPlannerData(now);
  const { settings } = planner;

  // Summed monthly forecasts (all users) for the current + next 3 months.
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const monthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 4, 1)
  );
  const forecastRows = await prisma.forecast.groupBy({
    by: ["productId", "month"],
    where: { month: { gte: monthStart, lt: monthEnd } },
    _sum: { quantity: true },
  });
  const forecastByProduct = new Map<string, Record<string, number>>();
  for (const f of forecastRows) {
    const qty = f._sum.quantity ?? 0;
    if (qty <= 0) continue;
    const entry = forecastByProduct.get(f.productId) ?? {};
    entry[monthKey(f.month)] = Math.round(qty * 100) / 100;
    forecastByProduct.set(f.productId, entry);
  }

  const productData = planner.rows.map((row) => ({
    prCode: row.product.prCode,
    name: shortProductName(row.product.name),
    category: row.product.category,
    unit: row.product.unit,
    packingPerBox: row.product.packingPerBox,
    unitCost: row.product.unitCost,
    onHandUnits: row.onHandUnits,
    onOrderUnits: row.onOrderUnits,
    aduUnitsPerDay: Math.round(row.aduUnitsPerDay * 1000) / 1000,
    daysOfCover:
      row.suggestion.daysOfCover == null
        ? null
        : Math.round(row.suggestion.daysOfCover),
    policySuggestedUnits: row.suggestion.suggestedUnits,
    forecastUnitsByMonth: forecastByProduct.get(row.product.id) ?? {},
  }));

  const prompt = [
    `TODAY: ${now.toISOString().slice(0, 10)}`,
    `POLICY: lead time ${settings.leadTimeDays} days, review period ${settings.reviewPeriodDays} days, safety stock ${settings.safetyStockDays} days. An order placed today arrives in ~${settings.leadTimeDays} days; the next order after this one is ~${settings.reviewPeriodDays} days away.`,
    `PRODUCTS (JSON, forecastUnitsByMonth = summed team forecast in stock units per month):\n${JSON.stringify(productData)}`,
    "Build the prioritized order plan.",
  ].join("\n\n");

  let raw: unknown;
  try {
    raw = await completeJson({
      system: SYSTEM_PROMPT,
      prompt,
      maxTokens: 8192,
    });
  } catch {
    return Response.json(
      { error: "The recommendation could not be generated. Please try again." },
      { status: 502 }
    );
  }

  const validated = aiPlanSchema.safeParse(raw);
  if (!validated.success) {
    return Response.json(
      { error: "The AI returned an unexpected answer. Please try again." },
      { status: 422 }
    );
  }

  // ---- Server-side verification: known codes, full boxes -------------------
  const byPrCode = new Map(
    planner.rows.map((row) => [row.product.prCode, row.product])
  );

  const cleanedByKey = new Map<SectionKey, AiOrderSection>();
  for (const section of validated.data.sections) {
    const items: AiOrderItem[] = [];
    for (const item of section.items) {
      const product = byPrCode.get(item.prCode.trim());
      if (!product) continue; // never surface invented codes
      // Quantities always land on full boxes, whatever the AI said.
      const units = roundUpToBox(item.units, product.packingPerBox);
      if (units <= 0) continue;
      items.push({
        prCode: product.prCode,
        name: shortProductName(product.name),
        units,
        boxes:
          product.packingPerBox && product.packingPerBox > 0
            ? units / product.packingPerBox
            : null,
        reason: item.reason.trim().slice(0, 300),
      });
    }
    if (items.length === 0) continue;
    const existing = cleanedByKey.get(section.key);
    if (existing) {
      existing.items.push(...items);
    } else {
      cleanedByKey.set(section.key, {
        key: section.key,
        title: section.title?.trim() || SECTION_TITLES[section.key],
        items,
      });
    }
  }

  const plan: AiOrderPlan = {
    summary: validated.data.summary.trim(),
    // Always present sections in priority order, whatever order the AI chose.
    sections: SECTION_KEYS.flatMap((key) => cleanedByKey.get(key) ?? []),
  };

  return Response.json(plan);
}
