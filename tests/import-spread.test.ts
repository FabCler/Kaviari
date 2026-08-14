import { describe, expect, it } from "vitest";
import {
  formatMonthLabel,
  isMonthPeriod,
  spreadMonthlyQuantity,
} from "@/lib/import/period";

const sumCents = (chunks: { tins: number }[]) =>
  chunks.reduce((sum, c) => sum + Math.round(c.tins * 100), 0);

describe("isMonthPeriod", () => {
  it("accepts yyyy-mm and rejects everything else", () => {
    expect(isMonthPeriod("2025-01")).toBe(true);
    expect(isMonthPeriod("2025-12")).toBe(true);
    expect(isMonthPeriod("2025-13")).toBe(false);
    expect(isMonthPeriod("2025-00")).toBe(false);
    expect(isMonthPeriod("2025-1")).toBe(false);
    expect(isMonthPeriod("2025-01-15")).toBe(false);
    expect(isMonthPeriod("")).toBe(false);
  });
});

describe("formatMonthLabel", () => {
  it("renders 'Jan 2025' style labels", () => {
    expect(formatMonthLabel("2025-01")).toBe("Jan 2025");
    expect(formatMonthLabel("2026-12")).toBe("Dec 2026");
  });

  it("falls back to the raw string for non-months", () => {
    expect(formatMonthLabel("2025-01-15")).toBe("2025-01-15");
  });
});

describe("spreadMonthlyQuantity", () => {
  it("splits a Monday-starting 31-day month into 7/7/7/7/3 day chunks", () => {
    // December 2025 starts on a Monday. Whole-number totals spread as whole
    // numbers (largest remainder), summing exactly.
    const chunks = spreadMonthlyQuantity("2025-12", 20);
    expect(chunks.map((c) => c.days)).toEqual([7, 7, 7, 7, 3]);
    expect(chunks.map((c) => c.tins)).toEqual([5, 5, 4, 4, 2]);
    expect(sumCents(chunks)).toBe(2000); // exact total
    expect(chunks.map((c) => c.weekStart)).toEqual([
      "2025-12-01",
      "2025-12-08",
      "2025-12-15",
      "2025-12-22",
      "2025-12-29",
    ]);
    expect(chunks[4].weekEnd).toBe("2025-12-31");
  });

  it("respects ISO week (Monday) boundaries mid-week", () => {
    // January 2025 starts on a Wednesday: 5 days, then 7/7/7, then 5.
    const chunks = spreadMonthlyQuantity("2025-01", 31);
    expect(chunks.map((c) => c.days)).toEqual([5, 7, 7, 7, 5]);
    expect(chunks[0].weekStart).toBe("2025-01-01");
    expect(chunks[0].weekEnd).toBe("2025-01-05"); // Sunday
    expect(chunks[1].weekStart).toBe("2025-01-06"); // Monday
    expect(chunks.map((c) => c.tins)).toEqual([5, 7, 7, 7, 5]);
  });

  it("dates each movement at the middle of its chunk", () => {
    const chunks = spreadMonthlyQuantity("2025-01", 31);
    // 5-day chunk 1–5 → day 3; 7-day chunk 6–12 → day 9; 27–31 → day 29.
    expect(chunks.map((c) => c.date)).toEqual([
      "2025-01-03",
      "2025-01-09",
      "2025-01-16",
      "2025-01-23",
      "2025-01-29",
    ]);
  });

  it("handles a perfectly aligned February (4 full ISO weeks)", () => {
    // February 2027 starts on a Monday and has 28 days. Integer totals stay
    // integer per chunk (10 -> 3/3/2/2); fractional totals split evenly.
    const chunks = spreadMonthlyQuantity("2027-02", 10);
    expect(chunks.map((c) => c.days)).toEqual([7, 7, 7, 7]);
    expect(chunks.map((c) => c.tins)).toEqual([3, 3, 2, 2]);
    expect(spreadMonthlyQuantity("2027-02", 10.5).map((c) => c.tins)).toEqual([
      2.63, 2.63, 2.62, 2.62,
    ]);
  });

  it("spreads integer totals as integers", () => {
    for (const month of ["2025-01", "2025-02", "2026-07", "2025-12"]) {
      for (const qty of [1, 2, 7, 20, 81, 348]) {
        const chunks = spreadMonthlyQuantity(month, qty);
        expect(sumCents(chunks)).toBe(qty * 100);
        for (const chunk of chunks) {
          expect(Number.isInteger(chunk.tins)).toBe(true);
        }
      }
    }
  });

  it("keeps the total exact for awkward quantities (last chunk absorbs drift)", () => {
    const months = [
      "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06",
      "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12",
    ];
    const quantities = [0.01, 0.1, 1, 3.33, 20, 33.33, 100.07, 9999.99];
    for (const month of months) {
      for (const qty of quantities) {
        const chunks = spreadMonthlyQuantity(month, qty);
        expect(sumCents(chunks)).toBe(Math.round(qty * 100));
        for (const chunk of chunks) {
          expect(chunk.tins).toBeGreaterThan(0);
          expect(chunk.date.startsWith(month)).toBe(true);
          expect(chunk.days).toBeGreaterThanOrEqual(1);
          expect(chunk.days).toBeLessThanOrEqual(7);
        }
      }
    }
  });

  it("drops zero-share chunks for tiny quantities but keeps the total", () => {
    const chunks = spreadMonthlyQuantity("2025-12", 0.01);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].tins).toBe(0.01);
    // The largest-remainder unit lands on the biggest-share (first full) week.
    expect(chunks[0].days).toBe(7);
    const one = spreadMonthlyQuantity("2025-12", 1);
    expect(one).toHaveLength(1);
    expect(one[0].tins).toBe(1);
  });

  it("covers every day of the month exactly once", () => {
    for (const [month, daysInMonth] of [
      ["2025-02", 28],
      ["2024-02", 29],
      ["2025-06", 30],
      ["2025-08", 31],
    ] as const) {
      const chunks = spreadMonthlyQuantity(month, 50);
      const covered = chunks.reduce((sum, c) => sum + c.days, 0);
      expect(covered).toBe(daysInMonth);
      // Contiguous, non-overlapping segments.
      for (let i = 1; i < chunks.length; i++) {
        const prevEnd = Number(chunks[i - 1].weekEnd.slice(8));
        const nextStart = Number(chunks[i].weekStart.slice(8));
        expect(nextStart).toBe(prevEnd + 1);
      }
    }
  });

  it("returns nothing for zero or negative quantities", () => {
    expect(spreadMonthlyQuantity("2025-06", 0)).toEqual([]);
    expect(spreadMonthlyQuantity("2025-06", -3)).toEqual([]);
  });

  it("rejects malformed months", () => {
    expect(() => spreadMonthlyQuantity("2025-13", 5)).toThrow();
    expect(() => spreadMonthlyQuantity("2025-1", 5)).toThrow();
    expect(() => spreadMonthlyQuantity("2025-01-15", 5)).toThrow();
    expect(() => spreadMonthlyQuantity("garbage", 5)).toThrow();
  });
});
