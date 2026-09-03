import { describe, expect, it } from "vitest";
import { evaluateGate, type GateInput } from "@/lib/scm/gate";

/** A purchase order that passes all six checks. */
function readyInput(): GateInput {
  return {
    po: { status: "invoiced", supplierId: "sup-1", lineCount: 2 },
    invoices: [{ status: "verified" }],
    poInvoiceRecons: [
      { status: "approved", qtyStatus: "match", priceStatus: "match" },
      { status: "approved", qtyStatus: "match", priceStatus: "match" },
    ],
    salesRecons: [{ status: "completed" }],
    allocations: [
      { poLineId: "line-1", status: "completed", unallocatedQuantity: 0 },
      { poLineId: "line-2", status: "completed", unallocatedQuantity: 0 },
    ],
    requiredAllocationLineIds: ["line-1", "line-2"],
  };
}

describe("receiving gate (§7.1 / §21)", () => {
  it("is READY TO RECEIVE when all six checks pass", () => {
    const gate = evaluateGate(readyInput());
    expect(gate.ready).toBe(true);
    expect(gate.checks).toHaveLength(6);
    expect(gate.checks.every((check) => check.ok)).toBe(true);
    expect(gate.blockedReason).toBeNull();
  });

  it("blocks a draft purchase order", () => {
    const input = readyInput();
    input.po.status = "draft";
    const gate = evaluateGate(input);
    expect(gate.ready).toBe(false);
    expect(gate.blockedReason).toContain("Purchase order is valid");
  });

  it("blocks when no invoice has been verified", () => {
    const input = readyInput();
    input.invoices = [{ status: "pending_verification" }];
    const gate = evaluateGate(input);
    expect(gate.ready).toBe(false);
    expect(gate.checks[1].ok).toBe(false);
    expect(gate.checks[1].detail).toContain("waiting for purchasing");
  });

  it("blocks while purchasing has not signed off a difference", () => {
    const input = readyInput();
    input.poInvoiceRecons[1] = {
      status: "pending_review",
      qtyStatus: "short",
      priceStatus: "match",
    };
    const gate = evaluateGate(input);
    expect(gate.ready).toBe(false);
    expect(gate.blockedReason).toContain("purchasing reconciliation");
  });

  it("blocks while a sales review is still open", () => {
    const input = readyInput();
    input.salesRecons = [
      { status: "completed" },
      { status: "pending_sales_review" },
    ];
    const gate = evaluateGate(input);
    expect(gate.ready).toBe(false);
    expect(gate.blockedReason).toContain("sales reconciliation");
  });

  it("blocks when a line has not been allocated", () => {
    const input = readyInput();
    input.allocations = [
      { poLineId: "line-1", status: "completed", unallocatedQuantity: 0 },
    ];
    const gate = evaluateGate(input);
    expect(gate.ready).toBe(false);
    expect(gate.blockedReason).toContain("Allocation is complete");
  });

  it("blocks when anything is still unallocated", () => {
    const input = readyInput();
    input.allocations[1].unallocatedQuantity = 25;
    const gate = evaluateGate(input);
    expect(gate.ready).toBe(false);
    expect(gate.checks[5].detail).toContain("UNALLOCATED QUANTITY: 25");
  });

  it("names the first failing check, not the last", () => {
    const input = readyInput();
    input.invoices = [];
    input.allocations = [];
    const gate = evaluateGate(input);
    expect(gate.blockedReason).toContain("Supplier invoice is verified");
  });
});
