import { z } from "zod";
import { channelSchema } from "@/lib/domain";

/**
 * Two schema families:
 *  - ai*Schema: what the model must return from an analysis (loose on
 *    matching — the server verifies every id and recomputes every derived
 *    number before anything reaches the preview).
 *  - commit*Schema: what the client may send to the commit endpoint (strict —
 *    ids are re-checked against the DB, quantities are bounded).
 */

const unmatchedSchema = z.object({
  label: z.string().min(1).max(300),
  reason: z.string().min(1).max(300),
});

export type AiUnmatched = z.infer<typeof unmatchedSchema>;

// ---------------------------------------------------------------- price list

export const aiPriceListSchema = z.object({
  rows: z
    .array(
      z.object({
        prCode: z.string().max(60).nullable(),
        name: z.string().min(1).max(200),
        caviarType: z.string().max(120).nullable(),
        gramsPerUnit: z.number().int().positive().max(100_000).nullable(),
        unitCost: z.number().nonnegative().max(1_000_000),
        currency: z.string().min(3).max(3).default("EUR"),
        matchedProductId: z.string().max(60).nullable(),
      })
    )
    .max(500),
  unmatched: z.array(unmatchedSchema).max(200).default([]),
});

export type AiPriceListResult = z.infer<typeof aiPriceListSchema>;

// ---------------------------------------------------------------- stock take

export const aiStockTakeSchema = z.object({
  rows: z
    .array(
      z.object({
        productId: z.string().min(1).max(60),
        countedTins: z.number().nonnegative().max(100_000),
      })
    )
    .max(500),
  unmatched: z.array(unmatchedSchema).max(200).default([]),
});

export type AiStockTakeResult = z.infer<typeof aiStockTakeSchema>;

// -------------------------------------------------------------- sales export

export const aiSalesSchema = z.object({
  rows: z
    .array(
      z.object({
        productId: z.string().min(1).max(60),
        date: z.string().min(4).max(40),
        tins: z.number().positive().max(10_000),
        channel: channelSchema.default("food_service"),
        note: z.string().max(300).nullable(),
      })
    )
    .max(2000),
  unmatched: z.array(unmatchedSchema).max(200).default([]),
});

export type AiSalesResult = z.infer<typeof aiSalesSchema>;

// ------------------------------------------------------------ commit payloads

export const commitPriceListSchema = z.object({
  mode: z.literal("price_list"),
  rows: z
    .array(
      z.object({
        prCode: z.string().max(60).nullable(),
        name: z.string().min(1).max(200),
        caviarType: z.string().max(120).nullable(),
        gramsPerUnit: z.number().int().positive().max(100_000).nullable(),
        unitCost: z.number().nonnegative().max(1_000_000),
        currency: z.string().length(3),
        matchedProductId: z.string().max(60).nullable(),
      })
    )
    .min(1)
    .max(500),
});

export const commitStockTakeSchema = z.object({
  mode: z.literal("stock_take"),
  rows: z
    .array(
      z.object({
        productId: z.string().min(1).max(60),
        countedTins: z.number().nonnegative().max(100_000),
      })
    )
    .min(1)
    .max(500),
});

export const commitSalesSchema = z.object({
  mode: z.literal("sales_export"),
  rows: z
    .array(
      z.object({
        productId: z.string().min(1).max(60),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be yyyy-mm-dd"),
        tins: z.number().positive().max(10_000),
        channel: channelSchema,
        note: z.string().max(300).nullable(),
      })
    )
    .min(1)
    .max(2000),
});

export const commitSchema = z.discriminatedUnion("mode", [
  commitPriceListSchema,
  commitStockTakeSchema,
  commitSalesSchema,
]);

export type CommitPayload = z.infer<typeof commitSchema>;

/** Compact one-line-per-issue summary for 422 responses. */
export function summarizeIssues(issues: z.core.$ZodIssue[]): string[] {
  return issues
    .slice(0, 8)
    .map(
      (issue) =>
        `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`
    );
}
