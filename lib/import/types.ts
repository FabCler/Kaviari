import type { Channel } from "@/lib/domain";

/**
 * Shared types for the Import & Analyze feature. Everything here is plain
 * serializable data — these shapes cross the server/client boundary.
 */

export const IMPORT_MODES = ["price_list", "stock_take", "sales_export"] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

export const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv", ".pdf"] as const;
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/** A row the AI (or the server) could not map to anything actionable. */
export interface UnmatchedRow {
  /** Human-readable description of the source row (e.g. its raw text). */
  label: string;
  reason: string;
}

export type PriceChangeKind = "new" | "price_change" | "unchanged";

export interface PriceListPreviewRow {
  prCode: string | null;
  name: string;
  caviarType: string | null;
  gramsPerUnit: number | null;
  unitCost: number;
  currency: string;
  /** Verified server-side against the catalog — never trusted from the AI. */
  matchedProductId: string | null;
  matchedProductName: string | null;
  change: PriceChangeKind;
  oldUnitCost: number | null;
}

export interface StockTakePreviewRow {
  productId: string;
  productName: string;
  gramsPerUnit: number | null;
  countedTins: number;
  /** Recomputed server-side from in-stock lots — never trusted from the AI. */
  systemTins: number;
  deltaTins: number;
}

export interface SalesPreviewRow {
  productId: string;
  productName: string;
  gramsPerUnit: number | null;
  /** ISO date (yyyy-mm-dd). */
  date: string;
  tins: number;
  channel: Channel;
  note: string | null;
}

export type AnalysisResult =
  | {
      mode: "price_list";
      rows: PriceListPreviewRow[];
      unmatched: UnmatchedRow[];
      notices: string[];
    }
  | {
      mode: "stock_take";
      rows: StockTakePreviewRow[];
      unmatched: UnmatchedRow[];
      notices: string[];
    }
  | {
      mode: "sales_export";
      rows: SalesPreviewRow[];
      unmatched: UnmatchedRow[];
      notices: string[];
    };

export interface CommitResult {
  created: number;
  updated: number;
  movements: number;
  warnings: string[];
}
