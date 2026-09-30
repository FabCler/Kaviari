import { z } from "zod";
import type { InventoryRow } from "@/components/inventory/types";

/**
 * Pure view logic for the Inventory table — filtering, dormant split and
 * column sorting — shared by the client table and POST /api/exports/inventory
 * so the exported workbook always mirrors the on-screen view.
 */

export const ALL = "all";

/**
 * Sortable columns. Text columns start ascending; numeric columns start
 * descending (largest first). "forecast0/1/2" are the per-month columns;
 * cover treats ∞ (no demand) as larger than any finite value.
 */
export const SORT_KEYS = [
  "prCode",
  "name",
  "onHand",
  "onOrder",
  "consumed",
  "consumedPrev",
  "consumed30",
  "cover",
  "forecast0",
  "forecast1",
  "forecast2",
] as const;

export type SortKey = (typeof SORT_KEYS)[number];

export type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

export const TEXT_SORT_KEYS: SortKey[] = ["prCode", "name"];

export function sortValue(row: InventoryRow, key: SortKey): string | number {
  switch (key) {
    case "prCode":
      return row.prCode;
    case "name":
      return row.name;
    case "onHand":
      return row.onHandUnits;
    case "onOrder":
      return row.onOrderUnits;
    case "consumed":
      return row.consumedThisMonthUnits;
    case "consumedPrev":
      return row.consumedPrevMonthUnits;
    case "consumed30":
      return row.consumed30dUnits;
    case "cover":
      return row.weeksOfCover ?? Number.POSITIVE_INFINITY;
    case "forecast0":
    case "forecast1":
    case "forecast2":
      return row.forecastMonths[Number(key.slice(-1))] ?? 0;
  }
}

export function sortRows(rows: InventoryRow[], sort: SortState): InventoryRow[] {
  if (!sort) return rows;
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    const cmp =
      typeof va === "string" || typeof vb === "string"
        ? String(va).localeCompare(String(vb), undefined, { numeric: true })
        : va - vb;
    return cmp !== 0 ? factor * cmp : a.name.localeCompare(b.name);
  });
}

export function isDormant(row: InventoryRow): boolean {
  return (
    row.onHandUnits <= 0 && row.aduUnitsPerDay <= 0 && row.onOrderUnits <= 0
  );
}

export const inventoryViewSchema = z.object({
  category: z.string().max(50).default(ALL),
  caviarType: z.string().max(50).default(ALL),
  forecastHorizon: z.number().int().min(1).max(3).default(1),
  showDormant: z.boolean().default(false),
  sort: z
    .object({
      key: z.enum(SORT_KEYS),
      dir: z.enum(["asc", "desc"]),
    })
    .nullable()
    .default(null),
});

export type InventoryView = z.infer<typeof inventoryViewSchema>;

/** The rows currently on screen, in on-screen order. */
export function applyInventoryView(
  rows: InventoryRow[],
  view: InventoryView
): InventoryRow[] {
  const typeFilterEnabled =
    view.category === ALL || view.category === "Caviar";
  const filtered = rows.filter((row) => {
    if (view.category !== ALL && row.category !== view.category) return false;
    if (
      typeFilterEnabled &&
      view.caviarType !== ALL &&
      row.caviarType !== view.caviarType
    ) {
      return false;
    }
    return true;
  });
  const activeRows = filtered.filter((row) => !isDormant(row));
  const dormantRows = filtered.filter(isDormant);
  return sortRows(
    view.showDormant ? [...activeRows, ...dormantRows] : activeRows,
    view.sort
  );
}
