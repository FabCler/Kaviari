/**
 * The central status engine (§42).
 *
 * Every demand line (PR line, SO line) and every PO line carries one of these
 * states. The state is *stored* so it can be filtered and indexed, but it is
 * always recomputed from the linked documents by `resolveStatus()` — the
 * documents are the truth, the column is a cache.
 */

/** The happy path, in order. */
export const PIPELINE_STATUSES = [
  "IMPORTED",
  "PENDING_PO",
  "PO_CREATED",
  "PENDING_INVOICE",
  "INVOICE_UPLOADED",
  "PENDING_RECONCILIATION",
  "RECONCILED",
  "PENDING_SALES_REVIEW",
  "SALES_REVIEW_COMPLETED",
  "PENDING_ALLOCATION",
  "ALLOCATION_COMPLETED",
  "READY_TO_RECEIVE",
  "RECEIVED",
  "PARTIALLY_RECEIVED",
  "FULLY_RECEIVED",
  "READY_TO_SHIP",
  "SHIPPED",
  "COMPLETED",
] as const;

/** States a line can drop into from anywhere. */
export const EXCEPTION_STATUSES_ENGINE = [
  "BLOCKED",
  "EXCEPTION",
  "REJECTED",
  "CANCELLED",
] as const;

export const WORKFLOW_STATUSES = [
  ...PIPELINE_STATUSES,
  ...EXCEPTION_STATUSES_ENGINE,
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
  PENDING_RECONCILIATION: "pending",
  RECONCILED: "progress",
  PENDING_SALES_REVIEW: "pending",
  SALES_REVIEW_COMPLETED: "progress",
  PENDING_ALLOCATION: "pending",
  ALLOCATION_COMPLETED: "progress",
  READY_TO_RECEIVE: "progress",
  RECEIVED: "progress",
  PARTIALLY_RECEIVED: "pending",
  FULLY_RECEIVED: "progress",
  READY_TO_SHIP: "progress",
  SHIPPED: "progress",
  COMPLETED: "done",
  BLOCKED: "blocked",
  EXCEPTION: "blocked",
  REJECTED: "blocked",
  CANCELLED: "idle",
};

export const STATUS_LABEL: Record<WorkflowStatus, string> = {
  IMPORTED: "Imported",
  PENDING_PO: "Pending PO",
  PO_CREATED: "PO created",
  PENDING_INVOICE: "Pending invoice",
  INVOICE_UPLOADED: "Invoice uploaded",
  PENDING_RECONCILIATION: "Pending reconciliation",
  RECONCILED: "Reconciled",
  PENDING_SALES_REVIEW: "Pending sales review",
  SALES_REVIEW_COMPLETED: "Sales review completed",
  PENDING_ALLOCATION: "Pending allocation",
  ALLOCATION_COMPLETED: "Allocation completed",
  READY_TO_RECEIVE: "Ready to receive",
  RECEIVED: "Received",
  PARTIALLY_RECEIVED: "Partially received",
  FULLY_RECEIVED: "Fully received",
  READY_TO_SHIP: "Ready to ship",
  SHIPPED: "Shipped",
  COMPLETED: "Completed",
  BLOCKED: "Blocked",
  EXCEPTION: "Exception",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

/** Ordered pipeline used by the progress stepper on document detail pages. */
export const WORKFLOW_STEPS = [
  { key: "demand", label: "SO / PR", statuses: ["IMPORTED", "PENDING_PO"] },
  { key: "po", label: "PO", statuses: ["PO_CREATED", "PENDING_INVOICE"] },
  {
    key: "invoice",
    label: "Invoice",
    statuses: ["INVOICE_UPLOADED", "PENDING_RECONCILIATION"],
  },
  { key: "reconciliation", label: "Reconciliation", statuses: ["RECONCILED"] },
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
    statuses: [
      "READY_TO_RECEIVE",
      "RECEIVED",
      "PARTIALLY_RECEIVED",
      "FULLY_RECEIVED",
    ],
  },
  {
    key: "shipment",
    label: "Shipment",
    statuses: ["READY_TO_SHIP", "SHIPPED", "COMPLETED"],
  },
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
 * Allowed transitions. BLOCKED / EXCEPTION / REJECTED / CANCELLED are
 * reachable from anywhere (a problem can hit at any point); everything else
 * has to walk the pipeline in order — this is what stops a department
 * skipping a step (§21, §43 Rule 3).
 */
const TRANSITIONS: Record<WorkflowStatus, readonly WorkflowStatus[]> = {
  IMPORTED: ["PENDING_PO", "PO_CREATED"],
  PENDING_PO: ["PO_CREATED"],
  PO_CREATED: ["PENDING_INVOICE", "INVOICE_UPLOADED"],
  PENDING_INVOICE: ["INVOICE_UPLOADED"],
  INVOICE_UPLOADED: ["PENDING_RECONCILIATION", "RECONCILED"],
  PENDING_RECONCILIATION: ["RECONCILED"],
  RECONCILED: ["PENDING_SALES_REVIEW", "PENDING_ALLOCATION"],
  PENDING_SALES_REVIEW: ["SALES_REVIEW_COMPLETED"],
  SALES_REVIEW_COMPLETED: ["PENDING_ALLOCATION"],
  PENDING_ALLOCATION: ["ALLOCATION_COMPLETED"],
  ALLOCATION_COMPLETED: ["READY_TO_RECEIVE"],
  READY_TO_RECEIVE: ["RECEIVED", "PARTIALLY_RECEIVED", "FULLY_RECEIVED"],
  RECEIVED: ["PARTIALLY_RECEIVED", "FULLY_RECEIVED"],
  PARTIALLY_RECEIVED: ["RECEIVED", "FULLY_RECEIVED"],
  FULLY_RECEIVED: ["READY_TO_SHIP"],
  READY_TO_SHIP: ["SHIPPED"],
  SHIPPED: ["COMPLETED"],
  COMPLETED: [],
  BLOCKED: [],
  EXCEPTION: [],
  REJECTED: [],
  CANCELLED: [],
};

const OFF_RAMPS: readonly WorkflowStatus[] = [
  "BLOCKED",
  "EXCEPTION",
  "REJECTED",
  "CANCELLED",
];

/** Any state can be interrupted; BLOCKED and EXCEPTION re-enter the pipeline. */
export function canTransition(from: string, to: string): boolean {
  if (!isWorkflowStatus(from) || !isWorkflowStatus(to)) return false;
  if (from === to) return true;
  if (OFF_RAMPS.includes(to)) return true;
  // A rejected or cancelled line is finished; a blocked one is not.
  if (from === "BLOCKED" || from === "EXCEPTION") return true;
  return TRANSITIONS[from].includes(to);
}

export interface PipelineFacts {
  cancelled?: boolean;
  rejected?: boolean;
  blocked?: boolean;
  /** An approval (a shortage decision, an override) is outstanding. */
  exception?: boolean;
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
  /** Some but not all of the ordered quantity has arrived. */
  partiallyReceived: boolean;
  /** Everything expected has arrived. */
  fullyReceived: boolean;
  /** At least one receipt exists. */
  received: boolean;
  readyToShip: boolean;
  shipped: boolean;
  /** Every allocated line has left the warehouse. */
  completed: boolean;
}

/**
 * Single source of the status column. Deriving instead of hand-setting is
 * what keeps the states honest when documents are edited out of order.
 */
export function resolveStatus(facts: PipelineFacts): WorkflowStatus {
  if (facts.cancelled) return "CANCELLED";
  if (facts.rejected) return "REJECTED";
  if (facts.blocked) return "BLOCKED";
  if (facts.exception) return "EXCEPTION";
  if (facts.completed) return "COMPLETED";
  if (facts.shipped) return "SHIPPED";
  if (facts.readyToShip) return "READY_TO_SHIP";
  if (facts.fullyReceived) return "FULLY_RECEIVED";
  if (facts.partiallyReceived) return "PARTIALLY_RECEIVED";
  if (facts.received) return "RECEIVED";
  if (facts.allocationCompleted) return "READY_TO_RECEIVE";
  if (facts.allocationRequired) return "PENDING_ALLOCATION";
  if (facts.salesReviewRequired && !facts.salesReviewDone)
    return "PENDING_SALES_REVIEW";
  if (facts.salesReviewDone) return "SALES_REVIEW_COMPLETED";
  if (facts.poInvoiceOpen) return "PENDING_RECONCILIATION";
  if (facts.poInvoiceApproved) return "RECONCILED";
  if (facts.hasInvoice) return "INVOICE_UPLOADED";
  if (facts.poQuantity <= 0) return "PENDING_PO";
  if (facts.poQuantity < facts.requiredQuantity) return "PENDING_PO";
  return "PENDING_INVOICE";
}
