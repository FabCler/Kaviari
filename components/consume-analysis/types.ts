import { z } from "zod";
import { CAVIAR_TYPES, PRODUCT_CATEGORIES } from "@/lib/domain";

/**
 * Serializable DTOs shared by the analysis page (server → client props),
 * the client view and the Excel export route, which rebuilds the exact same
 * aggregation server-side. No Prisma types cross this boundary.
 */

export interface AnalysisProduct {
  id: string;
  prCode: string;
  name: string;
  shortName: string;
  caviarType: string | null;
  category: string;
  unit: string;
  gramsPerUnit: number | null;
}

export interface AnalysisMovement {
  productId: string;
  /** ISO datetime of the movement. */
  date: string;
  /** Consumed units in the window (positive; sign already flipped). */
  units: number;
  /** Consumed grams equivalent (positive; 0 for non-weighed items). */
  grams: number;
}

export interface AnalysisForecast {
  userId: string;
  userName: string;
  productId: string;
  /** "YYYY-MM" — first day of the forecast month (UTC). */
  month: string;
  quantity: number;
}

export interface ForecastPerson {
  id: string;
  name: string;
}

export interface AnalysisData {
  products: AnalysisProduct[];
  movements: AnalysisMovement[];
  forecasts: AnalysisForecast[];
  people: ForecastPerson[];
}

// ---- filters ---------------------------------------------------------------

export const GRANULARITIES = ["weekly", "monthly"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export const WEEKLY_WINDOWS = [8, 13] as const;
export const MONTHLY_WINDOWS = [3, 6, 12] as const;

export const analysisFiltersSchema = z.object({
  granularity: z.enum(GRANULARITIES),
  /** Number of buckets in the rolling window (weeks or months). */
  window: z.number().int().min(1).max(26),
  scope: z.enum(["total", "by_type"]),
  /** Caviar types to compare (by_type scope). Empty = all types. */
  types: z.array(z.enum(CAVIAR_TYPES)).max(CAVIAR_TYPES.length),
  category: z.union([z.literal("all"), z.enum(PRODUCT_CATEGORIES)]),
  /** "all" (sum across users) or a user id. */
  personId: z.string().min(1).max(64),
  /** Overlay forecast series / KPI attainment. */
  compare: z.boolean(),
  /** Include zero-consumption, zero-forecast products in the table/export. */
  showAll: z.boolean(),
});

export type AnalysisFilters = z.infer<typeof analysisFiltersSchema>;
