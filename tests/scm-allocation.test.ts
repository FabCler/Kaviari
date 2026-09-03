import { describe, expect, it } from "vitest";
import {
  totalWeight,
  totalsFor,
  validateAllocation,
  validateItemAssignments,
} from "@/lib/scm/allocation";

const CUSTOMER = (quantity: number, customerId = "cust-a") => ({
  target: "customer" as const,
  quantity,
  customerId,
});

const STOCK = (quantity: number) => ({
  target: "warehouse" as const,
  quantity,
  storageLocation: "MAIN-COLD",
  reason: "Leftover from the MOQ",
  responsibleDept: "warehouse",
});

describe("allocation totals (§6)", () => {
  it("splits customers from warehouse stock and reports the remainder", () => {
    // The spec's example: SO 500, actual 600 -> A 200, B 300, stock 100.
    const totals = totalsFor(600, [
      CUSTOMER(200, "a"),
      CUSTOMER(300, "b"),
      STOCK(100),
    ]);
    expect(totals.allocatedQuantity).toBe(500);
    expect(totals.warehouseQuantity).toBe(100);
    expect(totals.unallocatedQuantity).toBe(0);
    expect(totals.balanced).toBe(true);
  });

  it("reports what is still unallocated", () => {
    const totals = totalsFor(1000, [CUSTOMER(400, "a"), CUSTOMER(300, "b")]);
    expect(totals.unallocatedQuantity).toBe(300);
    expect(totals.balanced).toBe(false);
  });
});

describe("allocation validation", () => {
  it("refuses to complete while anything is unallocated", () => {
    const result = validateAllocation(1000, [CUSTOMER(400), CUSTOMER(300, "b")], {
      requireBalanced: true,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("300 still unallocated");
  });

  it("allows an unbalanced draft", () => {
    const result = validateAllocation(1000, [CUSTOMER(400)], {
      requireBalanced: false,
    });
    expect(result.ok).toBe(true);
    expect(result.totals.unallocatedQuantity).toBe(600);
  });

  it("rejects over-allocation outright", () => {
    const result = validateAllocation(100, [CUSTOMER(80), CUSTOMER(40, "b")]);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("Over-allocated");
  });

  it("requires a customer on a customer line", () => {
    const result = validateAllocation(100, [
      { target: "customer", quantity: 100, customerId: null },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("choose the customer");
  });

  it("requires location, reason and owner on warehouse stock (§4.2)", () => {
    const result = validateAllocation(100, [
      { target: "warehouse", quantity: 100 },
    ]);
    expect(result.ok).toBe(false);
    const message = result.errors.join(" ");
    expect(message).toContain("storage location");
    expect(message).toContain("reason");
    expect(message).toContain("department responsible");
  });

  it("accepts a balanced allocation with a fully described stock line", () => {
    const result = validateAllocation(600, [CUSTOMER(500), STOCK(100)], {
      requireBalanced: true,
    });
    expect(result.ok).toBe(true);
  });
});

describe("weight-based products (§6.2)", () => {
  it("totals the individually weighed pieces", () => {
    expect(
      totalWeight([
        { itemNo: "Fish 01", weight: 1.2 },
        { itemNo: "Fish 02", weight: 1.05 },
        { itemNo: "Fish 03", weight: 1.35 },
      ])
    ).toBe(3.6);
  });

  it("requires every piece to be assigned to a customer", () => {
    const result = validateItemAssignments(
      [
        { itemNo: "Fish 01", weight: 1.2, allocationLineId: "line-a" },
        { itemNo: "Fish 02", weight: 1.05, allocationLineId: null },
      ],
      new Map([["line-a", 1.2]])
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Fish 02");
  });

  it("checks the assigned weight against what each customer was promised", () => {
    const lines = new Map([
      ["line-a", 2.55],
      ["line-b", 1.05],
    ]);
    const ok = validateItemAssignments(
      [
        { itemNo: "Fish 01", weight: 1.2, allocationLineId: "line-a" },
        { itemNo: "Fish 02", weight: 1.05, allocationLineId: "line-b" },
        { itemNo: "Fish 03", weight: 1.35, allocationLineId: "line-a" },
      ],
      lines
    );
    expect(ok.ok).toBe(true);
    expect(ok.assignedByLine.get("line-a")).toBe(2.55);

    const wrong = validateItemAssignments(
      [
        { itemNo: "Fish 01", weight: 1.2, allocationLineId: "line-a" },
        { itemNo: "Fish 02", weight: 1.05, allocationLineId: "line-b" },
      ],
      lines
    );
    expect(wrong.ok).toBe(false);
  });
});
