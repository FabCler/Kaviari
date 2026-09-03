import { nearlyEqual, type ComparisonStatus } from "@/lib/scm/domain";
import { round } from "@/lib/scm/units";

/**
 * Pure comparison math for §3 (PO vs Invoice), §4 (Invoice/PO vs SO) and
 * §5 (PO vs SO). Kept free of Prisma so the rules are unit-testable and so
 * the same functions serve the API, the export and the dashboard.
 *
 * Every input is expected in the product's inventory unit — callers convert
 * first (lib/scm/units.ts).
 */

export type QtyStatus =
  | "match"
  | "over"
  | "short"
  | "missing_on_invoice"
  | "not_on_po";
export type PriceStatus = "match" | "higher" | "lower" | "missing";

export interface Variance {
  diff: number;
  diffPct: number | null;
}

/**
 * Difference and difference %. The percentage is relative to the reference
 * (PO or SO) quantity; with a zero reference there is no meaningful
 * percentage, so it is null rather than Infinity.
 */
export function variance(reference: number, actual: number): Variance {
  const diff = round(actual - reference);
  const diffPct =
    reference === 0 ? null : round((diff / reference) * 100, 2);
  return { diff, diffPct };
}

export function qtyStatus(
  poQuantity: number | null,
  invoiceQuantity: number | null,
  tolerancePct = 0
): QtyStatus {
  if (poQuantity == null) return "not_on_po";
  if (invoiceQuantity == null) return "missing_on_invoice";
  const { diff, diffPct } = variance(poQuantity, invoiceQuantity);
  if (nearlyEqual(diff, 0)) return "match";
  if (diffPct != null && Math.abs(diffPct) <= tolerancePct) return "match";
  return diff > 0 ? "over" : "short";
}

export function priceStatus(
  poPrice: number | null,
  invoicePrice: number | null,
  tolerancePct = 0
): PriceStatus {
  if (poPrice == null || invoicePrice == null) return "missing";
  const { diff, diffPct } = variance(poPrice, invoicePrice);
  if (nearlyEqual(diff, 0)) return "match";
  if (diffPct != null && Math.abs(diffPct) <= tolerancePct) return "match";
  return diff > 0 ? "higher" : "lower";
}

export interface PoInvoiceInput {
  poQuantity: number | null;
  invoiceQuantity: number | null;
  poUnitPrice: number | null;
  invoiceUnitPrice: number | null;
  qtyTolerancePct?: number;
  priceTolerancePct?: number;
}

export interface PoInvoiceResult {
  qtyDiff: number | null;
  qtyDiffPct: number | null;
  priceDiff: number | null;
  priceDiffPct: number | null;
  qtyStatus: QtyStatus;
  priceStatus: PriceStatus;
  /** True when purchasing must supply a reason before anything moves on. */
  needsReview: boolean;
}

export function comparePoInvoice(input: PoInvoiceInput): PoInvoiceResult {
  const qty =
    input.poQuantity != null && input.invoiceQuantity != null
      ? variance(input.poQuantity, input.invoiceQuantity)
      : { diff: null, diffPct: null };
  const price =
    input.poUnitPrice != null && input.invoiceUnitPrice != null
      ? variance(input.poUnitPrice, input.invoiceUnitPrice)
      : { diff: null, diffPct: null };

  const qs = qtyStatus(
    input.poQuantity,
    input.invoiceQuantity,
    input.qtyTolerancePct ?? 0
  );
  const ps = priceStatus(
    input.poUnitPrice,
    input.invoiceUnitPrice,
    input.priceTolerancePct ?? 0
  );

  return {
    qtyDiff: qty.diff,
    qtyDiffPct: qty.diffPct,
    priceDiff: price.diff,
    priceDiffPct: price.diffPct,
    qtyStatus: qs,
    priceStatus: ps,
    needsReview: qs !== "match" || (ps !== "match" && ps !== "missing"),
  };
}

/**
 * §14 — the source of truth for every downstream step is the last confirmed
 * quantity: corrected quantity if purchasing set one, else the invoice
 * quantity once verified, else the PO quantity.
 */
export function confirmedQuantity(args: {
  poQuantity: number;
  invoiceQuantity?: number | null;
  correctedQuantity?: number | null;
  invoiceVerified?: boolean;
}): number {
  if (args.correctedQuantity != null) return round(args.correctedQuantity);
  if (args.invoiceVerified && args.invoiceQuantity != null)
    return round(args.invoiceQuantity);
  return round(args.poQuantity);
}

export type SoDiffStatus = "match" | "short" | "over";

export interface SoReconResult {
  diff: number;
  diffPct: number;
  diffStatus: SoDiffStatus;
  /** Sales must decide before the warehouse can be unblocked. */
  needsSalesReview: boolean;
}

/** §4 — confirmed PO/invoice quantity against the Sales order quantity. */
export function compareSoConfirmed(
  soQuantity: number,
  confirmed: number,
  tolerancePct = 0
): SoReconResult {
  const { diff, diffPct } = variance(soQuantity, confirmed);
  const pct = diffPct ?? 0;
  let diffStatus: SoDiffStatus = "match";
  if (!nearlyEqual(diff, 0) && Math.abs(pct) > tolerancePct) {
    diffStatus = diff > 0 ? "over" : "short";
  }
  return {
    diff,
    diffPct: pct,
    diffStatus,
    needsSalesReview: diffStatus !== "match",
  };
}

/** §5 — PO vs SO comparison status. */
export function comparePoSo(
  soQuantity: number | null,
  poQuantity: number | null,
  tolerancePct = 0
): { diff: number | null; diffPct: number | null; status: ComparisonStatus } {
  if (soQuantity == null || soQuantity === 0) {
    if (poQuantity == null || poQuantity === 0) {
      return { diff: 0, diffPct: 0, status: "MATCH" };
    }
    return { diff: poQuantity, diffPct: null, status: "NO_SO" };
  }
  if (poQuantity == null || poQuantity === 0) {
    return { diff: -soQuantity, diffPct: -100, status: "NO_PO" };
  }
  const { diff, diffPct } = variance(soQuantity, poQuantity);
  const pct = diffPct ?? 0;
  if (nearlyEqual(diff, 0) || Math.abs(pct) <= tolerancePct) {
    return { diff, diffPct: pct, status: "MATCH" };
  }
  return { diff, diffPct: pct, status: diff > 0 ? "PO_GT_SO" : "PO_LT_SO" };
}
