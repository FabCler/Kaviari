import { describe, expect, it } from "vitest";
import {
  computeAduUnitsPerDay,
  daysOfCover,
  expectedDeliveryDate,
  nextOrderDate,
  orderUpToLevel,
  replenishmentSuggestion,
  roundUpToBox,
  suggestedOrderUnits,
} from "@/lib/replenishment";

const POLICY = { reviewPeriodDays: 15, leadTimeDays: 21, safetyStockDays: 15 };

describe("order-up-to level S", () => {
  it("covers lead time + review period + safety stock (51 days by default)", () => {
    expect(orderUpToLevel(4, POLICY)).toBe(4 * 51);
  });

  it("is zero for zero or negative ADU", () => {
    expect(orderUpToLevel(0, POLICY)).toBe(0);
    expect(orderUpToLevel(-5, POLICY)).toBe(0);
  });
});

describe("suggested order quantity", () => {
  it("orders the gap between S and the inventory position", () => {
    // ADU 4 tins/day -> S = 204. On hand 80, on order 40 -> gap 84.
    expect(
      suggestedOrderUnits(
        { aduUnitsPerDay: 4, onHandUnits: 80, onOrderUnits: 40 },
        POLICY
      )
    ).toBe(84);
  });

  it("never suggests a negative quantity", () => {
    expect(
      suggestedOrderUnits(
        { aduUnitsPerDay: 1, onHandUnits: 40, onOrderUnits: 40 },
        POLICY
      )
    ).toBe(0);
  });

  it("counts ALL pipeline stock so overlapping orders never double-order", () => {
    // Lead time 21 d > review period 15 d: at each review the previous order
    // is still in transit. Steady state with ADU 4/day: S = 204; each review
    // the position has dropped by one review period of demand (60). With the
    // previous order (60) still in the pipeline, on hand is 84.
    const steadyStateOrder = suggestedOrderUnits(
      { aduUnitsPerDay: 4, onHandUnits: 84, onOrderUnits: 60 },
      POLICY
    );
    expect(steadyStateOrder).toBe(60);

    // Ignoring the pipeline would order 120 (double-order).
    const naive = suggestedOrderUnits(
      { aduUnitsPerDay: 4, onHandUnits: 84, onOrderUnits: 0 },
      POLICY
    );
    expect(naive).toBe(120);
    expect(naive).not.toBe(steadyStateOrder);
  });

  it("handles multiple overlapping open POs in the pipeline", () => {
    expect(
      suggestedOrderUnits(
        { aduUnitsPerDay: 4, onHandUnits: 60, onOrderUnits: 90 },
        POLICY
      )
    ).toBe(54);
  });
});

describe("box rounding", () => {
  it("rounds up to whole units without a packing size", () => {
    expect(roundUpToBox(16.2, null)).toBe(17);
    expect(roundUpToBox(16.2, undefined)).toBe(17);
    expect(roundUpToBox(16.2, 1)).toBe(17);
  });

  it("rounds up to a full box", () => {
    expect(roundUpToBox(1, 12)).toBe(12); // 1 tin needed -> 1 box of 12
    expect(roundUpToBox(12, 12)).toBe(12); // exact box stays
    expect(roundUpToBox(13, 12)).toBe(24); // 13 tins -> 2 boxes
    expect(roundUpToBox(16.2, 24)).toBe(24);
    expect(roundUpToBox(25, 24)).toBe(48);
  });

  it("returns zero for zero or negative need", () => {
    expect(roundUpToBox(0, 12)).toBe(0);
    expect(roundUpToBox(-3, 12)).toBe(0);
  });
});

describe("replenishmentSuggestion", () => {
  it("combines S, gap, box rounding and days of cover", () => {
    // S = 204, position 120 -> raw gap 84; box of 24 -> 96 units (4 boxes).
    const suggestion = replenishmentSuggestion(
      {
        aduUnitsPerDay: 4,
        onHandUnits: 80,
        onOrderUnits: 40,
        packingPerBox: 24,
      },
      POLICY
    );
    expect(suggestion.orderUpToUnits).toBe(204);
    expect(suggestion.suggestedRawUnits).toBe(84);
    expect(suggestion.suggestedUnits).toBe(96);
    expect(suggestion.boxes).toBe(4);
    expect(suggestion.daysOfCover).toBe(20);
  });

  it("suggests nothing for a dormant product with no stock", () => {
    const suggestion = replenishmentSuggestion(
      { aduUnitsPerDay: 0, onHandUnits: 0, onOrderUnits: 0, packingPerBox: 12 },
      POLICY
    );
    expect(suggestion.suggestedUnits).toBe(0);
    expect(suggestion.boxes).toBe(0);
    expect(suggestion.daysOfCover).toBeNull();
  });
});

describe("ADU", () => {
  const now = new Date("2026-08-11T00:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it("averages demand over the trailing window", () => {
    const demand = [
      { units: 30, date: daysAgo(1) },
      { units: 30, date: daysAgo(10) },
      { units: 24, date: daysAgo(41) },
    ];
    expect(computeAduUnitsPerDay(demand, 42, now)).toBe(2);
  });

  it("ignores demand outside the window or in the future", () => {
    const demand = [
      { units: 42, date: daysAgo(2) },
      { units: 999, date: daysAgo(43) }, // too old
      { units: 999, date: daysAgo(-1) }, // future
    ];
    expect(computeAduUnitsPerDay(demand, 42, now)).toBe(1);
  });

  it("prefers the manual override when set", () => {
    const demand = [{ units: 42, date: daysAgo(2) }];
    expect(computeAduUnitsPerDay(demand, 42, now, 5)).toBe(5);
    expect(computeAduUnitsPerDay(demand, 42, now, 0)).toBe(0);
    expect(computeAduUnitsPerDay(demand, 42, now, null)).toBe(1);
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
  it("divides on-hand units by ADU", () => {
    expect(daysOfCover(80, 4)).toBe(20);
  });
  it("is null (infinite) with no consumption", () => {
    expect(daysOfCover(80, 0)).toBeNull();
  });
});
