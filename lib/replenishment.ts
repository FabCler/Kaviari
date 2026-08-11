/**
 * Periodic-review (R, S) replenishment policy.
 *
 * Every R days (review period) we place one order that brings each product's
 * inventory position — on hand PLUS everything already on order — up to the
 * order-up-to level S:
 *
 *   S = ADU × (L + R + safetyDays)
 *
 * where ADU is average daily usage in grams, L the supplier lead time and
 * safetyDays the safety-stock coverage. Because L (21 d) exceeds R (15 d),
 * at any moment at least one order is still in transit; counting pipeline
 * stock in the inventory position is what prevents double-ordering.
 *
 * All functions here are pure — the DB glue lives in lib/planner.ts.
 */

export interface ReplenishmentPolicy {
  reviewPeriodDays: number;
  leadTimeDays: number;
  safetyStockDays: number;
}

export interface ProductReplenishmentInput {
  aduGramsPerDay: number;
  onHandGrams: number;
  /** Pipeline stock: sum over ALL open (sent/confirmed) PO lines. */
  onOrderGrams: number;
  tinSizeGrams: number;
}

export interface ReplenishmentSuggestion {
  orderUpToGrams: number;
  suggestedGrams: number;
  suggestedTins: number;
  /** suggestedTins × tinSizeGrams — what the rounded order actually delivers. */
  roundedGrams: number;
  daysOfCover: number | null; // null = no consumption (infinite cover)
}

export function orderUpToLevelGrams(
  aduGramsPerDay: number,
  policy: ReplenishmentPolicy
): number {
  const horizon =
    policy.leadTimeDays + policy.reviewPeriodDays + policy.safetyStockDays;
  return Math.max(0, aduGramsPerDay) * horizon;
}

export function suggestedOrderGrams(
  input: Pick<
    ProductReplenishmentInput,
    "aduGramsPerDay" | "onHandGrams" | "onOrderGrams"
  >,
  policy: ReplenishmentPolicy
): number {
  const S = orderUpToLevelGrams(input.aduGramsPerDay, policy);
  return Math.max(0, S - input.onHandGrams - input.onOrderGrams);
}

/** Convert a grams requirement into whole tins, rounding up. */
export function gramsToTins(grams: number, tinSizeGrams: number): number {
  if (grams <= 0) return 0;
  if (tinSizeGrams <= 0) throw new Error("tinSizeGrams must be positive");
  return Math.ceil(grams / tinSizeGrams);
}

export function daysOfCover(
  onHandGrams: number,
  aduGramsPerDay: number
): number | null {
  if (aduGramsPerDay <= 0) return null;
  return onHandGrams / aduGramsPerDay;
}

export function replenishmentSuggestion(
  input: ProductReplenishmentInput,
  policy: ReplenishmentPolicy
): ReplenishmentSuggestion {
  const S = orderUpToLevelGrams(input.aduGramsPerDay, policy);
  const grams = Math.max(0, S - input.onHandGrams - input.onOrderGrams);
  const tins = gramsToTins(grams, input.tinSizeGrams);
  return {
    orderUpToGrams: S,
    suggestedGrams: grams,
    suggestedTins: tins,
    roundedGrams: tins * input.tinSizeGrams,
    daysOfCover: daysOfCover(input.onHandGrams, input.aduGramsPerDay),
  };
}

export interface DemandEvent {
  /** Grams consumed (positive number). */
  grams: number;
  date: Date;
}

/**
 * Trailing average daily usage in grams over `windowDays` ending at `now`.
 * A manual override (grams/day) wins when set — used for seasonality or
 * products too new to have history.
 */
export function computeAduGramsPerDay(
  demand: DemandEvent[],
  windowDays: number,
  now: Date,
  overrideGramsPerDay?: number | null
): number {
  if (overrideGramsPerDay != null && overrideGramsPerDay >= 0) {
    return overrideGramsPerDay;
  }
  if (windowDays <= 0) return 0;
  const windowStart = new Date(now.getTime() - windowDays * 86_400_000);
  let total = 0;
  for (const event of demand) {
    if (event.date > now || event.date < windowStart) continue;
    total += Math.max(0, event.grams);
  }
  return total / windowDays;
}

export function nextOrderDate(
  lastOrderDate: Date,
  reviewPeriodDays: number
): Date {
  return new Date(lastOrderDate.getTime() + reviewPeriodDays * 86_400_000);
}

export function expectedDeliveryDate(
  orderDate: Date,
  leadTimeDays: number
): Date {
  return new Date(orderDate.getTime() + leadTimeDays * 86_400_000);
}
