import { CAVIAR_TYPES } from "@/lib/domain";
import type {
  AnalysisData,
  AnalysisFilters,
  AnalysisProduct,
  ForecastPerson,
  Granularity,
  PeriodPresetId,
} from "@/components/consume-analysis/types";
import { MAX_WINDOW } from "@/components/consume-analysis/types";

/**
 * Pure aggregation shared by the client view and the Excel export route.
 * Everything is computed in UTC so the client chart and the server-built
 * workbook bucket movements identically.
 */

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** Consumption history uploads start in January 2025 (UTC). */
export const HISTORY_START_MS = Date.UTC(2025, 0, 1);

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

export function monthLabel(key: string): string {
  const date = parseMonthKey(key);
  if (!date) return key;
  return date.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2025-Q1" for any date within that UTC quarter. */
function quarterKeyOf(d: Date): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/** "Q1 2025" from a "2025-Q1" key. */
function quarterLabel(key: string): string {
  const m = /^(\d{4})-Q([1-4])$/.exec(key);
  return m ? `Q${m[2]} ${m[1]}` : key;
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
  /** "2026-08" (monthly), "2026-Q3" (quarterly) or week-start "2026-08-10". */
  key: string;
  label: string;
  /** Unambiguous label for selectors/headers ("Wk of 10 Aug 2026"). */
  longLabel: string;
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
      const label = monthLabel(key);
      buckets.push({ key, label, longLabel: label, start, end });
    }
    return buckets;
  }
  if (granularity === "quarterly") {
    const quarterMonth = Math.floor(now.getUTCMonth() / 3) * 3;
    for (let i = window - 1; i >= 0; i--) {
      const start = Date.UTC(now.getUTCFullYear(), quarterMonth - i * 3, 1);
      const end = Date.UTC(now.getUTCFullYear(), quarterMonth - (i - 1) * 3, 1);
      const key = quarterKeyOf(new Date(start));
      const label = quarterLabel(key);
      buckets.push({ key, label, longLabel: label, start, end });
    }
    return buckets;
  }
  const currentWeek = weekStartMs(now.getTime());
  // Axis labels carry a 2-digit year once the window spans more than a year.
  const withYear = window > 53;
  for (let i = window - 1; i >= 0; i--) {
    const start = currentWeek - i * WEEK;
    const startDate = new Date(start);
    buckets.push({
      key: isoDate(start),
      label: startDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        ...(withYear ? { year: "2-digit" as const } : {}),
        timeZone: "UTC",
      }),
      longLabel: `Wk of ${startDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })}`,
      start,
      end: start + WEEK,
    });
  }
  return buckets;
}

/**
 * The N-1 counterpart of a bucket: the same month/quarter one calendar year
 * earlier, or — weekly — the bucket exactly 52 weeks earlier, so Mondays stay
 * aligned and every current week maps to exactly one previous week.
 */
export function prevBucketOf(bucket: Bucket, granularity: Granularity): Bucket {
  if (granularity === "monthly") {
    const d = new Date(bucket.start);
    const start = Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), 1);
    const end = Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth() + 1, 1);
    const key = monthKeyOf(new Date(start));
    const label = monthLabel(key);
    return { key, label, longLabel: label, start, end };
  }
  if (granularity === "quarterly") {
    const d = new Date(bucket.start);
    const start = Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), 1);
    const end = Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth() + 3, 1);
    const key = quarterKeyOf(new Date(start));
    const label = quarterLabel(key);
    return { key, label, longLabel: label, start, end };
  }
  const start = bucket.start - 52 * WEEK;
  const startDate = new Date(start);
  return {
    key: isoDate(start),
    label: startDate.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }),
    longLabel: `Wk of ${startDate.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })}`,
    start,
    end: start + WEEK,
  };
}

// ---- period presets ----------------------------------------------------------

/**
 * Map a period preset to a bucket count for the granularity: buckets from the
 * one containing the preset's start date up to (and including) the current one.
 */
export function presetWindow(
  preset: PeriodPresetId,
  granularity: Granularity,
  now: Date
): number {
  const startMs =
    preset === "13w"
      ? weekStartMs(now.getTime()) - 12 * WEEK
      : preset === "6m"
        ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)
        : preset === "12m"
          ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)
          : HISTORY_START_MS;
  const start = new Date(Math.min(startMs, now.getTime()));
  let count: number;
  if (granularity === "weekly") {
    count =
      Math.floor((weekStartMs(now.getTime()) - weekStartMs(start.getTime())) / WEEK) + 1;
  } else if (granularity === "monthly") {
    count =
      (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (now.getUTCMonth() - start.getUTCMonth()) +
      1;
  } else {
    count =
      (now.getUTCFullYear() - start.getUTCFullYear()) * 4 +
      (Math.floor(now.getUTCMonth() / 3) - Math.floor(start.getUTCMonth() / 3)) +
      1;
  }
  return Math.min(Math.max(count, 1), MAX_WINDOW);
}

// ---- result shapes -----------------------------------------------------------

export interface AnalysisSeries {
  /** Data key in chartData rows ("consumed", a caviar type, or "Other"). */
  id: string;
  label: string;
}

export type ChartRow = { key: string; label: string } & Record<string, number | string>;

/** One "Consumed" column of the table: the whole period, or a selected bucket. */
export interface TableColumn {
  /** Bucket key, or "all" for the whole-period single column. */
  key: string;
  /** Column heading ("Aug 2026", "Q1 2025", "Wk of 10 Aug 2026", or the range). */
  label: string;
  /** N-1 counterpart heading ("Aug 2025", "Jan 2024 → Aug 2025", …). */
  prevLabel: string;
}

export interface AnalysisRow {
  productId: string;
  prCode: string;
  name: string;
  caviarType: string | null;
  category: string;
  unit: string;
  /** Consumed units over the whole table scope (all selected buckets combined). */
  units: number;
  grams: number;
  sharePct: number;
  avgPerWeek: number;
  /** Forecast/variance over the whole table scope (selected buckets combined). */
  forecast: number;
  variance: number;
  /** Consumed units per table column (aligned with result.tableColumns). */
  bucketUnits: number[];
  /** N-1 consumed units per column (same period one year earlier). */
  prevBucketUnits: number[];
}

export interface AnalysisResult {
  buckets: Bucket[];
  /** Elapsed weeks in the whole window (partial current bucket clamped to now). */
  weeks: number;
  /** Human label of the whole window ("Jan 2025 → Aug 2026"). */
  rangeLabel: string;
  /** N-1 label of the whole window ("Jan 2024 → Aug 2025"). */
  prevRangeLabel: string;
  /** What the TABLE covers: selected bucket label(s), or the whole range. */
  periodLabel: string;
  /** Elapsed weeks in the table scope (selected buckets, or the whole window). */
  tableWeeks: number;
  /** Columns the table shows: the whole period, or one per selected bucket. */
  tableColumns: TableColumn[];
  /** Consumption series (one, or one per compared type + "Other"). */
  series: AnalysisSeries[];
  /** One row per bucket; series values by id, plus "forecast" and "prev" (N-1). */
  chartData: ChartRow[];
  /** Per-product rows, scoped to the selected table buckets when any. */
  rows: AnalysisRow[];
  totals: {
    units: number;
    grams: number;
    forecast: number;
    variance: number;
    /** Table-scope average, for the table footer / export totals row. */
    avgPerWeek: number;
    /** Column totals, aligned with tableColumns. */
    bucketUnits: number[];
    prevBucketUnits: number[];
  };
  kpis: {
    totalUnits: number;
    totalGrams: number;
    avgPerWeek: number;
    bestType: string | null;
    bestTypeUnits: number;
    forecastTotal: number;
    /** consumed / forecast, percent; null when there is no forecast. */
    attainmentPct: number | null;
    /** Consumed one year earlier over the same window (N-1). */
    prevTotalUnits: number;
    /** (consumed − N-1) / N-1, percent; null when there is no N-1 data. */
    yoyChangePct: number | null;
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

  // N-1 counterparts of every bucket (same period one calendar year earlier;
  // weekly = exactly 52 weeks earlier). Period keys are canonical, so a
  // movement's own bucket key looks up which current bucket it is the N-1 of.
  const prevBuckets = buckets.map((b) => prevBucketOf(b, filters.granularity));
  const prevIndexByKey = new Map(prevBuckets.map((b, i) => [b.key, i] as const));

  // ---- period labels ----
  const rangeStart = monthLabel(monthKeyOf(new Date(windowStart)));
  const rangeEnd = monthLabel(monthKeyOf(now));
  const rangeLabel = rangeStart === rangeEnd ? rangeStart : `${rangeStart} → ${rangeEnd}`;
  const prevStart = monthLabel(monthKeyOf(new Date(prevBuckets[0].start)));
  const prevEnd = monthLabel(monthKeyOf(new Date(prevBuckets[prevBuckets.length - 1].start)));
  const prevRangeLabel = prevStart === prevEnd ? prevStart : `${prevStart} → ${prevEnd}`;

  // Table scope: the selected buckets (one column each, chronological,
  // de-duplicated), or the whole window. Unknown/stale keys (e.g. a week key
  // after switching to monthly) are dropped; none valid = whole period.
  const selectedIndices = [
    ...new Set(
      filters.tableBuckets
        .map((key) => bucketIndex.get(key))
        .filter((i): i is number => i !== undefined)
    ),
  ].sort((a, b) => a - b);
  const wholePeriod = selectedIndices.length === 0;
  /** Bucket index → table column index, for the selected buckets. */
  const columnOfBucket = new Map(selectedIndices.map((b, c) => [b, c] as const));
  const tableColumns: TableColumn[] = wholePeriod
    ? [{ key: "all", label: rangeLabel, prevLabel: prevRangeLabel }]
    : selectedIndices.map((i) => ({
        key: buckets[i].key,
        label: buckets[i].longLabel,
        prevLabel: prevBuckets[i].longLabel,
      }));

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
  // Whole-window totals feed the chart and KPIs; when table buckets are
  // selected, a second accumulator scopes the per-product rows to them.
  // Per-column accumulators feed the table's per-period columns, and the
  // "prev" accumulators the N-1 overlay/columns.
  const perProduct = new Map<string, { units: number; grams: number }>();
  const perProductTable = wholePeriod
    ? perProduct
    : new Map<string, { units: number; grams: number }>();
  const addConsumed = (
    map: Map<string, { units: number; grams: number }>,
    productId: string,
    units: number,
    grams: number
  ) => {
    const acc = map.get(productId) ?? { units: 0, grams: 0 };
    acc.units += units;
    acc.grams += grams;
    map.set(productId, acc);
  };
  const perProductCols = new Map<string, number[]>();
  const perProductPrevCols = new Map<string, number[]>();
  const addColUnits = (
    map: Map<string, number[]>,
    productId: string,
    col: number,
    units: number
  ) => {
    let cols = map.get(productId);
    if (!cols) {
      cols = tableColumns.map(() => 0);
      map.set(productId, cols);
    }
    cols[col] += units;
  };
  const perBucketSeries = buckets.map(() => new Map<string, number>());
  const perBucketPrev = buckets.map(() => 0);
  for (const m of data.movements) {
    const product = productById.get(m.productId);
    if (!product) continue;
    const t = Date.parse(m.date);
    if (Number.isNaN(t)) continue;
    const key =
      filters.granularity === "monthly"
        ? monthKeyOf(new Date(t))
        : filters.granularity === "quarterly"
          ? quarterKeyOf(new Date(t))
          : isoDate(weekStartMs(t));

    // Current window: chart series, KPIs and the table columns.
    const index =
      t >= windowStart && t < windowEnd ? bucketIndex.get(key) : undefined;
    if (index !== undefined) {
      addConsumed(perProduct, product.id, m.units, m.grams);
      const col = wholePeriod ? 0 : columnOfBucket.get(index);
      if (col !== undefined) {
        if (!wholePeriod) addConsumed(perProductTable, product.id, m.units, m.grams);
        addColUnits(perProductCols, product.id, col, m.units);
      }
      const sid = seriesIdFor(product);
      perBucketSeries[index].set(sid, (perBucketSeries[index].get(sid) ?? 0) + m.units);
    }

    // N-1: the same movement can also be the year-earlier counterpart of a
    // later bucket (windows longer than a year overlap their own N-1 range).
    const prevIndex = prevIndexByKey.get(key);
    if (prevIndex !== undefined) {
      perBucketPrev[prevIndex] += m.units;
      const col = wholePeriod ? 0 : columnOfBucket.get(prevIndex);
      if (col !== undefined) addColUnits(perProductPrevCols, product.id, col, m.units);
    }
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

  /**
   * Forecast for one product in one bucket. Monthly buckets read the month
   * directly; quarterly buckets sum their three whole months; weekly buckets
   * prorate each month's forecast evenly across its days.
   */
  const bucketForecast = (months: Map<string, number>, bucket: Bucket): number => {
    if (filters.granularity === "monthly") return months.get(bucket.key) ?? 0;
    if (filters.granularity === "quarterly") {
      let total = 0;
      for (let ms = bucket.start; ms < bucket.end; ) {
        const d = new Date(ms);
        total += months.get(monthKeyOf(d)) ?? 0;
        ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
      }
      return total;
    }
    let total = 0;
    for (let day = bucket.start; day < bucket.end; day += DAY) {
      const monthly = months.get(monthKeyOf(new Date(day))) ?? 0;
      if (monthly > 0) total += monthly / daysInMonthOf(day);
    }
    return total;
  };

  const perBucketForecast = buckets.map(() => 0);
  /** Whole-window forecast per product (KPIs) and table-scoped one (rows). */
  const forecastPerProduct = new Map<string, number>();
  const forecastPerProductTable = new Map<string, number>();
  for (const [productId, months] of forecastByProduct) {
    let productTotal = 0;
    let productTable = 0;
    buckets.forEach((bucket, i) => {
      const value = bucketForecast(months, bucket);
      perBucketForecast[i] += value;
      productTotal += value;
      if (columnOfBucket.has(i)) productTable += value;
    });
    if (productTotal > 0) forecastPerProduct.set(productId, productTotal);
    // Forecast/variance collapse to the selected buckets combined.
    const tableValue = wholePeriod ? productTotal : productTable;
    if (tableValue > 0) forecastPerProductTable.set(productId, tableValue);
  }

  // ---- table rows (scoped to the selected buckets when there are any) ----
  const totalUnits = [...perProductTable.values()].reduce((sum, v) => sum + v.units, 0);
  const clampedEnd = Math.min(now.getTime(), windowEnd);
  const weeks = Math.max((clampedEnd - windowStart) / WEEK, 1 / 7);
  const tableWeeks = wholePeriod
    ? weeks
    : Math.max(
        selectedIndices.reduce(
          (sum, i) =>
            sum +
            Math.max(Math.min(clampedEnd, buckets[i].end) - buckets[i].start, 0) / WEEK,
          0
        ),
        1 / 7
      );

  const rows: AnalysisRow[] = products
    .map((p) => {
      const consumed = perProductTable.get(p.id) ?? { units: 0, grams: 0 };
      const forecast = forecastPerProductTable.get(p.id) ?? 0;
      const cols = perProductCols.get(p.id);
      const prevCols = perProductPrevCols.get(p.id);
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
        avgPerWeek: round2(consumed.units / tableWeeks),
        forecast: round2(forecast),
        variance: round2(consumed.units - forecast),
        bucketUnits: tableColumns.map((_, c) => round2(cols?.[c] ?? 0)),
        prevBucketUnits: tableColumns.map((_, c) => round2(prevCols?.[c] ?? 0)),
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
    {
      units: 0,
      grams: 0,
      forecast: 0,
      variance: 0,
      avgPerWeek: 0,
      bucketUnits: tableColumns.map(() => 0),
      prevBucketUnits: tableColumns.map(() => 0),
    }
  );
  totals.units = round2(totals.units);
  totals.grams = round2(totals.grams);
  totals.forecast = round2(totals.forecast);
  totals.variance = round2(totals.units - totals.forecast);
  totals.avgPerWeek = round2(totals.units / tableWeeks);
  totals.bucketUnits = tableColumns.map((_, c) =>
    round2(rows.reduce((sum, r) => sum + r.bucketUnits[c], 0))
  );
  totals.prevBucketUnits = tableColumns.map((_, c) =>
    round2(rows.reduce((sum, r) => sum + r.prevBucketUnits[c], 0))
  );

  // ---- chart data ----
  const chartData: ChartRow[] = buckets.map((bucket, i) => {
    const row: ChartRow = { key: bucket.key, label: bucket.label };
    for (const s of series) {
      row[s.id] = round2(perBucketSeries[i].get(s.id) ?? 0);
    }
    row.forecast = round2(perBucketForecast[i]);
    row.prev = round2(perBucketPrev[i]);
    return row;
  });

  // ---- KPIs (always whole window, regardless of the table bucket) ----
  const allTotals = [...perProduct.values()].reduce(
    (acc, v) => {
      acc.units += v.units;
      acc.grams += v.grams;
      return acc;
    },
    { units: 0, grams: 0 }
  );
  const allUnits = round2(allTotals.units);
  const allGrams = round2(allTotals.grams);
  const allForecast = round2(
    [...forecastPerProduct.values()].reduce((sum, v) => sum + v, 0)
  );

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

  const prevTotalUnits = round2(perBucketPrev.reduce((sum, v) => sum + v, 0));

  return {
    buckets,
    weeks: round2(weeks),
    rangeLabel,
    prevRangeLabel,
    periodLabel: wholePeriod ? rangeLabel : tableColumns.map((c) => c.label).join(", "),
    tableWeeks: round2(tableWeeks),
    tableColumns,
    series,
    chartData,
    rows,
    totals,
    kpis: {
      totalUnits: allUnits,
      totalGrams: allGrams,
      avgPerWeek: round2(allUnits / weeks),
      bestType,
      bestTypeUnits: round2(bestTypeUnits),
      forecastTotal: allForecast,
      attainmentPct: allForecast > 0 ? Math.round((allUnits / allForecast) * 100) : null,
      prevTotalUnits,
      yoyChangePct:
        prevTotalUnits > 0
          ? Math.round(((allUnits - prevTotalUnits) / prevTotalUnits) * 100)
          : null,
    },
  };
}

// ---- filter description (Excel info block, shared) ---------------------------

export function describeFilters(
  filters: AnalysisFilters,
  people: ForecastPerson[],
  result: AnalysisResult
): [string, string][] {
  const bucketNoun =
    filters.granularity === "weekly"
      ? "weeks"
      : filters.granularity === "monthly"
        ? "months"
        : "quarters";
  const period = `${result.rangeLabel} (${result.buckets.length} ${bucketNoun})`;
  const tablePeriod =
    result.periodLabel === result.rangeLabel ? "Whole period" : result.periodLabel;
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
    ["Table period", tablePeriod],
    ["Scope", scope],
    ["Category", category],
    ["Forecast person", person],
    ["Compare vs forecast", filters.compare ? "On" : "Off"],
    ["Compare vs N-1", filters.compareN1 ? "On (same period one year earlier)" : "Off"],
  ];
}
