/**
 * Period helpers for the sales-export import. A "period" is either a single
 * day ("2025-03-14") or a whole month ("2025-03"). Monthly totals are spread
 * across the ISO weeks (Mon–Sun) overlapping the month at commit time so
 * weekly consumption charts see a smooth series instead of one spike.
 *
 * Pure date math on UTC — safe on both server and client.
 */

/** A whole calendar month, "yyyy-mm" (month 01–12). */
export const MONTH_PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A single day, "yyyy-mm-dd" (month 01–12, day 01–31). */
export const DAY_PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isMonthPeriod(period: string): boolean {
  return MONTH_PERIOD_RE.test(period);
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** "2025-01" → "Jan 2025". Falls back to the raw string if not a month. */
export function formatMonthLabel(month: string): string {
  if (!MONTH_PERIOD_RE.test(month)) return month;
  const name = MONTH_NAMES[Number(month.slice(5, 7)) - 1];
  return `${name} ${month.slice(0, 4)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** One weekly slice of a monthly total. */
export interface MonthlyChunk {
  /** Movement date: the middle day of the chunk (yyyy-mm-dd). */
  date: string;
  /** Tins for this chunk, 2 decimals. All chunks sum EXACTLY to the input. */
  tins: number;
  /** First day of the chunk inside the month (yyyy-mm-dd). */
  weekStart: string;
  /** Last day of the chunk inside the month (yyyy-mm-dd). */
  weekEnd: string;
  /** Number of days of the ISO week that fall inside the month (1–7). */
  days: number;
}

/**
 * Spread a monthly quantity across the ISO weeks overlapping the month.
 *
 * Each chunk is the intersection of an ISO week (Mon–Sun) with the month and
 * is weighted by its day count (e.g. a 31-day month starting on a Monday
 * yields 7/7/7/7/3). WHOLE-NUMBER totals are split into whole-number chunks
 * (largest-remainder allocation) so product histories read naturally;
 * fractional totals are rounded to 2 decimals. Either way the chunks always
 * sum EXACTLY to `round2(quantity)`; chunks whose share is zero are dropped.
 */
export function spreadMonthlyQuantity(
  month: string,
  quantity: number
): MonthlyChunk[] {
  if (!MONTH_PERIOD_RE.test(month)) {
    throw new Error(`Invalid month period "${month}" — expected yyyy-mm.`);
  }
  if (!Number.isFinite(quantity) || quantity <= 0) return [];

  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7)); // 1–12
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();

  // Partition the month's days into segments: one per ISO week overlapping
  // the month. A new segment starts on every Monday.
  const segments: { start: number; days: number }[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const isoWeekday =
      (new Date(Date.UTC(year, mon - 1, day)).getUTCDay() + 6) % 7; // 0 = Mon
    const current = segments[segments.length - 1];
    if (!current || isoWeekday === 0) segments.push({ start: day, days: 1 });
    else current.days += 1;
  }

  const iso = (day: number) => `${month}-${String(day).padStart(2, "0")}`;
  const total = round2(quantity);
  const integer = Number.isInteger(total);

  // Proportional shares, floored to the unit (1 tin or 0.01), then the
  // largest fractional remainders receive the leftover units — sums are
  // exact by construction.
  const unit = integer ? 1 : 0.01;
  const shares = segments.map((segment) => (total * segment.days) / daysInMonth);
  const floored = shares.map((s) => Math.floor(s / unit + 1e-9));
  let leftover = Math.round(total / unit) - floored.reduce((a, b) => a + b, 0);
  const order = shares
    .map((share, index) => ({ index, frac: share / unit - floored[index] }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (const entry of order) {
    if (leftover <= 0) break;
    floored[entry.index] += 1;
    leftover -= 1;
  }

  const chunks: MonthlyChunk[] = [];
  for (const [index, segment] of segments.entries()) {
    const tins = round2(floored[index] * unit);
    if (tins <= 0) continue;
    const middle = segment.start + Math.floor((segment.days - 1) / 2);
    chunks.push({
      date: iso(middle),
      tins,
      weekStart: iso(segment.start),
      weekEnd: iso(segment.start + segment.days - 1),
      days: segment.days,
    });
  }
  return chunks;
}
