import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { mapItems, mapLinks, mapRows } from "@/lib/import/columns";
import { readMatrix, sniffKind } from "@/lib/import/read";
import { resolveItem, type ItemIndex } from "@/lib/workspace";

function workbook(rows: (string | number)[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

describe("reading a file", () => {
  it("knows a workbook from a text file", () => {
    expect(sniffKind(workbook([["a"]]), "po.xlsx")).toBe("xlsx");
    expect(sniffKind(new Uint8Array([0x50, 0x4f]), "po.csv")).toBe("text");
    expect(sniffKind(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "invoice.pdf")).toBe("pdf");
  });

  it("reads an Excel export into rows", () => {
    const bytes = workbook([
      ["PO No.", "Vendor Code", "CodeBars", "Quantity", "InventoryUOM"],
      ["26080639", "VO00132", "8412345000018", 20, "KG"],
    ]);
    const matrix = readMatrix(bytes, "po.xlsx");
    expect(matrix[0][0]).toBe("PO No.");
    expect(matrix).toHaveLength(2);
  });
});

describe("column matching", () => {
  it("takes the columns whatever the export called them", () => {
    const matrix = [
      [
        "PO No.",
        "Vendor Code",
        "Vendor Name",
        "CodeBars",
        "ItemCode",
        "Item Name ENG",
        "Quantity",
        "InventoryUOM",
        "Unit Price",
        "Currency",
      ],
      [
        "26080639",
        "VO00132",
        "CULMAREX SAU",
        "8412345000018",
        "8831",
        "Seabream 500-600",
        "20",
        "KG",
        "11.4",
        "EUR",
      ],
    ];
    const [row] = mapRows(matrix, "po");
    expect(row).toMatchObject({
      docNo: "26080639",
      supplierCode: "VO00132",
      barcode: "8412345000018",
      itemCode: "8831",
      qty: 20,
      uom: "KG",
      price: 11.4,
      currency: "EUR",
    });
  });

  it("keeps the decimals a supplier invoice states", () => {
    const [row] = mapRows(
      [
        ["Invoice No.", "Supplier Code", "CodeBars", "Quantity"],
        ["INV-1", "SUP", "BC1", "37.056"],
      ],
      "invoice"
    );
    expect(row.qty).toBe(37.056);
  });

  it("reads the item master and the supplier mapping", () => {
    const items = mapItems([
      ["CodeBars", "ItemCode", "Item Name TH", "Item Name ENG", "InventoryUOM"],
      ["8412345000018", "8831", "ปลากะพงขาว", "Seabream", "KG"],
    ]);
    expect(items[0]).toMatchObject({ barcode: "8412345000018", itemCode: "8831" });

    const links = mapLinks([
      ["Supplier Code", "Supplier Item Name", "CodeBars"],
      ["VO00132", "DORADA 500-600 10K", "8412345000018"],
    ]);
    expect(links[0]).toMatchObject({
      supplierCode: "VO00132",
      supplierItemName: "DORADA 500-600 10K",
      itemRef: "8412345000018",
    });
  });
});

describe("matching a document line to the master", () => {
  const index: ItemIndex = {
    byKey: new Map([
      [
        "8412345000018",
        { barcode: "8412345000018", itemCode: "8831", nameTh: "", nameEn: "Seabream", uom: "KG" },
      ],
      [
        "8831",
        { barcode: "8412345000018", itemCode: "8831", nameTh: "", nameEn: "Seabream", uom: "KG" },
      ],
    ]),
    links: [
      {
        supplierCode: "VO00132",
        supplierItemCode: "",
        supplierItemName: "DORADA 500-600 10K",
        barcode: "8412345000018",
      },
    ],
  };

  it("matches on CodeBars", () => {
    expect(
      resolveItem(index, { barcode: "8412345000018", itemCode: "", itemDesc: "" }, "VO00132")
        .barcode
    ).toBe("8412345000018");
  });

  it("matches on the SAP item code as well", () => {
    expect(
      resolveItem(index, { barcode: "", itemCode: "8831", itemDesc: "" }, "VO00132").barcode
    ).toBe("8412345000018");
  });

  it("matches the supplier's own product name", () => {
    expect(
      resolveItem(
        index,
        { barcode: "", itemCode: "", itemDesc: "DORADA 500-600 10K" },
        "VO00132"
      ).barcode
    ).toBe("8412345000018");
  });

  it("leaves an unknown line unmatched, keeping what the document said", () => {
    const out = resolveItem(
      index,
      { barcode: "", itemCode: "NEW-9", itemDesc: "Something else" },
      "SUP-X"
    );
    expect(out).toEqual({ barcode: "", rawItem: "NEW-9" });
  });
});
