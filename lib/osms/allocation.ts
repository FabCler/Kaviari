import { nearlyEqual } from "@/lib/osms/domain";
import { round } from "@/lib/osms/units";

/**
 * Allocation arithmetic (§6). The one invariant the whole warehouse gate
 * hangs on:
 *
 *     allocated to customers + warehouse stock + unallocated = actual
 *
 * and an allocation may only be completed when `unallocated == 0`.
 */

export interface AllocationLineInput {
  target: "customer" | "warehouse";
  quantity: number;
  customerId?: string | null;
  soLineId?: string | null;
  storageLocation?: string | null;
  reason?: string | null;
  responsibleDept?: string | null;
}

export interface AllocationTotals {
  allocatedQuantity: number;
  warehouseQuantity: number;
  unallocatedQuantity: number;
  balanced: boolean;
}

export function totalsFor(
  actualQuantity: number,
  lines: AllocationLineInput[]
): AllocationTotals {
  let allocated = 0;
  let warehouse = 0;
  for (const line of lines) {
    if (line.target === "warehouse") warehouse += line.quantity;
    else allocated += line.quantity;
  }
  allocated = round(allocated);
  warehouse = round(warehouse);
  const unallocated = round(actualQuantity - allocated - warehouse);
  return {
    allocatedQuantity: allocated,
    warehouseQuantity: warehouse,
    unallocatedQuantity: unallocated,
    balanced: nearlyEqual(unallocated, 0),
  };
}

export interface AllocationValidation {
  ok: boolean;
  errors: string[];
  totals: AllocationTotals;
}

/**
 * Rules enforced before an allocation may be saved as completed. Over-
 * allocation is rejected outright; a positive remainder simply keeps the
 * allocation in draft with an UNALLOCATED QUANTITY banner.
 */
export function validateAllocation(
  actualQuantity: number,
  lines: AllocationLineInput[],
  options: { requireBalanced?: boolean } = {}
): AllocationValidation {
  const totals = totalsFor(actualQuantity, lines);
  const errors: string[] = [];

  if (actualQuantity <= 0) {
    errors.push("The actual received quantity must be greater than zero.");
  }
  for (const [index, line] of lines.entries()) {
    const where = `Line ${index + 1}`;
    if (!(line.quantity > 0)) {
      errors.push(`${where}: quantity must be greater than zero.`);
    }
    if (line.target === "customer" && !line.customerId) {
      errors.push(`${where}: choose the customer receiving this quantity.`);
    }
    if (line.target === "warehouse") {
      if (!line.storageLocation) {
        errors.push(`${where}: a storage location is required for stock.`);
      }
      if (!line.reason) {
        errors.push(`${where}: a reason is required for leftover stock.`);
      }
      if (!line.responsibleDept) {
        errors.push(`${where}: name the department responsible for the stock.`);
      }
    }
  }
  if (totals.unallocatedQuantity < 0 && !nearlyEqual(totals.unallocatedQuantity, 0)) {
    errors.push(
      `Over-allocated by ${Math.abs(totals.unallocatedQuantity)} — the allocated quantity cannot exceed the actual quantity.`
    );
  }
  if (options.requireBalanced && !totals.balanced) {
    errors.push(
      `${totals.unallocatedQuantity} still unallocated — allocate everything before completing.`
    );
  }

  return { ok: errors.length === 0, errors, totals };
}

export interface WeighedItem {
  itemNo: string;
  weight: number;
}

/** §6.2 — total actual weight of individually weighed pieces. */
export function totalWeight(items: WeighedItem[]): number {
  return round(items.reduce((sum, item) => sum + (item.weight || 0), 0));
}

export interface ItemAssignment {
  itemNo: string;
  weight: number;
  allocationLineId: string | null;
}

/**
 * Weight-based allocation: every piece must be assigned, and the weight
 * assigned to a customer is compared against the quantity the allocation
 * line promised them.
 */
export function validateItemAssignments(
  items: ItemAssignment[],
  lineQuantities: Map<string, number>,
  tolerance = 0.01,
  /** Customer names by allocation-line id, so an error reads like a sentence. */
  labels?: Map<string, string>
): { ok: boolean; errors: string[]; assignedByLine: Map<string, number> } {
  const errors: string[] = [];
  const assignedByLine = new Map<string, number>();

  const unassigned = items.filter((item) => !item.allocationLineId);
  if (unassigned.length > 0) {
    errors.push(
      `${unassigned.length} item${unassigned.length === 1 ? "" : "s"} not assigned to a customer yet (${unassigned
        .slice(0, 5)
        .map((item) => item.itemNo)
        .join(", ")}${unassigned.length > 5 ? "…" : ""}).`
    );
  }
  for (const item of items) {
    if (!item.allocationLineId) continue;
    assignedByLine.set(
      item.allocationLineId,
      round((assignedByLine.get(item.allocationLineId) ?? 0) + item.weight)
    );
  }
  for (const [lineId, promised] of lineQuantities) {
    const assigned = assignedByLine.get(lineId) ?? 0;
    if (Math.abs(assigned - promised) > tolerance) {
      errors.push(
        `${labels?.get(lineId) ?? `Allocation line ${lineId}`}: ${assigned} assigned by weight vs ${promised} allocated.`
      );
    }
  }
  return { ok: errors.length === 0, errors, assignedByLine };
}
