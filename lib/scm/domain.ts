/**
 * Vocabulary of the supply-chain module: departments, document statuses,
 * reasons and exception types. SQLite has no enums, so these string unions
 * (mirrored by zod schemas where user input reaches them) are the contract
 * between the database columns, the API and the UI.
 */

export const DEPARTMENTS = [
  "admin",
  "purchasing",
  "sales",
  "warehouse",
  "management",
  "none",
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  admin: "Admin",
  purchasing: "Purchasing",
  sales: "Sales",
  warehouse: "Warehouse",
  management: "Management",
  none: "No department",
};

// ---- document statuses ----------------------------------------------------

export const PR_STATUSES = [
  "open",
  "partially_ordered",
  "ordered",
  "cancelled",
] as const;
export type PrStatus = (typeof PR_STATUSES)[number];

export const SO_STATUSES = [
  "open",
  "partially_shipped",
  "shipped",
  "closed",
  "cancelled",
] as const;
export type SoStatus = (typeof SO_STATUSES)[number];

export const SCM_PO_STATUSES = [
  "draft",
  "issued",
  "confirmed",
  "invoiced",
  "received",
  "closed",
  "cancelled",
] as const;
export type ScmPoStatus = (typeof SCM_PO_STATUSES)[number];

export const INVOICE_STATUSES = [
  "uploaded",
  "processing",
  "extracted",
  "pending_verification",
  "verified",
  "rejected",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  uploaded: "Uploaded",
  processing: "Processing",
  extracted: "Extracted",
  pending_verification: "Pending verification",
  verified: "Verified",
  rejected: "Rejected",
};

export const RECON_STATUSES = [
  "pending_review",
  "purchasing_review",
  "approved",
  "rejected",
] as const;
export type ReconStatus = (typeof RECON_STATUSES)[number];

export const SALES_REVIEW_STATUSES = [
  "pending_sales_review",
  "completed",
  "cancelled",
] as const;
export type SalesReviewStatus = (typeof SALES_REVIEW_STATUSES)[number];

export const RECEIVING_STATUSES = [
  "draft",
  "received",
  "partial_received",
  "completed",
  "blocked",
  "cancelled",
] as const;
export type ReceivingStatus = (typeof RECEIVING_STATUSES)[number];

export const ALLOCATION_STATUSES = ["draft", "completed", "cancelled"] as const;
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

export const SHIPMENT_STATUSES = [
  "draft",
  "picked",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

// ---- reasons --------------------------------------------------------------

/** Why purchasing ordered more than the demand (§2 of the spec). */
export const ORDER_ADJUSTMENT_REASONS = [
  "MOQ",
  "PACK_SIZE",
  "CARTON_SIZE",
  "MIN_ORDER_VALUE",
  "SUPPLIER_REQUIREMENT",
  "SAFETY_STOCK",
  "OTHER",
] as const;
export type OrderAdjustmentReason = (typeof ORDER_ADJUSTMENT_REASONS)[number];

export const ORDER_ADJUSTMENT_LABELS: Record<OrderAdjustmentReason, string> = {
  MOQ: "Minimum order quantity",
  PACK_SIZE: "Supplier pack size",
  CARTON_SIZE: "Carton size",
  MIN_ORDER_VALUE: "Minimum order value",
  SUPPLIER_REQUIREMENT: "Supplier requirement",
  SAFETY_STOCK: "Safety stock",
  OTHER: "Other",
};

/** Why the invoice quantity differs from the PO quantity (§3.1). */
export const QUANTITY_VARIANCE_REASONS = [
  "SUPPLIER_SHORT_SHIPPED",
  "SUPPLIER_OVER_SHIPPED",
  "PACK_SIZE_CHANGED",
  "AVAILABILITY",
  "SUPPLIER_ERROR",
  "PURCHASING_APPROVED",
  "OTHER",
] as const;
export type QuantityVarianceReason = (typeof QUANTITY_VARIANCE_REASONS)[number];

export const QUANTITY_VARIANCE_LABELS: Record<QuantityVarianceReason, string> = {
  SUPPLIER_SHORT_SHIPPED: "Supplier delivered short",
  SUPPLIER_OVER_SHIPPED: "Supplier delivered over",
  PACK_SIZE_CHANGED: "Supplier changed pack size",
  AVAILABILITY: "Shipped to availability",
  SUPPLIER_ERROR: "Supplier error",
  PURCHASING_APPROVED: "Approved by purchasing",
  OTHER: "Other",
};

/** Why the invoice price differs from the PO price (§3.2). */
export const PRICE_VARIANCE_REASONS = [
  "PRICE_LIST_UPDATED",
  "FX_RATE",
  "AGREED_DISCOUNT",
  "SURCHARGE",
  "SUPPLIER_ERROR",
  "OTHER",
] as const;
export type PriceVarianceReason = (typeof PRICE_VARIANCE_REASONS)[number];

export const PRICE_VARIANCE_LABELS: Record<PriceVarianceReason, string> = {
  PRICE_LIST_UPDATED: "Price list updated",
  FX_RATE: "Exchange rate",
  AGREED_DISCOUNT: "Agreed discount",
  SURCHARGE: "Surcharge",
  SUPPLIER_ERROR: "Supplier error",
  OTHER: "Other",
};

/** What Sales decided about a quantity difference (§4.1 / §4.2). */
export const SALES_DECISIONS = [
  "keep_so",
  "reduce_so",
  "increase_customer",
  "warehouse_stock",
  "split",
] as const;
export type SalesDecision = (typeof SALES_DECISIONS)[number];

export const SALES_DECISION_LABELS: Record<SalesDecision, string> = {
  keep_so: "Keep the SO unchanged",
  reduce_so: "Reduce the customer order",
  increase_customer: "Give the extra to the customer",
  warehouse_stock: "Put the extra into warehouse stock",
  split: "Split between customers and stock",
};

// ---- exceptions -----------------------------------------------------------

export const EXCEPTION_TYPES = [
  "SUPPLIER_SHORT",
  "SUPPLIER_OVER",
  "WRONG_PRODUCT",
  "PRICE_MISMATCH",
  "UNIT_MISMATCH",
  "PRODUCT_CODE_UNKNOWN",
  "INVOICE_WITHOUT_PO",
  "PO_WITHOUT_SO",
  "SO_WITHOUT_PO",
  "PARTIAL_DELIVERY",
  "CANCEL_ORDER",
  "CUSTOMER_REJECT",
  "EXCESS_STOCK",
  "MOQ",
  "PACK_SIZE",
  "WEIGHT_BASED_PRODUCT",
  "MULTI_CUSTOMER_ALLOCATION",
  "DUPLICATE_DOCUMENT",
  "INVALID_DATE",
  "OTHER",
] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

export const EXCEPTION_LABELS: Record<ExceptionType, string> = {
  SUPPLIER_SHORT: "Supplier delivered short",
  SUPPLIER_OVER: "Supplier delivered over",
  WRONG_PRODUCT: "Wrong product delivered",
  PRICE_MISMATCH: "Price mismatch",
  UNIT_MISMATCH: "Unit mismatch",
  PRODUCT_CODE_UNKNOWN: "Unknown product code",
  INVOICE_WITHOUT_PO: "Invoice without PO",
  PO_WITHOUT_SO: "PO without SO",
  SO_WITHOUT_PO: "SO without PO",
  PARTIAL_DELIVERY: "Partial delivery",
  CANCEL_ORDER: "Cancelled order",
  CUSTOMER_REJECT: "Customer rejected",
  EXCESS_STOCK: "Excess stock",
  MOQ: "Minimum order quantity",
  PACK_SIZE: "Pack size",
  WEIGHT_BASED_PRODUCT: "Weight-based product",
  MULTI_CUSTOMER_ALLOCATION: "Multi-customer allocation",
  DUPLICATE_DOCUMENT: "Duplicate document",
  INVALID_DATE: "Invalid date",
  OTHER: "Other",
};

export const EXCEPTION_SEVERITIES = ["low", "medium", "high"] as const;
export type ExceptionSeverity = (typeof EXCEPTION_SEVERITIES)[number];

export const EXCEPTION_STATUSES = [
  "open",
  "in_progress",
  "resolved",
  "cancelled",
] as const;
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

// ---- comparison outcomes --------------------------------------------------

export const COMPARISON_STATUSES = [
  "MATCH",
  "PO_GT_SO",
  "PO_LT_SO",
  "NO_PO",
  "NO_SO",
] as const;
export type ComparisonStatus = (typeof COMPARISON_STATUSES)[number];

export const COMPARISON_LABELS: Record<ComparisonStatus, string> = {
  MATCH: "Match",
  PO_GT_SO: "PO > SO",
  PO_LT_SO: "PO < SO",
  NO_PO: "No PO",
  NO_SO: "No SO",
};

export const ALLOCATION_TARGETS = ["customer", "warehouse"] as const;
export type AllocationTarget = (typeof ALLOCATION_TARGETS)[number];

/**
 * Quantity/price differences below this are treated as rounding, not a
 * variance. Overridable by admins in Settings (`scmQtyTolerancePct`,
 * `scmPriceTolerancePct`).
 */
export const DEFAULT_QTY_TOLERANCE_PCT = 0;
export const DEFAULT_PRICE_TOLERANCE_PCT = 0;

/** Floats: quantities are money-adjacent, so compare with an epsilon. */
export const QTY_EPSILON = 0.0001;

export function nearlyEqual(a: number, b: number, epsilon = QTY_EPSILON) {
  return Math.abs(a - b) <= epsilon;
}
