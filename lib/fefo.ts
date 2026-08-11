/**
 * FEFO — first-expired-first-out lot allocation.
 * Caviar is perishable: consumption is always drawn from the lot whose
 * DLC (expiry) is soonest.
 */

export interface AllocatableLot {
  id: string;
  quantityTins: number;
  expiryDate: Date;
}

export interface LotAllocation {
  lotId: string;
  tins: number;
}

export interface FefoResult {
  allocations: LotAllocation[];
  /** Tins that could not be satisfied from the given lots. */
  shortfallTins: number;
}

export function allocateFefo(
  lots: AllocatableLot[],
  tinsNeeded: number
): FefoResult {
  if (tinsNeeded <= 0) return { allocations: [], shortfallTins: 0 };

  const sorted = [...lots]
    .filter((lot) => lot.quantityTins > 0)
    .sort(
      (a, b) =>
        a.expiryDate.getTime() - b.expiryDate.getTime() ||
        a.id.localeCompare(b.id)
    );

  const allocations: LotAllocation[] = [];
  let remaining = tinsNeeded;
  for (const lot of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(lot.quantityTins, remaining);
    allocations.push({ lotId: lot.id, tins: take });
    remaining -= take;
  }
  return { allocations, shortfallTins: Math.max(0, remaining) };
}
