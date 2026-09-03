import type { PrismaClient } from "@prisma/client";

/**
 * Unit conversion (§11). Every cross-document comparison happens in the
 * product's **inventory unit** — comparing 10 BOX against 100 KG without a
 * factor is the single easiest way to sign off a wrong reconciliation, so
 * `toBaseQuantity` is mandatory on every import path.
 */

export interface ConversionRule {
  fromUnit: string;
  toUnit: string;
  factor: number;
  productId: string | null;
}

export class UnitConversionError extends Error {}

export function normalizeUnit(unit: string | null | undefined): string {
  return (unit ?? "").trim().toUpperCase();
}

function keyOf(productId: string | null, from: string, to: string): string {
  return `${productId ?? "*"}:${normalizeUnit(from)}:${normalizeUnit(to)}`;
}

export function conversionKey(
  productId: string | null,
  from: string,
  to: string
): string {
  return keyOf(productId, from, to);
}

/**
 * In-memory conversion table. Product-specific rules win over global ones,
 * and every rule is usable in both directions.
 */
export class UnitConverter {
  private rules = new Map<string, number>();

  constructor(rules: ConversionRule[] = []) {
    for (const rule of rules) this.add(rule);
  }

  add(rule: ConversionRule): void {
    const from = normalizeUnit(rule.fromUnit);
    const to = normalizeUnit(rule.toUnit);
    if (!from || !to || !(rule.factor > 0)) return;
    this.rules.set(keyOf(rule.productId, from, to), rule.factor);
    this.rules.set(keyOf(rule.productId, to, from), 1 / rule.factor);
  }

  /** Factor to multiply a quantity in `from` by to express it in `to`. */
  factor(productId: string | null, from: string, to: string): number | null {
    const f = normalizeUnit(from);
    const t = normalizeUnit(to);
    if (!f || !t) return null;
    if (f === t) return 1;
    if (productId) {
      const specific = this.rules.get(keyOf(productId, f, t));
      if (specific != null) return specific;
    }
    return this.rules.get(keyOf(null, f, t)) ?? null;
  }

  convert(
    quantity: number,
    from: string,
    to: string,
    productId: string | null = null
  ): number {
    const factor = this.factor(productId, from, to);
    if (factor == null) {
      throw new UnitConversionError(
        `No conversion from ${normalizeUnit(from)} to ${normalizeUnit(to)}${
          productId ? " for this product" : ""
        }. Add it in Master data → Units.`
      );
    }
    return round(quantity * factor);
  }

  /** Same as convert() but returns null instead of throwing. */
  tryConvert(
    quantity: number,
    from: string,
    to: string,
    productId: string | null = null
  ): number | null {
    const factor = this.factor(productId, from, to);
    return factor == null ? null : round(quantity * factor);
  }
}

/** Quantities are stored to 4 decimals; kill float noise at every boundary. */
export function round(value: number, decimals = 4): number {
  const p = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * p) / p;
}

export interface ProductUnitInfo {
  id: string;
  unit: string;
  purchaseUnit: string | null;
  purchaseConversion: number | null;
}

/**
 * Build a converter for a set of products: the global table plus each
 * product's own purchase-unit factor (1 BOX = 10 Tin) and its stored
 * per-product overrides.
 */
export function buildConverter(
  rules: ConversionRule[],
  products: ProductUnitInfo[]
): UnitConverter {
  const converter = new UnitConverter(rules);
  for (const product of products) {
    if (product.purchaseUnit && product.purchaseConversion) {
      converter.add({
        productId: product.id,
        fromUnit: product.purchaseUnit,
        toUnit: product.unit,
        factor: product.purchaseConversion,
      });
    }
  }
  return converter;
}

export async function loadConverter(
  db: Pick<PrismaClient, "scmUnitConversion" | "product">,
  productIds?: string[]
): Promise<UnitConverter> {
  const [rules, products] = await Promise.all([
    db.scmUnitConversion.findMany(),
    db.product.findMany({
      where: productIds ? { id: { in: productIds } } : undefined,
      select: {
        id: true,
        unit: true,
        purchaseUnit: true,
        purchaseConversion: true,
      },
    }),
  ]);
  return buildConverter(
    rules.map((rule) => ({
      productId: rule.productId,
      fromUnit: rule.fromUnit,
      toUnit: rule.toUnit,
      factor: rule.factor,
    })),
    products
  );
}

/** Seed table: the units every food-trading document uses. */
export const BASE_UNITS = [
  { code: "KG", name: "Kilogram", dimension: "weight" },
  { code: "G", name: "Gram", dimension: "weight" },
  { code: "PC", name: "Piece", dimension: "count" },
  { code: "TIN", name: "Tin", dimension: "count" },
  { code: "BOX", name: "Box", dimension: "count" },
  { code: "CARTON", name: "Carton", dimension: "count" },
  { code: "PACK", name: "Pack", dimension: "count" },
  { code: "CASE", name: "Case", dimension: "count" },
  { code: "PK", name: "Pack (legacy)", dimension: "count" },
] as const;

export const BASE_CONVERSIONS: ConversionRule[] = [
  { productId: null, fromUnit: "KG", toUnit: "G", factor: 1000 },
  { productId: null, fromUnit: "CARTON", toUnit: "BOX", factor: 1 },
  { productId: null, fromUnit: "CASE", toUnit: "BOX", factor: 1 },
  { productId: null, fromUnit: "PK", toUnit: "PACK", factor: 1 },
  { productId: null, fromUnit: "TIN", toUnit: "PC", factor: 1 },
];
