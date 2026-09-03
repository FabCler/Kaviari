/**
 * The central 17-state workflow of the supply-chain module.
 *
 * Every demand line (PR line, SO line) and every PO line carries one of
 * these states. The state is *stored* so it can be filtered and indexed, but
 * it is always recomputed from the linked documents by `resolveStatus()` —
 * the documents are the truth, the column is a cache.
 */

export const WORKFLOW_STATUSES = [
  "IMPORTED",
  "PENDING_PO",
  "PO_CREATED",
  "PENDING_INVOICE",
  "INVOICE_UPLOADED",
  "PENDING_PO_INVOICE_RECONCILIATION",
  "PO_INVOICE_MATCHED",
  "PENDING_SALES_REVIEW",
  "SALES_REVIEW_COMPLETED",
  "PENDING_ALLOCATION",
  "ALLOCATION_COMPLETED",
  "READY_TO_RECEIVE",
  "RECEIVED",
  "PARTIAL_RECEIVED",
  "COMPLETED",
  "BLOCKED",
  "CANCELLED",
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

/** Visual tone, per the design system: green done, yellow pending, red blocked. */
export type StatusTone = "done" | "pending" | "blocked" | "progress" | "idle";

export const STATUS_TONE: Record<WorkflowStatus, StatusTone> = {
  IMPORTED: "idle",
  PENDING_PO: "pending",
  PO_CREATED: "progress",
  PENDING_INVOICE: "pending",
  INVOICE_UPLOADED: "progress",
  PENDING_PO_INVOICE_RECONCILIATION: "pending",
  PO_INVOICE_MATCHED: "progress",
  PENDING_SALES_REVIEW: "pending",
  SALES_REVIEW_COMPLETED: "progress",
  PENDING_ALLOCATION: "pending",
  ALLOCATION_COMPLETED: "progress",
  READY_TO_RECEIVE: "progress",
  RECEIVED: "progress",
  PARTIAL_RECEIVED: "pending",
  COMPLETED: "done",
  BLOCKED: "blocked",
  CANCELLED: "idle",
};

export const STATUS_LABEL: Record<WorkflowStatus, string> = {
  IMPORTED: "Imported",
  PENDING_PO: "Pending PO",
  PO_CREATED: "PO created",
  PENDING_INVOICE: "Pending invoice",
  INVOICE_UPLOADED: "Invoice uploaded",
  PENDING_PO_INVOICE_RECONCILIATION: "Pending PO/Invoice recon.",
  PO_INVOICE_MATCHED: "PO/Invoice matched",
  PENDING_SALES_REVIEW: "Pending sales review",
  SALES_REVIEW_COMPLETED: "Sales review completed",
  PENDING_ALLOCATION: "Pending allocation",
  ALLOCATION_COMPLETED: "Allocation completed",
  READY_TO_RECEIVE: "Ready to receive",
  RECEIVED: "Received",
  PARTIAL_RECEIVED: "Partially received",
  COMPLETED: "Completed",
  BLOCKED: "Blocked",
  CANCELLED: "Cancelled",
};

/** Ordered pipeline used by the progress stepper on document detail pages. */
export const WORKFLOW_STEPS = [
  { key: "demand", label: "SO / PR", statuses: ["IMPORTED", "PENDING_PO"] },
  { key: "po", label: "PO", statuses: ["PO_CREATED", "PENDING_INVOICE"] },
  {
    key: "invoice",
    label: "Invoice",
    statuses: ["INVOICE_UPLOADED", "PENDING_PO_INVOICE_RECONCILIATION"],
  },
  {
    key: "po_invoice",
    label: "PO vs Invoice",
    statuses: ["PO_INVOICE_MATCHED"],
  },
  {
    key: "sales_review",
    label: "Sales review",
    statuses: ["PENDING_SALES_REVIEW", "SALES_REVIEW_COMPLETED"],
  },
  {
    key: "allocation",
    label: "Allocation",
    statuses: ["PENDING_ALLOCATION", "ALLOCATION_COMPLETED"],
  },
  {
    key: "receiving",
    label: "Receiving",
    statuses: ["READY_TO_RECEIVE", "RECEIVED", "PARTIAL_RECEIVED"],
  },
  { key: "shipment", label: "Shipment", statuses: ["COMPLETED"] },
] as const;

const ORDER = new Map<WorkflowStatus, number>(
  WORKFLOW_STATUSES.map((status, index) => [status, index])
);

export function statusRank(status: string): number {
  return ORDER.get(status as WorkflowStatus) ?? -1;
}

export function isWorkflowStatus(value: string): value is WorkflowStatus {
  return ORDER.has(value as WorkflowStatus);
}

/**
 * Allowed transitions. BLOCKED and CANCELLED are reachable from anywhere
 * (an exception can hit at any point); everything else has to walk the
 * pipeline in order — this is what stops a department skipping a step.
 */
const TRANSITIONS: Record<WorkflowStatus, readonly WorkflowStatus[]> = {
  IMPORTED: ["PENDING_PO", "PO_CREATED"],
  PENDING_PO: ["PO_CREATED"],
  PO_CREATED: ["PENDING_INVOICE", "INVOICE_UPLOADED"],
  PENDING_INVOICE: ["INVOICE_UPLOADED"],
  INVOICE_UPLOADED: ["PENDING_PO_INVOICE_RECONCILIATION"],
  PENDING_PO_INVOICE_RECONCILIATION: ["PO_INVOICE_MATCHED"],
  PO_INVOICE_MATCHED: ["PENDING_SALES_REVIEW", "PENDING_ALLOCATION"],
  PENDING_SALES_REVIEW: ["SALES_REVIEW_COMPLETED"],
  SALES_REVIEW_COMPLETED: ["PENDING_ALLOCATION"],
  PENDING_ALLOCATION: ["ALLOCATION_COMPLETED"],
  ALLOCATION_COMPLETED: ["READY_TO_RECEIVE"],
  READY_TO_RECEIVE: ["RECEIVED", "PARTIAL_RECEIVED"],
  RECEIVED: ["COMPLETED", "PARTIAL_RECEIVED"],
  PARTIAL_RECEIVED: ["RECEIVED", "COMPLETED"],
  COMPLETED: [],
  BLOCKED: [],
  CANCELLED: [],
};

/** Any state can be blocked or cancelled; recovery re-enters the pipeline. */
export function canTransition(from: string, to: string): boolean {
  if (!isWorkflowStatus(from) || !isWorkflowStatus(to)) return false;
  if (from === to) return true;
  if (to === "BLOCKED" || to === "CANCELLED") return true;
  if (from === "BLOCKED") return true;
  return TRANSITIONS[from].includes(to);
}

export interface PipelineFacts {
  cancelled?: boolean;
  blocked?: boolean;
  /** Ordered PO quantity covering the demand (inventory unit). */
  poQuantity: number;
  requiredQuantity: number;
  hasInvoice: boolean;
  /** All PO/invoice reconciliation rows for the line are approved. */
  poInvoiceApproved: boolean;
  /** A quantity/price difference is still waiting for purchasing. */
  poInvoiceOpen: boolean;
  /** Sales has to review because confirmed != SO quantity. */
  salesReviewRequired: boolean;
  salesReviewDone: boolean;
  allocationRequired: boolean;
  allocationCompleted: boolean;
  received: boolean;
  partialReceived: boolean;
  shipped: boolean;
}

/**
 * Single source of the status column. Deriving instead of hand-setting is
 * what keeps the 17 states honest when documents are edited out of order.
 */
export function resolveStatus(facts: PipelineFacts): WorkflowStatus {
  if (facts.cancelled) return "CANCELLED";
  if (facts.blocked) return "BLOCKED";
  if (facts.shipped) return "COMPLETED";
  if (facts.partialReceived) return "PARTIAL_RECEIVED";
  if (facts.received) return "RECEIVED";
  if (facts.allocationCompleted) return "READY_TO_RECEIVE";
  if (facts.allocationRequired) return "PENDING_ALLOCATION";
  if (facts.salesReviewRequired && !facts.salesReviewDone)
    return "PENDING_SALES_REVIEW";
  if (facts.salesReviewDone) return "SALES_REVIEW_COMPLETED";
  if (facts.poInvoiceOpen) return "PENDING_PO_INVOICE_RECONCILIATION";
  if (facts.poInvoiceApproved) return "PO_INVOICE_MATCHED";
  if (facts.hasInvoice) return "INVOICE_UPLOADED";
  if (facts.poQuantity <= 0) return "PENDING_PO";
  if (facts.poQuantity < facts.requiredQuantity) return "PENDING_PO";
  return "PENDING_INVOICE";
}
