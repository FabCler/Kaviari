import { CAVIAR_TYPES } from "@/lib/domain";
import type {
  AnalysisData,
  AnalysisFilters,
  AnalysisProduct,
  ForecastPerson,
  Granularity,
} from "@/components/consume-analysis/types";

/**
 * Pure aggregation shared by the client view and the Excel export route.
 * Everything is computed in UTC so the client chart and the server-built
 * workbook bucket movements identically.
 */

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** Series id used when more than MAX_TYPE_SERIES caviar types are compared. */
export const OTHER_SERIES_ID = "Other";
export const MAX_TYPE_SERIES = 5;

export const WEEKLY_FORECAST_NOTE =
  "Forecasts are monthly; for weekly buckets each month's forecast is split evenly across its days.";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---- month / week helpers (all UTC) ----------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "2026-08" for any date within that UTC month. */
export function monthKeyOf(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/** Parse "YYYY-MM" to the first day of the month (UTC), or null. */
export function parseMonthKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, 1));
}

function monthLabel(key: string): string {
  const date = parseMonthKey(key);
  if (!date) return key;
  return date.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Monday 00:00 UTC of the week containing the timestamp. */
function weekStartMs(ms: number): number {
  const d = new Date(ms);
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - mondayOffset);
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function daysInMonthOf(ms: number): number {
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

// ---- buckets ----------------------------------------------------------------

export interface Bucket {
  /** "2026-08" (monthly) or "2026-08-10" week-start date (weekly). */
  key: string;
  label: string;
  /** [start, end) in ms UTC. */
  start: number;
  end: number;
}

export function buildBuckets(
  granularity: Granularity,
  window: number,
  now: Date
): Bucket[] {
  const buckets: Bucket[] = [];
  if (granularity === "monthly") {
    for (let i = window - 1; i >= 0; i--) {
      const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1);
      const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1);
      const key = monthKeyOf(new Date(start));
      buckets.push({ key, label: monthLabel(key), start, end });
    }
    return buckets;
  }
  const currentWeek = weekStartMs(now.getTime());
  for (let i = window - 1; i >= 0; i--) {
    const start = currentWeek - i * WEEK;
    buckets.push({
      key: isoDate(start),
      label: new Date(start).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      start,
      end: start + WEEK,
    });
  }
  return buckets;
}

// ---- result shapes -----------------------------------------------------------

export interface AnalysisSeries {
  /** Data key in chartData rows ("consumed", a caviar type, or "Other"). */
  id: string;
  label: string;
}

export type ChartRow = { key: string; label: string } & Record<string, number | string>;

export interface AnalysisRow {
  productId: string;
  prCode: string;
  name: string;
  caviarType: string | null;
  category: string;
  unit: string;
  units: number;
  grams: number;
  sharePct: number;
  avgPerWeek: number;
  forecast: number;
  variance: number;
}

export interface AnalysisResult {
  buckets: Bucket[];
  /** Elapsed weeks in the window (partial current bucket clamped to now). */
  weeks: number;
  /** Consumption series (one, or one per compared type + "Other"). */
  series: AnalysisSeries[];
  /** One row per bucket; series values by id, plus "forecast". */
  chartData: ChartRow[];
  rows: AnalysisRow[];
  totals: { units: number; grams: number; forecast: number; variance: number };
  kpis: {
    totalUnits: number;
    totalGrams: number;
    avgPerWeek: number;
    bestType: string | null;
    bestTypeUnits: number;
    forecastTotal: number;
    /** consumed / forecast, percent; null when there is no forecast. */
    attainmentPct: number | null;
  };
}

// ---- main --------------------------------------------------------------------

/** Caviar types effectively compared, in the fixed CAVIAR_TYPES order. */
export function effectiveTypes(filters: AnalysisFilters): string[] {
  const selected = filters.types.length > 0 ? new Set<string>(filters.types) : null;
  return CAVIAR_TYPES.filter((t) => !selected || selected.has(t));
}

function productMatches(p: AnalysisProduct, filters: AnalysisFilters, types: Set<string>): boolean {
  if (filters.category !== "all" && p.category !== filters.category) return false;
  if (filters.scope === "by_type") {
    if (!p.caviarType || !types.has(p.caviarType)) return false;
  }
  return true;
}

export function buildAnalysis(
  data: AnalysisData,
  filters: AnalysisFilters,
  now: Date
): AnalysisResult {
  const buckets = buildBuckets(filters.granularity, filters.window, now);
  const windowStart = buckets[0].start;
  const windowEnd = buckets[buckets.length - 1].end;
  const bucketIndex = new Map(buckets.map((b, i) => [b.key, i]));

  const types = effectiveTypes(filters);
  const typeSet = new Set(types);
  const products = data.products.filter((p) => productMatches(p, filters, typeSet));
  const productById = new Map(products.map((p) => [p.id, p]));

  // Series: one for "total" scope; per compared type otherwise, folding
  // anything past the 5 chart colors into "Other" (fixed order, never cycled).
  const coloredTypes = types.slice(0, MAX_TYPE_SERIES);
  const foldedTypes = new Set(types.slice(MAX_TYPE_SERIES));
  const series: AnalysisSeries[] =
    filters.scope === "total"
      ? [{ id: "consumed", label: "Consumed" }]
      : [
          ...coloredTypes.map((t) => ({ id: t, label: t })),
          ...(foldedTypes.size > 0 ? [{ id: OTHER_SERIES_ID, label: "Other" }] : []),
        ];
  const seriesIdFor = (p: AnalysisProduct): string => {
    if (filters.scope === "total") return "consumed";
    const type = p.caviarType ?? OTHER_SERIES_ID;
    return foldedTypes.has(type) ? OTHER_SERIES_ID : type;
  };

  // ---- consumption accumulation ----
  const perProduct = new Map<string, { units: number; grams: number }>();
  const perBucketSeries = buckets.map(() => new Map<string, number>());
  for (const m of data.movements) {
    const product = productById.get(m.productId);
    if (!product) continue;
    const t = Date.parse(m.date);
    if (Number.isNaN(t) || t < windowStart || t >= windowEnd) continue;
    const key =
      filters.granularity === "monthly"
        ? monthKeyOf(new Date(t))
        : isoDate(weekStartMs(t));
    const index = bucketIndex.get(key);
    if (index === undefined) continue;

    const acc = perProduct.get(product.id) ?? { units: 0, grams: 0 };
    acc.units += m.units;
    acc.grams += m.grams;
    perProduct.set(product.id, acc);

    const sid = seriesIdFor(product);
    perBucketSeries[index].set(sid, (perBucketSeries[index].get(sid) ?? 0) + m.units);
  }

  // ---- forecasts (person-filtered, summed across users otherwise) ----
  const forecastByProduct = new Map<string, Map<string, number>>();
  for (const f of data.forecasts) {
    if (filters.personId !== "all" && f.userId !== filters.personId) continue;
    if (!productById.has(f.productId)) continue;
    let months = forecastByProduct.get(f.productId);
    if (!months) {
      months = new Map();
      forecastByProduct.set(f.productId, months);
    }
    months.set(f.month, (months.get(f.month) ?? 0) + f.quantity);
  }

  /** Forecast for one product in one bucket (monthly direct; weekly prorated by day). */
  const bucketForecast = (months: Map<string, number>, bucket: Bucket): number => {
    if (filters.granularity === "monthly") return months.get(bucket.key) ?? 0;
    let total = 0;
    for (let day = bucket.start; day < bucket.end; day += DAY) {
      const monthly = months.get(monthKeyOf(new Date(day))) ?? 0;
      if (monthly > 0) total += monthly / daysInMonthOf(day);
    }
    return total;
  };

  const perBucketForecast = buckets.map(() => 0);
  const forecastPerProduct = new Map<string, number>();
  for (const [productId, months] of forecastByProduct) {
    let productTotal = 0;
    buckets.forEach((bucket, i) => {
      const value = bucketForecast(months, bucket);
      perBucketForecast[i] += value;
      productTotal += value;
    });
    if (productTotal > 0) forecastPerProduct.set(productId, productTotal);
  }

  // ---- table rows ----
  const totalUnits = [...perProduct.values()].reduce((sum, v) => sum + v.units, 0);
  const clampedEnd = Math.min(now.getTime(), windowEnd);
  const weeks = Math.max((clampedEnd - windowStart) / WEEK, 1 / 7);

  const rows: AnalysisRow[] = products
    .map((p) => {
      const consumed = perProduct.get(p.id) ?? { units: 0, grams: 0 };
      const forecast = forecastPerProduct.get(p.id) ?? 0;
      return {
        productId: p.id,
        prCode: p.prCode,
        name: p.shortName,
        caviarType: p.caviarType,
        category: p.category,
        unit: p.unit,
        units: round2(consumed.units),
        grams: round2(consumed.grams),
        sharePct: totalUnits > 0 ? round2((consumed.units / totalUnits) * 100) : 0,
        avgPerWeek: round2(consumed.units / weeks),
        forecast: round2(forecast),
        variance: round2(consumed.units - forecast),
      };
    })
    .sort((a, b) => b.units - a.units || a.name.localeCompare(b.name));

  const totals = rows.reduce(
    (acc, r) => {
      acc.units += r.units;
      acc.grams += r.grams;
      acc.forecast += r.forecast;
      return acc;
    },
    { units: 0, grams: 0, forecast: 0, variance: 0 }
  );
  totals.units = round2(totals.units);
  totals.grams = round2(totals.grams);
  totals.forecast = round2(totals.forecast);
  totals.variance = round2(totals.units - totals.forecast);

  // ---- chart data ----
  const chartData: ChartRow[] = buckets.map((bucket, i) => {
    const row: ChartRow = { key: bucket.key, label: bucket.label };
    for (const s of series) {
      row[s.id] = round2(perBucketSeries[i].get(s.id) ?? 0);
    }
    row.forecast = round2(perBucketForecast[i]);
    return row;
  });

  // ---- KPIs ----
  const unitsByType = new Map<string, number>();
  for (const [productId, acc] of perProduct) {
    const type = productById.get(productId)?.caviarType;
    if (!type) continue;
    unitsByType.set(type, (unitsByType.get(type) ?? 0) + acc.units);
  }
  let bestType: string | null = null;
  let bestTypeUnits = 0;
  for (const type of CAVIAR_TYPES) {
    const units = unitsByType.get(type) ?? 0;
    if (units > bestTypeUnits) {
      bestType = type;
      bestTypeUnits = units;
    }
  }

  const totalGrams = totals.grams;
  return {
    buckets,
    weeks: round2(weeks),
    series,
    chartData,
    rows,
    totals,
    kpis: {
      totalUnits: totals.units,
      totalGrams,
      avgPerWeek: round2(totals.units / weeks),
      bestType,
      bestTypeUnits: round2(bestTypeUnits),
      forecastTotal: totals.forecast,
      attainmentPct:
        totals.forecast > 0 ? Math.round((totals.units / totals.forecast) * 100) : null,
    },
  };
}

// ---- filter description (Excel info block, shared) ---------------------------

export function describeFilters(
  filters: AnalysisFilters,
  people: ForecastPerson[]
): [string, string][] {
  const period =
    filters.granularity === "weekly"
      ? `Last ${filters.window} weeks (weekly)`
      : `Last ${filters.window} months (monthly)`;
  const scope =
    filters.scope === "total"
      ? "Total consumption"
      : `By caviar type — ${effectiveTypes(filters).join(", ")}`;
  const category = filters.category === "all" ? "All categories" : filters.category;
  const person =
    filters.personId === "all"
      ? "All (sum)"
      : people.find((p) => p.id === filters.personId)?.name ?? "Unknown";
  return [
    ["Period", period],
    ["Scope", scope],
    ["Category", category],
    ["Forecast person", person],
    ["Compare vs forecast", filters.compare ? "On" : "Off"],
  ];
}
