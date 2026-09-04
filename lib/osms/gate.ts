import { nearlyEqual } from "@/lib/osms/domain";

/**
 * Receiving validation gate (§7.1 / §21). Six checks stand between a
 * purchase order and the warehouse's "Receive" button. The function is pure
 * so the same evaluation drives the warehouse screen, the API guard and the
 * dashboard counters — there is exactly one definition of READY_TO_RECEIVE.
 */

export const GATE_CHECKS = [
  { id: "po", label: "Purchase order is valid" },
  { id: "invoice", label: "Supplier invoice is verified" },
  { id: "qty_recon", label: "PO vs Invoice reconciliation completed" },
  { id: "sales_recon", label: "SO review completed" },
  { id: "allocation", label: "Allocation completed or stock clearly assigned" },
  { id: "unallocated", label: "Unallocated quantity is zero" },
] as const;

export type GateCheckId = (typeof GATE_CHECKS)[number]["id"];

export interface GateCheck {
  id: GateCheckId;
  label: string;
  ok: boolean;
  detail: string;
}

export interface GateResult {
  ready: boolean;
  checks: GateCheck[];
  /** First failing check, phrased for the BLOCKED banner. */
  blockedReason: string | null;
}

export interface GateInput {
  po: {
    status: string;
    supplierId: string | null;
    lineCount: number;
  };
  invoices: { status: string }[];
  /** One entry per PO/Invoice reconciliation row. */
  poInvoiceRecons: { status: string; qtyStatus: string; priceStatus: string }[];
  /** One entry per Invoice/SO reconciliation row touching this PO. */
  salesRecons: { status: string }[];
  /** Cross-channel shortage cases still waiting for a management decision. */
  openShortageCases?: { caseNumber: string }[];
  /** One entry per PO line that needs allocating. */
  allocations: {
    poLineId: string;
    status: string;
    unallocatedQuantity: number;
  }[];
  /** PO line ids that must be allocated before receiving. */
  requiredAllocationLineIds: string[];
}

export function evaluateGate(input: GateInput): GateResult {
  const checks: GateCheck[] = [];

  // 1 — the PO itself
  const poOk =
    input.po.lineCount > 0 &&
    Boolean(input.po.supplierId) &&
    !["draft", "cancelled"].includes(input.po.status);
  checks.push({
    id: "po",
    label: "Purchase order is valid",
    ok: poOk,
    detail: poOk
      ? `PO ${input.po.status} with ${input.po.lineCount} line(s).`
      : input.po.lineCount === 0
        ? "The purchase order has no lines."
        : input.po.status === "draft"
          ? "The purchase order is still a draft — issue it first."
          : "The purchase order is cancelled or has no supplier.",
  });

  // 2 — a verified supplier invoice
  const verified = input.invoices.filter((i) => i.status === "verified").length;
  const pending = input.invoices.filter(
    (i) => i.status !== "verified" && i.status !== "rejected"
  ).length;
  const invoiceOk = verified > 0;
  checks.push({
    id: "invoice",
    label: "Supplier invoice is verified",
    ok: invoiceOk,
    detail: invoiceOk
      ? `${verified} verified invoice(s).`
      : input.invoices.length === 0
        ? "No supplier invoice uploaded for this PO."
        : `${pending} invoice(s) still waiting for purchasing to verify.`,
  });

  // 3 — purchasing signed off every quantity/price difference
  const openRecons = input.poInvoiceRecons.filter(
    (r) => r.status !== "approved"
  );
  const rejected = input.poInvoiceRecons.filter((r) => r.status === "rejected");
  const qtyOk =
    input.poInvoiceRecons.length > 0 &&
    openRecons.length === 0 &&
    rejected.length === 0;
  checks.push({
    id: "qty_recon",
    label: "PO vs Invoice reconciliation completed",
    ok: qtyOk,
    detail: qtyOk
      ? `${input.poInvoiceRecons.length} line(s) reconciled and approved.`
      : input.poInvoiceRecons.length === 0
        ? "PO vs Invoice reconciliation has not run yet."
        : rejected.length > 0
          ? `${rejected.length} reconciliation line(s) rejected by purchasing.`
          : `${openRecons.length} line(s) still pending purchasing review.`,
  });

  // 4 — sales handled every quantity difference against the SO, and no
  // cross-channel shortage is still waiting for management (§20)
  const openSales = input.salesRecons.filter((r) => r.status !== "completed");
  const openShortages = input.openShortageCases ?? [];
  const salesOk = openSales.length === 0 && openShortages.length === 0;
  checks.push({
    id: "sales_recon",
    label: "SO review completed",
    ok: salesOk,
    detail: !salesOk && openShortages.length > 0
      ? `Cross-channel shortage ${openShortages.map((c) => c.caseNumber).join(", ")} is waiting for a management decision.`
      : salesOk
        ? input.salesRecons.length === 0
          ? "No SO difference to review."
          : `${input.salesRecons.length} sales review(s) completed.`
        : `${openSales.length} sales review(s) still open.`,
  });

  // 5 — an allocation exists and is completed for every line
  const byLine = new Map(input.allocations.map((a) => [a.poLineId, a]));
  const missing = input.requiredAllocationLineIds.filter((id) => {
    const allocation = byLine.get(id);
    return !allocation || allocation.status !== "completed";
  });
  const allocationOk = missing.length === 0;
  checks.push({
    id: "allocation",
    label: "Allocation completed or stock clearly assigned",
    ok: allocationOk,
    detail: allocationOk
      ? `${input.requiredAllocationLineIds.length} line(s) allocated to customers or to a named warehouse location.`
      : `${missing.length} line(s) not allocated yet.`,
  });

  // 6 — nothing left over
  const unallocated = input.allocations.reduce(
    (sum, a) => sum + (a.unallocatedQuantity || 0),
    0
  );
  const unallocatedOk = nearlyEqual(unallocated, 0);
  checks.push({
    id: "unallocated",
    label: "Unallocated quantity is zero",
    ok: unallocatedOk,
    detail: unallocatedOk
      ? "Everything received is assigned to a customer or to stock."
      : `UNALLOCATED QUANTITY: ${Math.round(unallocated * 10000) / 10000}.`,
  });

  const firstFail = checks.find((check) => !check.ok);
  return {
    ready: !firstFail,
    checks,
    blockedReason: firstFail ? `${firstFail.label} — ${firstFail.detail}` : null,
  };
}
