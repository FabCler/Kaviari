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
 * yields 7/7/7/7/3). Quantities are rounded to 2 decimals; the LAST chunk
 * absorbs the rounding drift so the chunks always sum exactly to
 * `round2(quantity)`. Chunks whose share rounds to zero are dropped (their
 * share flows into the last chunk).
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

  const chunks: MonthlyChunk[] = [];
  let allocated = 0;
  for (const [index, segment] of segments.entries()) {
    const isLast = index === segments.length - 1;
    let tins = isLast
      ? round2(total - allocated)
      : round2((total * segment.days) / daysInMonth);

    if (isLast && tins < 0) {
      // Degenerate: earlier round-ups overshot the total. Claw the deficit
      // back from previous chunks (newest first) so the sum stays exact.
      let deficit = -tins;
      tins = 0;
      for (let i = chunks.length - 1; i >= 0 && deficit > 0; i--) {
        const take = Math.min(chunks[i].tins, deficit);
        chunks[i].tins = round2(chunks[i].tins - take);
        deficit = round2(deficit - take);
      }
      for (let i = chunks.length - 1; i >= 0; i--) {
        if (chunks[i].tins <= 0) chunks.splice(i, 1);
      }
    }

    allocated = round2(allocated + tins);
    if (tins <= 0) continue; // zero share — the last chunk absorbs it

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
