/**
 * SAP exports arrive with whatever column titles the query happened to use, so
 * the importer matches headers by name rather than by position. Every alias
 * here has been seen on a real Thammachart / supplier export.
 */

import { norm, num } from "@/lib/format";

export const ALIASES: Record<string, string[]> = {
  poNo: ["po no.", "po no", "purchase order", "po number", "document no."],
  invoiceNo: ["invoice no.", "invoice no", "invoice number", "ap invoice", "invoice"],
  soNo: ["so no.", "so no", "sales order", "sales order no", "sonumber"],
  deliveryDate: ["delivery date", "due date", "ship date", "posting date"],
  supplierCode: ["vendor code", "supplier code", "cardcode", "supplier", "vendor"],
  supplierName: ["vendor name", "supplier name", "cardname"],
  customerCode: ["customer code", "cardcode", "customer"],
  customerName: ["customer name", "cardname"],
  barcode: ["codebars", "code bars", "barcode", "bar code", "ean", "gtin"],
  itemCode: ["itemcode", "item code", "sku", "pr code", "product code"],
  itemDesc: [
    "item name eng",
    "item name en",
    "item description",
    "description",
    "dscription",
    "product",
  ],
  itemDescTh: ["item name th", "item name thai", "ชื่อสินค้า"],
  supplierItemCode: ["supplier item code", "vendor item code", "supplier sku"],
  supplierItemName: ["supplier item name", "vendor item name", "supplier product"],
  supplierUom: ["supplier uom", "supplier unit"],
  qty: ["quantity", "qty", "ordered qty", "invoice qty", "open qty"],
  uom: ["inventoryuom", "inventory uom", "uom", "unit", "unit of measure"],
  price: ["unit price", "price after discount", "price", "price before discount"],
  currency: ["currency", "curr"],
  moq: ["moq", "carton qty", "carton quantity", "pack qty"],
  variableWeight: ["variable weight", "weight item", "variable weight flag"],
  nameTh: ["item name th", "item name thai", "ชื่อสินค้า"],
  nameEn: ["item name eng", "item name en", "item name", "description"],
};

export type Matrix = (string | number | null | undefined)[][];

export type DocKind = "po" | "invoice" | "so";

export type ParsedRow = {
  barcode: string;
  itemCode: string;
  itemDesc: string;
  qty: number;
  uom: string;
  price: number;
  currency: string;
  docNo: string;
  supplierCode: string;
  supplierName: string;
  customerCode: string;
  customerName: string;
  moq: number;
  variableWeight: boolean;
};

const truth = (v: unknown): boolean =>
  /^(y|yes|true|1|variable)$/i.test(norm(v));

function findCol(headers: string[], names: string[]): number {
  const h = headers.map((x) => norm(x).toLowerCase());
  for (const n of names) {
    const i = h.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

/** A row is usable when it names an item and (for documents) a quantity. */
export function mapRows(matrix: Matrix, kind: DocKind): ParsedRow[] {
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((c) => norm(c));
  const col: Record<string, number> = {};
  for (const [k, a] of Object.entries(ALIASES)) col[k] = findCol(headers, a);
  const get = (row: Matrix[number], k: string) =>
    col[k] >= 0 ? row[col[k]] : "";

  return matrix
    .slice(1)
    .map((row) => ({
      barcode: norm(get(row, "barcode")),
      itemCode: norm(get(row, "itemCode")),
      itemDesc: norm(get(row, "itemDesc")) || norm(get(row, "itemDescTh")),
      qty: num(get(row, "qty")),
      uom: norm(get(row, "uom")),
      price: num(get(row, "price")),
      currency: norm(get(row, "currency")),
      docNo: norm(
        get(row, kind === "po" ? "poNo" : kind === "invoice" ? "invoiceNo" : "soNo")
      ),
      supplierCode: norm(get(row, "supplierCode")),
      supplierName: norm(get(row, "supplierName")),
      customerCode: norm(get(row, "customerCode")),
      customerName: norm(get(row, "customerName")),
      moq: num(get(row, "moq")),
      variableWeight: truth(get(row, "variableWeight")),
    }))
    .filter((r) => r.barcode || r.itemCode || r.itemDesc);
}

/** Item master rows: identity only, no document fields. */
export type ParsedItem = {
  barcode: string;
  itemCode: string;
  nameTh: string;
  nameEn: string;
  uom: string;
};

export function mapItems(matrix: Matrix): ParsedItem[] {
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((c) => norm(c));
  const col = {
    barcode: findCol(headers, ALIASES.barcode),
    itemCode: findCol(headers, ALIASES.itemCode),
    nameTh: findCol(headers, ALIASES.itemDescTh),
    nameEn: findCol(headers, ALIASES.nameEn),
    uom: findCol(headers, ALIASES.uom),
  };
  const get = (row: Matrix[number], i: number) => (i >= 0 ? norm(row[i]) : "");
  return matrix
    .slice(1)
    .map((row) => ({
      barcode: get(row, col.barcode) || get(row, col.itemCode),
      itemCode: get(row, col.itemCode),
      nameTh: get(row, col.nameTh),
      nameEn: get(row, col.nameEn),
      uom: get(row, col.uom) || "KG",
    }))
    .filter((r) => r.barcode);
}

export type ParsedLink = {
  supplierCode: string;
  supplierItemCode: string;
  supplierItemName: string;
  supplierUom: string;
  itemRef: string;
};

export function mapLinks(matrix: Matrix): ParsedLink[] {
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((c) => norm(c));
  const col = {
    supplierCode: findCol(headers, ALIASES.supplierCode),
    supplierItemCode: findCol(headers, ALIASES.supplierItemCode),
    supplierItemName: findCol(headers, ALIASES.supplierItemName),
    supplierUom: findCol(headers, ALIASES.supplierUom),
    barcode: findCol(headers, ALIASES.barcode),
    itemCode: findCol(headers, ALIASES.itemCode),
  };
  const get = (row: Matrix[number], i: number) => (i >= 0 ? norm(row[i]) : "");
  return matrix
    .slice(1)
    .map((row) => ({
      supplierCode: get(row, col.supplierCode),
      supplierItemCode: get(row, col.supplierItemCode),
      supplierItemName: get(row, col.supplierItemName),
      supplierUom: get(row, col.supplierUom),
      itemRef: get(row, col.barcode) || get(row, col.itemCode),
    }))
    .filter((r) => r.itemRef && (r.supplierItemCode || r.supplierItemName));
}
