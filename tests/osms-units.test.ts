import { describe, expect, it } from "vitest";
import {
  BASE_CONVERSIONS,
  UnitConversionError,
  UnitConverter,
  buildConverter,
  normalizeUnit,
} from "@/lib/osms/units";

describe("unit normalisation", () => {
  it("upper-cases and trims", () => {
    expect(normalizeUnit(" kg ")).toBe("KG");
    expect(normalizeUnit(null)).toBe("");
  });
});

describe("unit conversion (§11)", () => {
  const converter = new UnitConverter([
    { productId: null, fromUnit: "KG", toUnit: "G", factor: 1000 },
    { productId: "prod-1", fromUnit: "BOX", toUnit: "TIN", factor: 12 },
  ]);

  it("converts in both directions", () => {
    expect(converter.convert(2, "KG", "G")).toBe(2000);
    expect(converter.convert(500, "G", "KG")).toBe(0.5);
  });

  it("applies a product-specific rule", () => {
    expect(converter.convert(2, "BOX", "TIN", "prod-1")).toBe(24);
  });

  it("does not leak a product rule to another product", () => {
    expect(converter.tryConvert(2, "BOX", "TIN", "prod-2")).toBeNull();
  });

  it("returns the same quantity for identical units", () => {
    expect(converter.convert(7, "KG", "kg")).toBe(7);
  });

  it("throws a message naming the missing pair", () => {
    expect(() => converter.convert(1, "BOX", "KG")).toThrow(UnitConversionError);
    expect(() => converter.convert(1, "BOX", "KG")).toThrow(/BOX to KG/);
  });

  it("prefers a product rule over the global one", () => {
    const mixed = new UnitConverter([
      { productId: null, fromUnit: "BOX", toUnit: "TIN", factor: 10 },
      { productId: "prod-1", fromUnit: "BOX", toUnit: "TIN", factor: 12 },
    ]);
    expect(mixed.convert(1, "BOX", "TIN", "prod-1")).toBe(12);
    expect(mixed.convert(1, "BOX", "TIN", "prod-9")).toBe(10);
  });
});

describe("buildConverter", () => {
  it("derives each product's purchase-unit factor from the master", () => {
    const converter = buildConverter(BASE_CONVERSIONS, [
      {
        id: "prod-1",
        unit: "Tin",
        purchaseUnit: "BOX",
        purchaseConversion: 24,
      },
    ]);
    expect(converter.convert(1, "BOX", "TIN", "prod-1")).toBe(24);
    expect(converter.convert(48, "TIN", "BOX", "prod-1")).toBe(2);
  });

  it("ignores a product with no purchase unit", () => {
    const converter = buildConverter([], [
      { id: "prod-2", unit: "KG", purchaseUnit: null, purchaseConversion: null },
    ]);
    expect(converter.tryConvert(1, "BOX", "KG", "prod-2")).toBeNull();
  });
});
