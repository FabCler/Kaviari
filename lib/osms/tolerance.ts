import { osms } from "@/lib/osms/db";

/**
 * Tolerance master (§28). A difference inside the tolerance is treated as a
 * match and proceeds automatically; anything outside it needs a human.
 *
 * Rules are resolved most-specific-first — supplier, then channel, then
 * product type, then the global default — so a fussy supplier can be held to
 * 0% while the rest of the business runs at 5%.
 */

export type ToleranceScope = "global" | "product_type" | "supplier" | "channel";

export interface Tolerance {
  qtyTolerancePct: number;
  priceTolerancePct: number;
  weightTolerancePct: number;
  /** Which rule produced these numbers — shown next to the comparison. */
  source: string;
}

export const DEFAULT_TOLERANCE: Tolerance = {
  qtyTolerancePct: 0,
  priceTolerancePct: 0,
  weightTolerancePct: 0,
  source: "Default (no rule)",
};

export function toleranceKey(
  scope: ToleranceScope,
  target: string | null | undefined
): string {
  return `${scope}:${target ?? "*"}`;
}

export interface ToleranceContext {
  supplierId?: string | null;
  channelId?: string | null;
  productType?: string | null;
}

/**
 * One in-memory table for a whole board: loading the rules once and resolving
 * per row keeps a 300-line reconciliation screen to a single query.
 */
export class ToleranceResolver {
  private bySupplier = new Map<string, Tolerance>();
  private byChannel = new Map<string, Tolerance>();
  private byProductType = new Map<string, Tolerance>();
  private global: Tolerance = DEFAULT_TOLERANCE;

  constructor(
    rows: {
      scope: string;
      supplierId: string | null;
      channelId: string | null;
      productType: string | null;
      qtyTolerancePct: number;
      priceTolerancePct: number;
      weightTolerancePct: number;
    }[] = []
  ) {
    for (const row of rows) {
      const value: Tolerance = {
        qtyTolerancePct: row.qtyTolerancePct,
        priceTolerancePct: row.priceTolerancePct,
        weightTolerancePct: row.weightTolerancePct,
        source: "",
      };
      if (row.scope === "supplier" && row.supplierId) {
        this.bySupplier.set(row.supplierId, { ...value, source: "Supplier rule" });
      } else if (row.scope === "channel" && row.channelId) {
        this.byChannel.set(row.channelId, { ...value, source: "Channel rule" });
      } else if (row.scope === "product_type" && row.productType) {
        this.byProductType.set(row.productType, {
          ...value,
          source: "Product type rule",
        });
      } else if (row.scope === "global") {
        this.global = { ...value, source: "Global rule" };
      }
    }
  }

  resolve(context: ToleranceContext): Tolerance {
    if (context.supplierId) {
      const rule = this.bySupplier.get(context.supplierId);
      if (rule) return rule;
    }
    if (context.channelId) {
      const rule = this.byChannel.get(context.channelId);
      if (rule) return rule;
    }
    if (context.productType) {
      const rule = this.byProductType.get(context.productType);
      if (rule) return rule;
    }
    return this.global;
  }
}

export async function loadToleranceResolver(): Promise<ToleranceResolver> {
  const rows = await osms.tolerance.findMany({ where: { active: true } });
  return new ToleranceResolver(rows);
}

/** Convenience for a single comparison. */
export async function resolveTolerance(
  context: ToleranceContext
): Promise<Tolerance> {
  const resolver = await loadToleranceResolver();
  return resolver.resolve(context);
}
