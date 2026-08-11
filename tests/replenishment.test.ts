import { describe, expect, it } from "vitest";
import {
  computeAduGramsPerDay,
  daysOfCover,
  expectedDeliveryDate,
  gramsToTins,
  nextOrderDate,
  orderUpToLevelGrams,
  replenishmentSuggestion,
  suggestedOrderGrams,
} from "@/lib/replenishment";

const POLICY = { reviewPeriodDays: 15, leadTimeDays: 21, safetyStockDays: 15 };

describe("order-up-to level S", () => {
  it("covers lead time + review period + safety stock (51 days by default)", () => {
    expect(orderUpToLevelGrams(100, POLICY)).toBe(100 * 51);
  });

  it("is zero for zero or negative ADU", () => {
    expect(orderUpToLevelGrams(0, POLICY)).toBe(0);
    expect(orderUpToLevelGrams(-5, POLICY)).toBe(0);
  });
});

describe("suggested order quantity", () => {
  it("orders the gap between S and the inventory position", () => {
    // ADU 100 g/day -> S = 5100 g. On hand 2000, on order 1000 -> gap 2100.
    expect(
      suggestedOrderGrams(
        { aduGramsPerDay: 100, onHandGrams: 2000, onOrderGrams: 1000 },
        POLICY
      )
    ).toBe(2100);
  });

  it("never suggests a negative quantity", () => {
    expect(
      suggestedOrderGrams(
        { aduGramsPerDay: 10, onHandGrams: 400, onOrderGrams: 400 },
        POLICY
      )
    ).toBe(0);
  });

  it("counts ALL pipeline stock so overlapping orders never double-order", () => {
    // Lead time 21 d > review period 15 d, so when a review comes around the
    // previous order (15 days old, 6 days from arriving) is still in transit.
    // Steady state with ADU 100 g/day: S = 5100 g, and each review the
    // inventory position has dropped by exactly one review period of demand
    // (1500 g). With the previous order (1500 g) still in the pipeline, on
    // hand is 2100 g and the position is 3600 g.
    const steadyStateOrder = suggestedOrderGrams(
      { aduGramsPerDay: 100, onHandGrams: 2100, onOrderGrams: 1500 },
      POLICY
    );
    // Correct math re-orders exactly the last cycle's consumption...
    expect(steadyStateOrder).toBe(1500);

    // ...whereas ignoring the pipeline would order 3000 g (double-order).
    const naive = suggestedOrderGrams(
      { aduGramsPerDay: 100, onHandGrams: 2100, onOrderGrams: 0 },
      POLICY
    );
    expect(naive).toBe(3000);
    expect(naive).not.toBe(steadyStateOrder);
  });

  it("handles multiple overlapping open POs in the pipeline", () => {
    // Two open orders of 1500 g and 750 g both count toward the position.
    expect(
      suggestedOrderGrams(
        { aduGramsPerDay: 100, onHandGrams: 2000, onOrderGrams: 2250 },
        POLICY
      )
    ).toBe(850);
  });
});

describe("tin rounding", () => {
  it("rounds up to whole tins", () => {
    expect(gramsToTins(2100, 125)).toBe(17); // 16.8 -> 17
    expect(gramsToTins(125, 125)).toBe(1);
    expect(gramsToTins(126, 125)).toBe(2);
  });

  it("returns zero tins for zero or negative need", () => {
    expect(gramsToTins(0, 125)).toBe(0);
    expect(gramsToTins(-50, 125)).toBe(0);
  });

  it("rejects a non-positive tin size", () => {
    expect(() => gramsToTins(100, 0)).toThrow();
  });
});

describe("replenishmentSuggestion", () => {
  it("combines S, gap, tin rounding and days of cover", () => {
    const suggestion = replenishmentSuggestion(
      {
        aduGramsPerDay: 100,
        onHandGrams: 2000,
        onOrderGrams: 1000,
        tinSizeGrams: 125,
      },
      POLICY
    );
    expect(suggestion.orderUpToGrams).toBe(5100);
    expect(suggestion.suggestedGrams).toBe(2100);
    expect(suggestion.suggestedTins).toBe(17);
    expect(suggestion.roundedGrams).toBe(2125);
    expect(suggestion.daysOfCover).toBe(20);
  });

  it("suggests nothing for a dormant product with no stock", () => {
    const suggestion = replenishmentSuggestion(
      { aduGramsPerDay: 0, onHandGrams: 0, onOrderGrams: 0, tinSizeGrams: 30 },
      POLICY
    );
    expect(suggestion.suggestedTins).toBe(0);
    expect(suggestion.daysOfCover).toBeNull();
  });
});

describe("ADU", () => {
  const now = new Date("2026-08-11T00:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it("averages demand over the trailing window", () => {
    const demand = [
      { grams: 300, date: daysAgo(1) },
      { grams: 300, date: daysAgo(10) },
      { grams: 240, date: daysAgo(41) },
    ];
    expect(computeAduGramsPerDay(demand, 42, now)).toBe(20);
  });

  it("ignores demand outside the window or in the future", () => {
    const demand = [
      { grams: 420, date: daysAgo(2) },
      { grams: 9999, date: daysAgo(43) }, // too old
      { grams: 9999, date: daysAgo(-1) }, // future
    ];
    expect(computeAduGramsPerDay(demand, 42, now)).toBe(10);
  });

  it("prefers the manual override when set", () => {
    const demand = [{ grams: 420, date: daysAgo(2) }];
    expect(computeAduGramsPerDay(demand, 42, now, 55)).toBe(55);
    expect(computeAduGramsPerDay(demand, 42, now, 0)).toBe(0);
    // null / undefined override falls back to history
    expect(computeAduGramsPerDay(demand, 42, now, null)).toBe(10);
  });
});

describe("cycle dates", () => {
  it("next order = last order + review period", () => {
    expect(nextOrderDate(new Date("2026-08-01T00:00:00Z"), 15)).toEqual(
      new Date("2026-08-16T00:00:00Z")
    );
  });

  it("expected delivery = order date + lead time", () => {
    expect(expectedDeliveryDate(new Date("2026-08-01T00:00:00Z"), 21)).toEqual(
      new Date("2026-08-22T00:00:00Z")
    );
  });
});

describe("days of cover", () => {
  it("divides on-hand grams by ADU", () => {
    expect(daysOfCover(1000, 50)).toBe(20);
  });
  it("is null (infinite) with no consumption", () => {
    expect(daysOfCover(1000, 0)).toBeNull();
  });
});
