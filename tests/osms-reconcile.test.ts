import { describe, expect, it } from "vitest";
import {
  comparePoInvoice,
  comparePoSo,
  compareSoConfirmed,
  confirmedQuantity,
  priceStatus,
  qtyStatus,
  variance,
} from "@/lib/osms/reconcile";

describe("variance", () => {
  it("returns the difference and the difference % against the reference", () => {
    expect(variance(500, 600)).toEqual({ diff: 100, diffPct: 20 });
    expect(variance(600, 500)).toEqual({ diff: -100, diffPct: -16.67 });
  });

  it("has no percentage when the reference is zero", () => {
    expect(variance(0, 40)).toEqual({ diff: 40, diffPct: null });
  });
});

describe("PO vs Invoice quantity status", () => {
  it("flags short and over deliveries", () => {
    expect(qtyStatus(36, 30)).toBe("short");
    expect(qtyStatus(36, 40)).toBe("over");
    expect(qtyStatus(36, 36)).toBe("match");
  });

  it("distinguishes a missing invoice line from a line not on the PO", () => {
    expect(qtyStatus(36, null)).toBe("missing_on_invoice");
    expect(qtyStatus(null, 12)).toBe("not_on_po");
  });

  it("treats a difference inside the tolerance as a match", () => {
    // 36 -> 35.5 is -1.39%, inside a 2% tolerance.
    expect(qtyStatus(36, 35.5, 2)).toBe("match");
    expect(qtyStatus(36, 35.5, 1)).toBe("short");
  });
});

describe("PO vs Invoice price status", () => {
  it("reports which side is higher", () => {
    expect(priceStatus(100, 104)).toBe("higher");
    expect(priceStatus(100, 96)).toBe("lower");
    expect(priceStatus(100, 100)).toBe("match");
    expect(priceStatus(100, null)).toBe("missing");
  });
});

describe("comparePoInvoice", () => {
  it("requires review when either quantity or price differs", () => {
    const short = comparePoInvoice({
      poQuantity: 36,
      invoiceQuantity: 30,
      poUnitPrice: 100,
      invoiceUnitPrice: 100,
    });
    expect(short.qtyDiff).toBe(-6);
    expect(short.qtyDiffPct).toBe(-16.67);
    expect(short.qtyStatus).toBe("short");
    expect(short.needsReview).toBe(true);

    const pricier = comparePoInvoice({
      poQuantity: 36,
      invoiceQuantity: 36,
      poUnitPrice: 100,
      invoiceUnitPrice: 104,
    });
    expect(pricier.priceDiff).toBe(4);
    expect(pricier.priceDiffPct).toBe(4);
    expect(pricier.needsReview).toBe(true);
  });

  it("does not require review on a clean match", () => {
    const clean = comparePoInvoice({
      poQuantity: 24,
      invoiceQuantity: 24,
      poUnitPrice: 95.62,
      invoiceUnitPrice: 95.62,
    });
    expect(clean.needsReview).toBe(false);
  });

  it("does not require review for a price the invoice does not print", () => {
    const noPrice = comparePoInvoice({
      poQuantity: 24,
      invoiceQuantity: 24,
      poUnitPrice: 95.62,
      invoiceUnitPrice: null,
    });
    expect(noPrice.priceStatus).toBe("missing");
    expect(noPrice.needsReview).toBe(false);
  });
});

describe("confirmed quantity (§14 — the last confirmed figure wins)", () => {
  it("prefers the corrected quantity over the invoice and the PO", () => {
    // SO 500, PO 600 (MOQ), invoice 580, purchasing confirms 580.
    expect(
      confirmedQuantity({
        poQuantity: 600,
        invoiceQuantity: 580,
        correctedQuantity: 580,
        invoiceVerified: true,
      })
    ).toBe(580);
  });

  it("falls back to the verified invoice, then to the PO", () => {
    expect(
      confirmedQuantity({
        poQuantity: 600,
        invoiceQuantity: 580,
        invoiceVerified: true,
      })
    ).toBe(580);
    expect(
      confirmedQuantity({
        poQuantity: 600,
        invoiceQuantity: 580,
        invoiceVerified: false,
      })
    ).toBe(600);
    expect(confirmedQuantity({ poQuantity: 600 })).toBe(600);
  });
});

describe("Invoice/PO vs SO (§4)", () => {
  it("asks Sales to review a shortfall", () => {
    const result = compareSoConfirmed(500, 450);
    expect(result.diff).toBe(-50);
    expect(result.diffStatus).toBe("short");
    expect(result.needsSalesReview).toBe(true);
  });

  it("asks Sales to place an over-delivery", () => {
    const result = compareSoConfirmed(500, 600);
    expect(result.diff).toBe(100);
    expect(result.diffPct).toBe(20);
    expect(result.diffStatus).toBe("over");
    expect(result.needsSalesReview).toBe(true);
  });

  it("clears a match without a human", () => {
    expect(compareSoConfirmed(500, 500).needsSalesReview).toBe(false);
  });
});

describe("PO vs SO comparison (§5)", () => {
  it("classifies every case the spec lists", () => {
    expect(comparePoSo(500, 500).status).toBe("MATCH");
    expect(comparePoSo(500, 600).status).toBe("PO_GT_SO");
    expect(comparePoSo(500, 400).status).toBe("PO_LT_SO");
    expect(comparePoSo(500, null).status).toBe("NO_PO");
    expect(comparePoSo(null, 300).status).toBe("NO_SO");
  });

  it("uses Difference = PO − SO and Difference % = (PO − SO) / SO × 100", () => {
    const result = comparePoSo(500, 600);
    expect(result.diff).toBe(100);
    expect(result.diffPct).toBe(20);
  });
});
