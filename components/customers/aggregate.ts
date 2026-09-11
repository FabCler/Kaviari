import { z } from "zod";
import type { CustomerSaleEntry } from "@/components/customers/types";

/**
 * Pure aggregation for the Customers page — shared by the client view and
 * POST /api/exports/customer-sales so the workbook always mirrors the
 * screen (client rows are never trusted).
 */

export const ALL = "all";
/** Pseudo caviar-type for rows whose PR code isn't a caviar product. */
export const OTHER_TYPE = "other";
export const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const customerFiltersSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  /** Customer codes; empty = all. */
  customers: z.array(z.string().max(100)).max(500).default([]),
  /** Caviar types (or OTHER_TYPE); empty = all. */
  caviarTypes: z.array(z.string().max(50)).max(50).default([]),
  /** Product key (PR code or "name:<label>"); ALL = all. */
  product: z.string().max(300).default(ALL),
  grouping: z.enum(["customer", "product"]).default("customer"),
  compareN1: z.boolean().default(true),
});

export type CustomerFilters = z.infer<typeof customerFiltersSchema>;

/** Stable identity for a product line ("(blank)" rows have no PR code). */
export function productKey(entry: CustomerSaleEntry): string {
  return entry.prCode ?? `name:${entry.productName}`;
}

export function matchesCaviarTypes(
  entry: CustomerSaleEntry,
  caviarTypes: string[]
): boolean {
  if (caviarTypes.length === 0) return true;
  if (entry.caviarType == null) return caviarTypes.includes(OTHER_TYPE);
  return caviarTypes.includes(entry.caviarType);
}

/** The breakdown behind a group row (the other dimension of the pivot). */
export interface DetailRow {
  key: string;
  code: string;
  name: string;
  months: number[];
  total: number;
  prevTotal: number;
}

export interface GroupRow {
  key: string;
  code: string;
  name: string;
  /** Per-month quantity for the selected year (index 0 = January). */
  months: number[];
  total: number;
  /** Previous year, same months as the selected year has data for. */
  prevTotal: number;
  /** Customer grouping → per-product rows; product grouping → per-customer. */
  details: DetailRow[];
}

export interface MonthTotal {
  label: string;
  current: number;
  prev: number;
}

export interface CustomerAnalysis {
  maxDataMonth: number;
  monthTotals: MonthTotal[];
  currentTotal: number;
  previousSameTotal: number;
  groupRows: GroupRow[];
  customerCount: number;
  topCustomer: { label: string; total: number } | null;
  topProduct: { label: string; total: number } | null;
}

function sortRows<T extends { total: number; prevTotal: number }>(
  rows: T[]
): T[] {
  return rows.sort((a, b) => b.total - a.total || b.prevTotal - a.prevTotal);
}

export function buildCustomerAnalysis(
  entries: CustomerSaleEntry[],
  filters: CustomerFilters
): CustomerAnalysis {
  const filtered = entries.filter((entry) => {
    if (
      filters.customers.length > 0 &&
      !filters.customers.includes(entry.customerCode)
    ) {
      return false;
    }
    if (!matchesCaviarTypes(entry, filters.caviarTypes)) return false;
    if (filters.product !== ALL && productKey(entry) !== filters.product) {
      return false;
    }
    return true;
  });

  const current = filtered.filter((e) => e.year === filters.year);
  const previous = filtered.filter((e) => e.year === filters.year - 1);

  // Compare like with like: the previous year is cut to the months the
  // selected year has data for (e.g. Jan–Sep while the year is running).
  const maxDataMonth = current.length
    ? Math.max(...current.map((e) => e.month))
    : 12;
  const previousSame = previous.filter((e) => e.month <= maxDataMonth);

  const monthTotals: MonthTotal[] = MONTH_LABELS.map((label, index) => ({
    label,
    current: current
      .filter((e) => e.month === index + 1)
      .reduce((sum, e) => sum + e.quantity, 0),
    prev: previous
      .filter((e) => e.month === index + 1)
      .reduce((sum, e) => sum + e.quantity, 0),
  }));

  const groupKeyOf = (entry: CustomerSaleEntry) =>
    filters.grouping === "customer" ? entry.customerCode : productKey(entry);
  const detailKeyOf = (entry: CustomerSaleEntry) =>
    filters.grouping === "customer" ? productKey(entry) : entry.customerCode;

  const byKey = new Map<string, GroupRow>();
  const detailsOf = new Map<string, Map<string, DetailRow>>();
  const groupFor = (entry: CustomerSaleEntry): GroupRow => {
    const key = groupKeyOf(entry);
    let row = byKey.get(key);
    if (!row) {
      row = {
        key,
        code:
          filters.grouping === "customer"
            ? entry.customerCode
            : (entry.prCode ?? "—"),
        name:
          filters.grouping === "customer"
            ? entry.customerName
            : entry.productName,
        months: Array.from({ length: 12 }, () => 0),
        total: 0,
        prevTotal: 0,
        details: [],
      };
      byKey.set(key, row);
      detailsOf.set(key, new Map());
    }
    return row;
  };
  const detailFor = (entry: CustomerSaleEntry): DetailRow => {
    const group = groupFor(entry);
    const details = detailsOf.get(group.key)!;
    const key = detailKeyOf(entry);
    let row = details.get(key);
    if (!row) {
      row = {
        key,
        code:
          filters.grouping === "customer"
            ? (entry.prCode ?? "—")
            : entry.customerCode,
        name:
          filters.grouping === "customer"
            ? entry.productName
            : entry.customerName,
        months: Array.from({ length: 12 }, () => 0),
        total: 0,
        prevTotal: 0,
      };
      details.set(key, row);
    }
    return row;
  };

  for (const entry of current) {
    const group = groupFor(entry);
    group.months[entry.month - 1] += entry.quantity;
    group.total += entry.quantity;
    const detail = detailFor(entry);
    detail.months[entry.month - 1] += entry.quantity;
    detail.total += entry.quantity;
  }
  for (const entry of previousSame) {
    groupFor(entry).prevTotal += entry.quantity;
    detailFor(entry).prevTotal += entry.quantity;
  }

  const groupRows = sortRows([...byKey.values()]);
  for (const row of groupRows) {
    row.details = sortRows([...detailsOf.get(row.key)!.values()]);
  }

  const topBy = (
    keyOf: (e: CustomerSaleEntry) => string,
    labelOf: (e: CustomerSaleEntry) => string
  ) => {
    const totals = new Map<string, { label: string; total: number }>();
    for (const entry of current) {
      const key = keyOf(entry);
      const existing = totals.get(key) ?? { label: labelOf(entry), total: 0 };
      existing.total += entry.quantity;
      totals.set(key, existing);
    }
    let best: { label: string; total: number } | null = null;
    for (const value of totals.values()) {
      if (!best || value.total > best.total) best = value;
    }
    return { best, count: totals.size };
  };
  const customerStats = topBy(
    (e) => e.customerCode,
    (e) => e.customerName
  );
  const productStats = topBy(productKey, (e) => e.productName);

  return {
    maxDataMonth,
    monthTotals,
    currentTotal: current.reduce((sum, e) => sum + e.quantity, 0),
    previousSameTotal: previousSame.reduce((sum, e) => sum + e.quantity, 0),
    groupRows,
    customerCount: customerStats.count,
    topCustomer: customerStats.best,
    topProduct: productStats.best,
  };
}

/** "2025" or "2025 Jan–Sep" — how far the N-1 comparison reaches. */
export function samePeriodLabel(year: number, maxDataMonth: number): string {
  return maxDataMonth === 12
    ? String(year - 1)
    : `${year - 1} Jan–${MONTH_LABELS[maxDataMonth - 1]}`;
}
