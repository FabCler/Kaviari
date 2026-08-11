import { describe, expect, it } from "vitest";
import { allocateFefo } from "@/lib/fefo";

const lot = (id: string, quantityTins: number, expiry: string) => ({
  id,
  quantityTins,
  expiryDate: new Date(expiry),
});

describe("FEFO allocation", () => {
  it("draws from the soonest-expiring lot first", () => {
    const result = allocateFefo(
      [
        lot("late", 10, "2026-12-01"),
        lot("soon", 10, "2026-09-01"),
        lot("middle", 10, "2026-10-01"),
      ],
      4
    );
    expect(result.allocations).toEqual([{ lotId: "soon", tins: 4 }]);
    expect(result.shortfallTins).toBe(0);
  });

  it("spills into the next lot when the first runs out", () => {
    const result = allocateFefo(
      [lot("soon", 3, "2026-09-01"), lot("late", 10, "2026-12-01")],
      5
    );
    expect(result.allocations).toEqual([
      { lotId: "soon", tins: 3 },
      { lotId: "late", tins: 2 },
    ]);
  });

  it("reports a shortfall instead of over-allocating", () => {
    const result = allocateFefo([lot("only", 2, "2026-09-01")], 5);
    expect(result.allocations).toEqual([{ lotId: "only", tins: 2 }]);
    expect(result.shortfallTins).toBe(3);
  });

  it("skips empty lots and handles zero requests", () => {
    expect(allocateFefo([lot("empty", 0, "2026-09-01")], 3).shortfallTins).toBe(
      3
    );
    expect(allocateFefo([lot("a", 5, "2026-09-01")], 0).allocations).toEqual(
      []
    );
  });

  it("breaks expiry ties deterministically by lot id", () => {
    const result = allocateFefo(
      [lot("b", 5, "2026-09-01"), lot("a", 5, "2026-09-01")],
      6
    );
    expect(result.allocations).toEqual([
      { lotId: "a", tins: 5 },
      { lotId: "b", tins: 1 },
    ]);
  });
});
