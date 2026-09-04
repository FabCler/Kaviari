import { describe, expect, it } from "vitest";
import {
  PIPELINE_STATUSES,
  WORKFLOW_STATUSES,
  canTransition,
  resolveStatus,
  statusRank,
  type PipelineFacts,
} from "@/lib/scm/status";
import { distributeConfirmed } from "@/lib/scm/workflow";

const BASE: PipelineFacts = {
  poQuantity: 0,
  requiredQuantity: 100,
  hasInvoice: false,
  poInvoiceApproved: false,
  poInvoiceOpen: false,
  salesReviewRequired: false,
  salesReviewDone: false,
  allocationRequired: false,
  allocationCompleted: false,
  received: false,
  partiallyReceived: false,
  fullyReceived: false,
  readyToShip: false,
  shipped: false,
  completed: false,
};

describe("the central status engine (§42)", () => {
  it("defines the whole pipeline plus the four exception states", () => {
    expect(PIPELINE_STATUSES).toHaveLength(18);
    expect(WORKFLOW_STATUSES).toHaveLength(22);
    expect(WORKFLOW_STATUSES[0]).toBe("IMPORTED");
    for (const status of [
      "PENDING_RECONCILIATION",
      "RECONCILED",
      "PARTIALLY_RECEIVED",
      "FULLY_RECEIVED",
      "READY_TO_SHIP",
      "SHIPPED",
      "BLOCKED",
      "EXCEPTION",
      "REJECTED",
      "CANCELLED",
    ]) {
      expect(WORKFLOW_STATUSES).toContain(status);
    }
  });

  it("orders the pipeline so progress can be compared", () => {
    expect(statusRank("PENDING_PO")).toBeLessThan(statusRank("PO_CREATED"));
    expect(statusRank("READY_TO_RECEIVE")).toBeLessThan(statusRank("COMPLETED"));
  });
});

describe("resolveStatus", () => {
  it("waits for a PO while the demand is not covered", () => {
    expect(resolveStatus({ ...BASE, poQuantity: 0 })).toBe("PENDING_PO");
    expect(resolveStatus({ ...BASE, poQuantity: 60 })).toBe("PENDING_PO");
  });

  it("waits for the invoice once the demand is covered", () => {
    expect(resolveStatus({ ...BASE, poQuantity: 100 })).toBe("PENDING_INVOICE");
  });

  it("walks through reconciliation, sales review and allocation", () => {
    const invoiced = { ...BASE, poQuantity: 100, hasInvoice: true };
    expect(resolveStatus(invoiced)).toBe("INVOICE_UPLOADED");
    expect(resolveStatus({ ...invoiced, poInvoiceOpen: true })).toBe(
      "PENDING_RECONCILIATION"
    );

    const approved = { ...invoiced, poInvoiceApproved: true };
    expect(resolveStatus(approved)).toBe("RECONCILED");
    expect(
      resolveStatus({ ...approved, salesReviewRequired: true })
    ).toBe("PENDING_SALES_REVIEW");
    expect(
      resolveStatus({ ...approved, allocationRequired: true })
    ).toBe("PENDING_ALLOCATION");
    expect(
      resolveStatus({ ...approved, allocationCompleted: true })
    ).toBe("READY_TO_RECEIVE");
  });

  it("distinguishes partial from full receipts (§23)", () => {
    const base = { ...BASE, poQuantity: 100, allocationCompleted: true };
    expect(resolveStatus({ ...base, received: true })).toBe("RECEIVED");
    expect(
      resolveStatus({ ...base, received: true, partiallyReceived: true })
    ).toBe("PARTIALLY_RECEIVED");
    expect(
      resolveStatus({ ...base, received: true, fullyReceived: true })
    ).toBe("FULLY_RECEIVED");
  });

  it("runs through shipment to completion", () => {
    const base = {
      ...BASE,
      poQuantity: 100,
      allocationCompleted: true,
      received: true,
      fullyReceived: true,
    };
    expect(resolveStatus({ ...base, readyToShip: true })).toBe("READY_TO_SHIP");
    expect(resolveStatus({ ...base, shipped: true })).toBe("SHIPPED");
    expect(resolveStatus({ ...base, shipped: true, completed: true })).toBe(
      "COMPLETED"
    );
  });

  it("holds at EXCEPTION while an approval is outstanding (§20)", () => {
    // A cross-channel shortage is not a mistake to unblock — it is a decision
    // the workflow is waiting for, and it outranks everything downstream.
    expect(
      resolveStatus({
        ...BASE,
        poQuantity: 100,
        poInvoiceApproved: true,
        allocationRequired: true,
        exception: true,
      })
    ).toBe("EXCEPTION");
  });

  it("marks a rejected reconciliation as REJECTED", () => {
    expect(resolveStatus({ ...BASE, rejected: true, poQuantity: 100 })).toBe(
      "REJECTED"
    );
  });

  it("lets BLOCKED and CANCELLED win over everything", () => {
    expect(resolveStatus({ ...BASE, blocked: true, shipped: true })).toBe(
      "BLOCKED"
    );
    expect(resolveStatus({ ...BASE, cancelled: true, blocked: true })).toBe(
      "CANCELLED"
    );
  });
});

describe("transitions (§21 — no skipping the workflow)", () => {
  it("allows the documented steps", () => {
    expect(canTransition("PENDING_PO", "PO_CREATED")).toBe(true);
    expect(canTransition("ALLOCATION_COMPLETED", "READY_TO_RECEIVE")).toBe(true);
  });

  it("refuses to jump straight to receiving", () => {
    expect(canTransition("PO_CREATED", "READY_TO_RECEIVE")).toBe(false);
    expect(canTransition("PENDING_SALES_REVIEW", "RECEIVED")).toBe(false);
    expect(canTransition("PARTIALLY_RECEIVED", "SHIPPED")).toBe(false);
  });

  it("only ships what has been fully received", () => {
    expect(canTransition("FULLY_RECEIVED", "READY_TO_SHIP")).toBe(true);
    expect(canTransition("READY_TO_SHIP", "SHIPPED")).toBe(true);
    expect(canTransition("SHIPPED", "COMPLETED")).toBe(true);
  });

  it("treats REJECTED and CANCELLED as final, BLOCKED as recoverable", () => {
    expect(canTransition("REJECTED", "PENDING_ALLOCATION")).toBe(false);
    expect(canTransition("CANCELLED", "PENDING_PO")).toBe(false);
    expect(canTransition("BLOCKED", "PENDING_ALLOCATION")).toBe(true);
    expect(canTransition("EXCEPTION", "PENDING_ALLOCATION")).toBe(true);
  });

  it("lets anything be blocked or cancelled, and a block be recovered", () => {
    expect(canTransition("PO_CREATED", "BLOCKED")).toBe(true);
    expect(canTransition("PENDING_ALLOCATION", "CANCELLED")).toBe(true);
    expect(canTransition("BLOCKED", "PENDING_ALLOCATION")).toBe(true);
  });

  it("rejects unknown states", () => {
    expect(canTransition("NOT_A_STATUS", "RECEIVED")).toBe(false);
  });
});

describe("distributing a confirmed quantity across demand", () => {
  it("splits pro-rata by requested quantity", () => {
    const shares = distributeConfirmed(20, [
      { id: "a", quantity: 12 },
      { id: "b", quantity: 8 },
    ]);
    expect(shares.get("a")).toBe(12);
    expect(shares.get("b")).toBe(8);
  });

  it("always sums back to the confirmed quantity", () => {
    const shares = distributeConfirmed(10, [
      { id: "a", quantity: 1 },
      { id: "b", quantity: 1 },
      { id: "c", quantity: 1 },
    ]);
    const total = [...shares.values()].reduce((sum, value) => sum + value, 0);
    expect(Math.round(total * 10000) / 10000).toBe(10);
  });

  it("shares a shortfall proportionally", () => {
    const shares = distributeConfirmed(30, [
      { id: "a", quantity: 24 },
      { id: "b", quantity: 12 },
    ]);
    expect(shares.get("a")).toBe(20);
    expect(shares.get("b")).toBe(10);
  });
});
