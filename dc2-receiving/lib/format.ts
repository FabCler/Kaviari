/**
 * Numbers as the receiving desks read them.
 *
 * Purchasing works a supplier invoice to two decimals: a PO printed as 37.06
 * against an invoice of 37.056 is the same delivery, so every comparison
 * rounds to two decimals first while the imported line keeps the precision it
 * arrived with.
 */

export const norm = (v: unknown): string => String(v ?? "").trim();

export const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Two decimals, and never a signed zero. */
export const r2 = (v: unknown): number => Math.round(num(v) * 100) / 100 || 0;

/** The purchasing comparison: equal once both are read to two decimals. */
export const same2 = (a: unknown, b: unknown): boolean => r2(a) === r2(b);

export const close = (a: unknown, b: unknown, eps = 0.01): boolean =>
  Math.abs(num(a) - num(b)) <= eps;

/** A key that ignores case and stray spacing — how documents are matched. */
export const keyOf = (...parts: unknown[]): string =>
  parts.map((p) => norm(p).toUpperCase()).join("|");

/** Quantity as stored: up to three decimals, no padding. */
export const fmt = (n: unknown): string =>
  Number.isFinite(+num(n))
    ? num(n).toLocaleString("en-US", { maximumFractionDigits: 3 })
    : "";

/** Invoice figures: exactly two decimals, the way the document states them. */
export const fmt2 = (n: unknown): string =>
  num(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** A gap the two-decimal reading calls zero must not print as "-0.0%". */
export const pct = (n: unknown): string => {
  const v = Math.round(num(n) * 10) / 10;
  return `${(v === 0 ? 0 : v).toFixed(1)}%`;
};

export const fmtDate = (d: Date | string | null | undefined): string => {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};
