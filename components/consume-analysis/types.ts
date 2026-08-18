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

export const GRANULARITIES = ["weekly", "monthly", "quarterly"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

/**
 * Period presets shown in the filter bar. Each maps to a bucket count for the
 * selected granularity via presetWindow() in aggregate.ts, so the serialized
 * filter state stays a plain { granularity, window } pair.
 */
export const PERIOD_PRESETS = [
  { id: "13w", label: "Last 13 weeks", short: "last 13 wks" },
  { id: "6m", label: "Last 6 months", short: "last 6 mo" },
  { id: "12m", label: "Last 12 months", short: "last 12 mo" },
  { id: "all", label: "Since Jan 2025 (all)", short: "since Jan 2025" },
] as const;
export type PeriodPresetId = (typeof PERIOD_PRESETS)[number]["id"];

/** Hard cap on bucket counts (covers weekly since Jan 2025 for years). */
export const MAX_WINDOW = 200;

/** How the chart draws consumption series (forecast stays a dashed line). */
export const CHART_STYLES = ["line", "bar"] as const;
export type ChartStyle = (typeof CHART_STYLES)[number];

export const analysisFiltersSchema = z.object({
  granularity: z.enum(GRANULARITIES),
  /** Number of buckets in the rolling window (weeks, months or quarters). */
  window: z.number().int().min(1).max(MAX_WINDOW),
  /**
   * Bucket keys the TABLE zooms to (empty = whole period). Each selected
   * bucket becomes its own "Consumed — <label>" column, ordered
   * chronologically. Chart and KPIs always cover the whole window; unknown
   * or stale keys are ignored (all-unknown falls back to the whole period).
   */
  tableBuckets: z.array(z.string().min(1).max(16)).max(MAX_WINDOW),
  scope: z.enum(["total", "by_type"]),
  /** Caviar types to compare (by_type scope). Empty = all types. */
  types: z.array(z.enum(CAVIAR_TYPES)).max(CAVIAR_TYPES.length),
  category: z.union([z.literal("all"), z.enum(PRODUCT_CATEGORIES)]),
  /** "all" (sum across users) or a user id. */
  personId: z.string().min(1).max(64),
  /** Overlay forecast series / KPI attainment. */
  compare: z.boolean(),
  /**
   * Overlay the same window one year earlier (N-1): monthly buckets compare
   * to the same month, quarterly to the same quarter of the previous year,
   * weekly to the bucket exactly 52 weeks earlier (Mondays stay aligned).
   */
  compareN1: z.boolean(),
  /** Include zero-consumption, zero-forecast products in the table/export. */
  showAll: z.boolean(),
});

export type AnalysisFilters = z.infer<typeof analysisFiltersSchema>;

// ---- in-app forecast editor --------------------------------------------------

export interface ForecastEditorProduct {
  id: string;
  prCode: string;
  name: string;
  caviarType: string | null;
  unit: string;
}

/**
 * Server-loaded snapshot for the "Edit forecasts" dialog: the forecastable
 * range (same products as the Excel template) and the CURRENT USER's saved
 * quantities keyed "productId|YYYY-MM" for the editable months.
 */
export interface ForecastEditorData {
  /** Editable months, "YYYY-MM", current month first. */
  months: string[];
  products: ForecastEditorProduct[];
  saved: Record<string, number>;
}
