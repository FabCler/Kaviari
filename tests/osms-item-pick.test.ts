import { describe, expect, it } from "vitest";
import { validateItemAssignments } from "@/lib/osms/allocation";
import { priorityFor } from "@/lib/osms/sla";

/**
 * Flow §6.2 → §7 → §8. Ten fish that weigh ten different things cannot be
 * divided by arithmetic, so sales places them one by one. What the machine
 * still owes is the check: every piece placed, and each customer's pieces
 * adding up to what they were allocated.
 */
describe("weighed item picks", () => {
  const customers = new Map([
    ["hotel", 5],
    ["market", 4],
  ]);

  it("refuses a pick that leaves a piece with nobody", () => {
    const result = validateItemAssignments(
      [
        { itemNo: "FISH-01", weight: 2.6, allocationLineId: "hotel" },
        { itemNo: "FISH-02", weight: 2.4, allocationLineId: "hotel" },
        { itemNo: "FISH-03", weight: 4.0, allocationLineId: "market" },
        { itemNo: "FISH-04", weight: 1.9, allocationLineId: null },
      ],
      customers,
      0.05
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("FISH-04");
  });

  it("refuses a pick whose weights miss what the customer was allocated", () => {
    // Everything is placed, but the hotel ends up with 4.2 against 5.
    const result = validateItemAssignments(
      [
        { itemNo: "FISH-01", weight: 2.1, allocationLineId: "hotel" },
        { itemNo: "FISH-02", weight: 2.1, allocationLineId: "hotel" },
        { itemNo: "FISH-03", weight: 4.8, allocationLineId: "market" },
      ],
      customers,
      0.05
    );
    expect(result.ok).toBe(false);
  });

  it("accepts a pick that places every piece on target", () => {
    const result = validateItemAssignments(
      [
        { itemNo: "FISH-01", weight: 2.6, allocationLineId: "hotel" },
        { itemNo: "FISH-02", weight: 2.4, allocationLineId: "hotel" },
        { itemNo: "FISH-03", weight: 4.0, allocationLineId: "market" },
      ],
      customers,
      0.05
    );
    expect(result.ok).toBe(true);
    expect(result.assignedByLine.get("hotel")).toBe(5);
    expect(result.assignedByLine.get("market")).toBe(4);
  });

  it("allows the small rounding a physical scale produces", () => {
    const result = validateItemAssignments(
      [
        { itemNo: "FISH-01", weight: 2.62, allocationLineId: "hotel" },
        { itemNo: "FISH-02", weight: 2.4, allocationLineId: "hotel" },
        { itemNo: "FISH-03", weight: 3.97, allocationLineId: "market" },
      ],
      customers,
      0.05
    );
    expect(result.ok).toBe(true);
  });
});

/**
 * Flow §4 — purchasing has to settle a PO/Invoice difference BEFORE the goods
 * arrive, so urgency is read off the delivery date rather than typed by hand.
 */
describe("reconciliation urgency", () => {
  const now = new Date("2026-09-04T00:00:00Z");

  it("is critical once the delivery date has arrived", () => {
    expect(priorityFor(new Date("2026-09-04T00:00:00Z"), now)).toBe("critical");
    expect(priorityFor(new Date("2026-09-02T00:00:00Z"), now)).toBe("critical");
  });

  it("lifts to high the day before", () => {
    expect(priorityFor(new Date("2026-09-05T00:00:00Z"), now)).toBe("high");
  });

  it("stays low while the delivery is still a week out", () => {
    expect(priorityFor(new Date("2026-09-11T00:00:00Z"), now)).toBe("low");
  });

  it("falls back to medium when the PO carries no delivery date", () => {
    expect(priorityFor(null, now)).toBe("medium");
  });
});
