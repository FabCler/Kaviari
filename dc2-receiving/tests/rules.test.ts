import { describe, expect, it } from "vitest";
import {
  aggregate,
  itemKeyOf,
  lineKey,
  type SoRow,
  type Workspace,
} from "@/lib/domain";
import { fmt2, pct, r2, same2 } from "@/lib/format";

/**
 * The rules the desks work to, exactly as the receiving app applies them.
 * These scenarios are the ones the previous single-page version was signed off
 * against, so a change of behaviour here is a change of policy.
 */

type Opts = {
  poQty?: number;
  invQty?: number;
  so?: number[];
  revised?: number[];
  sapUpdated?: boolean[];
  tol?: number;
  poUom?: string;
  invUom?: string;
  poPrice?: number;
  invPrice?: number;
  poCurrency?: string;
  invCurrency?: string;
  variable?: boolean;
  moq?: number;
  freeStock?: number;
  rootCause?: string;
  resolved?: string[];
};

function scenario(o: Opts) {
  const supplier = "SUP";
  const barcode = "BC1";
  const ws: Workspace = {
    shipmentCode: "S1",
    tolerancePct: o.tol ?? 10,
    po:
      o.poQty == null
        ? []
        : [
            {
              id: "p1",
              supplierCode: supplier,
              supplierName: "Supplier",
              itemBarcode: barcode,
              rawItem: "IT1",
              itemDesc: "Test item",
              qty: o.poQty,
              uom: o.poUom ?? "KG",
              price: o.poPrice ?? 10,
              currency: o.poCurrency ?? "EUR",
              moq: o.moq ?? 0,
              variableWeight: o.variable ?? true,
            },
          ],
    invoice:
      o.invQty == null
        ? []
        : [
            {
              id: "i1",
              supplierCode: supplier,
              supplierName: "Supplier",
              itemBarcode: barcode,
              rawItem: "IT1",
              itemDesc: "Test item",
              qty: o.invQty,
              uom: o.invUom ?? o.poUom ?? "KG",
              price: o.invPrice ?? o.poPrice ?? 10,
              currency: o.invCurrency ?? o.poCurrency ?? "EUR",
            },
          ],
    so: (o.so ?? []).map<SoRow>((q, n) => ({
      id: `so${n}`,
      soNo: `SO-${n}`,
      customerCode: `C${n}`,
      customerName: `Customer ${n}`,
      itemBarcode: barcode,
      rawItem: "IT1",
      itemDesc: "Test item",
      qty: q,
      revisedQty: o.revised?.[n] ?? q,
      sapUpdated: o.sapUpdated?.[n] ?? false,
      uom: "KG",
      supplierCode: supplier,
    })),
    items: new Map([
      [
        "BC1",
        { barcode, itemCode: "IT1", nameTh: "", nameEn: "Test item", uom: "KG" },
      ],
    ]),
    lineStates: new Map([
      [
        lineKey(supplier, "BC1"),
        { freeStockQty: o.freeStock ?? 0, rootCause: o.rootCause ?? "" },
      ],
    ]),
    resolutions: new Set(
      (o.resolved ?? []).map((t) => `${lineKey(supplier, "BC1")}|${t}`)
    ),
  };
  const line = aggregate(ws)[0];
  return {
    ...line,
    types: line.unresolved.map((x) => x.type),
    owned: line.unresolved.map((x) => `${x.owner} :: ${x.type}`),
  };
}

describe("two-decimal purchasing comparison", () => {
  it("reads a weight to two decimals", () => {
    expect(same2(37.06, 37.056)).toBe(true);
    expect(same2(37.06, 37.02)).toBe(false);
    expect(r2(-0.004)).toBe(0);
    expect(fmt2(37.056)).toBe("37.06");
    expect(pct(-0.011)).toBe("0.0%");
  });
});

describe("PO against supplier invoice", () => {
  it("PO = invoice raises nothing for Purchasing", () => {
    const r = scenario({ poQty: 100, invQty: 100, so: [100] });
    expect(r.types).not.toContain("PO/invoice qty differs");
    expect(r.status).toBe("READY");
  });

  it("PO ≠ invoice puts the line on Purchase Review", () => {
    const r = scenario({ poQty: 100, invQty: 90, so: [90] });
    expect(r.owned).toContain("Purchasing :: PO/invoice qty differs");
    expect(r.status).toBe("PURCHASE REVIEW");
  });

  it("a sub-cent weight difference is not an exception", () => {
    const r = scenario({ poQty: 37.06, invQty: 37.056, so: [37.06] });
    expect(r.types).not.toContain("PO/invoice qty differs");
    expect(r.status).toBe("READY");
  });

  it("price, currency and unit differences are Purchasing's", () => {
    expect(scenario({ poQty: 100, invQty: 100, so: [100], invPrice: 12 }).owned)
      .toContain("Purchasing :: Price mismatch");
    expect(
      scenario({ poQty: 100, invQty: 100, so: [100], invCurrency: "USD" }).owned
    ).toContain("Purchasing :: Currency mismatch");
    expect(
      scenario({ poQty: 100, invQty: 100, so: [100], invUom: "PC" }).owned
    ).toContain("Purchasing :: UOM conversion required");
  });

  it("a Purchase Review line stays there until Purchasing confirms it", () => {
    const r = scenario({
      poQty: 100,
      invQty: 90,
      so: [90],
      resolved: ["PO/invoice qty differs"],
    });
    expect(r.status).toBe("READY");
  });
});

describe("invoice against customer demand", () => {
  it("a gap beyond tolerance waits for Sales", () => {
    const r = scenario({ poQty: 100, invQty: 100, so: [70], tol: 10 });
    expect(r.owned).toContain("Sales :: SO variance > tolerance");
    expect(r.status).toBe("SALE REVIEW");
  });

  it("a gap within tolerance is Customer Service's to allocate", () => {
    const r = scenario({ poQty: 100, invQty: 100, so: [95], tol: 10 });
    expect(r.types).not.toContain("SO variance > tolerance");
    expect(r.types).toContain("SO adjustment not balanced");
    expect(r.status).toBe("SALE REVIEW");
  });

  it("allocating the whole invoice releases the line", () => {
    const r = scenario({
      poQty: 100,
      invQty: 100,
      so: [60, 40],
      revised: [60, 40],
      tol: 10,
    });
    expect(r.allocationBalance).toBe(0);
    expect(r.status).toBe("READY");
  });

  it("a changed SO line has to be entered in SAP", () => {
    const r = scenario({
      poQty: 100,
      invQty: 100,
      so: [60, 30],
      revised: [60, 40],
      tol: 15,
    });
    expect(r.types).toContain("SAP SO updates pending");
    const done = scenario({
      poQty: 100,
      invQty: 100,
      so: [60, 30],
      revised: [60, 40],
      sapUpdated: [false, true],
      tol: 15,
    });
    expect(done.types).not.toContain("SAP SO updates pending");
    expect(done.status).toBe("READY");
  });

  it("free stock counts towards the allocation and needs Sales", () => {
    const r = scenario({
      poQty: 100,
      invQty: 100,
      so: [90],
      tol: 15,
      freeStock: 10,
    });
    expect(r.allocationBalance).toBe(0);
    expect(r.owned).toContain("Sales :: Free stock approval");
  });
});

describe("an invoice above both the PO and the orders", () => {
  it("asks Purchasing for a root cause", () => {
    const r = scenario({ poQty: 100, invQty: 110, so: [90], tol: 15 });
    expect(r.types).toContain("MOQ excess - select root cause");
    expect(r.status).toBe("PURCHASE REVIEW");
  });

  it("and stops asking once one is recorded", () => {
    const r = scenario({
      poQty: 100,
      invQty: 110,
      so: [90],
      tol: 15,
      rootCause: "Supplier over-shipped",
      resolved: ["PO/invoice qty differs"],
    });
    expect(r.types).not.toContain("MOQ excess - select root cause");
    expect(r.status).toBe("SALE REVIEW");
  });

  it("never asks when the PO and the invoice agree", () => {
    const r = scenario({ poQty: 110, invQty: 110, so: [90], tol: 25 });
    expect(r.types).not.toContain("MOQ excess - select root cause");
  });
});

describe("documents still missing", () => {
  it("holds the line and names what it waits for", () => {
    const noInvoice = scenario({ poQty: 100, so: [100] });
    expect(noInvoice.status).toBe("HOLD");
    expect(noInvoice.missingDocs).toEqual(["Invoice"]);

    const noSo = scenario({ poQty: 100, invQty: 100 });
    expect(noSo.status).toBe("HOLD");
    expect(noSo.missingDocs).toEqual(["SO"]);

    const noPo = scenario({ invQty: 100, so: [100] });
    expect(noPo.status).toBe("HOLD");
    expect(noPo.missingDocs).toEqual(["PO"]);
  });
});

describe("grouping", () => {
  it("groups a document line by its CodeBars", () => {
    expect(itemKeyOf({ itemBarcode: "8412345000018", rawItem: "8831" })).toBe(
      "8412345000018"
    );
    expect(itemKeyOf({ itemBarcode: "", rawItem: "dorada 500" })).toBe(
      "DORADA 500"
    );
  });

  it("keeps two suppliers of the same item apart", () => {
    const ws: Workspace = {
      shipmentCode: "S1",
      tolerancePct: 10,
      po: ["A", "B"].map((s, n) => ({
        id: `p${n}`,
        supplierCode: s,
        supplierName: s,
        itemBarcode: "BC1",
        rawItem: "IT1",
        itemDesc: "x",
        qty: 50,
        uom: "KG",
        price: 10,
        currency: "EUR",
      })),
      invoice: ["A", "B"].map((s, n) => ({
        id: `i${n}`,
        supplierCode: s,
        supplierName: s,
        itemBarcode: "BC1",
        rawItem: "IT1",
        itemDesc: "x",
        qty: 50,
        uom: "KG",
        price: 10,
        currency: "EUR",
      })),
      so: [
        {
          id: "so1",
          soNo: "SO-1",
          customerCode: "C",
          customerName: "C",
          itemBarcode: "BC1",
          rawItem: "IT1",
          itemDesc: "x",
          qty: 50,
          revisedQty: 50,
          sapUpdated: false,
          uom: "KG",
          supplierCode: "",
        },
      ],
      items: new Map(),
      lineStates: new Map(),
      resolutions: new Set(),
    };
    const lines = aggregate(ws);
    expect(lines).toHaveLength(2);
    // nobody said which supplier the customer order belongs to
    expect(lines[0].ambiguousSo).toHaveLength(1);
    expect(lines[0].unresolved.map((i) => i.type)).toContain(
      "SO supplier allocation required"
    );
  });
});
