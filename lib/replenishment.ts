/**
 * Periodic-review (R, S) replenishment policy — computed in STOCK UNITS
 * (tins for caviar; pieces/kg for other products).
 *
 * Every R days (review period) we place one order that brings each product's
 * inventory position — on hand PLUS everything already on order — up to the
 * order-up-to level S:
 *
 *   S = ADU × (L + R + safetyDays)
 *
 * where ADU is average daily usage in units, L the supplier lead time and
 * safetyDays the safety-stock coverage. Because L (21 d) exceeds R (15 d),
 * at any moment at least one order is still in transit; counting pipeline
 * stock in the inventory position is what prevents double-ordering.
 *
 * Ordered quantities are rounded up to whole units, then up to a full
 * supplier box when the product has a packing size.
 *
 * All functions here are pure — the DB glue lives in lib/stock.ts.
 */

export interface ReplenishmentPolicy {
  reviewPeriodDays: number;
  leadTimeDays: number;
  safetyStockDays: number;
}

export interface ProductReplenishmentInput {
  aduUnitsPerDay: number;
  onHandUnits: number;
  /** Pipeline stock: sum over ALL open (sent/confirmed) PO lines. */
  onOrderUnits: number;
  /** Units per full supplier box; null/undefined = no box constraint. */
  packingPerBox?: number | null;
}

export interface ReplenishmentSuggestion {
  orderUpToUnits: number;
  /** Raw gap between S and the inventory position (can be fractional). */
  suggestedRawUnits: number;
  /** Whole units, rounded up to a full box when packing applies. */
  suggestedUnits: number;
  boxes: number | null;
  daysOfCover: number | null; // null = no consumption (infinite cover)
}

export function orderUpToLevel(
  aduUnitsPerDay: number,
  policy: ReplenishmentPolicy
): number {
  const horizon =
    policy.leadTimeDays + policy.reviewPeriodDays + policy.safetyStockDays;
  return Math.max(0, aduUnitsPerDay) * horizon;
}

export function suggestedOrderUnits(
  input: Pick<
    ProductReplenishmentInput,
    "aduUnitsPerDay" | "onHandUnits" | "onOrderUnits"
  >,
  policy: ReplenishmentPolicy
): number {
  const S = orderUpToLevel(input.aduUnitsPerDay, policy);
  return Math.max(0, S - input.onHandUnits - input.onOrderUnits);
}

/** Round a required quantity up to whole units, then to a full box. */
export function roundUpToBox(
  units: number,
  packingPerBox?: number | null
): number {
  if (units <= 0) return 0;
  const whole = Math.ceil(units);
  if (!packingPerBox || packingPerBox <= 1) return whole;
  return Math.ceil(whole / packingPerBox) * packingPerBox;
}

export function daysOfCover(
  onHandUnits: number,
  aduUnitsPerDay: number
): number | null {
  if (aduUnitsPerDay <= 0) return null;
  return onHandUnits / aduUnitsPerDay;
}

export function replenishmentSuggestion(
  input: ProductReplenishmentInput,
  policy: ReplenishmentPolicy
): ReplenishmentSuggestion {
  const S = orderUpToLevel(input.aduUnitsPerDay, policy);
  const raw = Math.max(0, S - input.onHandUnits - input.onOrderUnits);
  const units = roundUpToBox(raw, input.packingPerBox);
  return {
    orderUpToUnits: S,
    suggestedRawUnits: raw,
    suggestedUnits: units,
    boxes:
      input.packingPerBox && input.packingPerBox > 0
        ? units / input.packingPerBox
        : null,
    daysOfCover: daysOfCover(input.onHandUnits, input.aduUnitsPerDay),
  };
}

export interface DemandEvent {
  /** Units consumed (positive number). */
  units: number;
  date: Date;
}

/**
 * Trailing average daily usage (units/day) over `windowDays` ending at
 * `now`. A manual override wins when set — used for seasonality or products
 * too new to have history.
 */
export function computeAduUnitsPerDay(
  demand: DemandEvent[],
  windowDays: number,
  now: Date,
  overrideUnitsPerDay?: number | null
): number {
  if (overrideUnitsPerDay != null && overrideUnitsPerDay >= 0) {
    return overrideUnitsPerDay;
  }
  if (windowDays <= 0) return 0;
  const windowStart = new Date(now.getTime() - windowDays * 86_400_000);
  let total = 0;
  for (const event of demand) {
    if (event.date > now || event.date < windowStart) continue;
    total += Math.max(0, event.units);
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
