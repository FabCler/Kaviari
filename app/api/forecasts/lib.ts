import { parseMonthKey } from "@/components/consume-analysis/aggregate";

/**
 * Shared helpers for the forecast routes. Forecast months are accepted in a
 * sane editing range: from one month in the past to 18 months ahead.
 */

export const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

export function monthRange(now: Date): { min: Date; max: Date } {
  return {
    min: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
    max: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 18, 1)),
  };
}

/** Parse a "YYYY-MM" key and check it is inside the editable range. */
export function parseMonthInRange(
  key: string,
  now: Date
): { date: Date } | { error: string } {
  const date = parseMonthKey(key);
  if (!date) return { error: `"${key}" is not a valid month (expected YYYY-MM)` };
  const { min, max } = monthRange(now);
  if (date < min || date > max) {
    return {
      error: `Month ${key} is outside the editable range (1 month back to 18 months ahead)`,
    };
  }
  return { date };
}
