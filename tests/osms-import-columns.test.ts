import { describe, expect, it } from "vitest";
import {
  DEMAND_COLUMNS,
  PO_COLUMNS,
  SO_COLUMNS,
  mapHeaders,
  missingColumns,
} from "@/lib/osms/import/columns";

/**
 * §1 — purchasing, sales and the supplier each caption the same field their
 * own way. The importer has to accept the words the business actually types,
 * not only the ones a developer thought of.
 */
describe("import header matching", () => {
  it("accepts the supplier captions the spec itself uses", () => {
    // §1.2 is written as "เลขเอกสารPO รหัสซัพ ชื่อซัพ จำนวน ..." — the file the
    // purchasing team exports says รหัสซัพ, and it used to be rejected.
    const headers = [
      "เลขเอกสาร PO",
      "รหัสซัพ",
      "ชื่อซัพ",
      "รหัสสินค้า",
      "จำนวน",
      "หน่วยสินค้า",
      "ราคาต่อหน่วย",
      "หน่วยราคา",
      "วันที่ส่งสินค้า",
    ];
    const { index } = mapHeaders(headers, PO_COLUMNS);
    expect(index.supplierCode).toBe(1);
    expect(index.supplierName).toBe(2);
    expect(
      missingColumns(index, ["poNumber", "supplierCode", "productCode", "quantity", "deliveryDate"])
    ).toEqual([]);
  });

  it("still accepts the English and the other Thai spellings", () => {
    expect(mapHeaders(["Supplier Code"], PO_COLUMNS).index.supplierCode).toBe(0);
    expect(mapHeaders(["รหัสผู้ขาย"], PO_COLUMNS).index.supplierCode).toBe(0);
    expect(mapHeaders(["รหัสซัพพลายเออร์"], PO_COLUMNS).index.supplierCode).toBe(0);
  });

  it("maps a demand sheet captioned exactly as the spec lists it", () => {
    const headers = [
      "วันที่ส่งสินค้า", "รหัสสินค้า", "ชื่อสินค้าอังกฤษ", "ชื่อไทย", "หน่วยคลัง",
      "จำนวน", "หน่วยซื้อ", "ประเภทสินค้า", "เลขเอกสาร PR", "เลขเอกสาร SO",
      "ชื่อผู้ขอ", "เลขเอกสาร PO",
    ];
    const { index } = mapHeaders(headers, DEMAND_COLUMNS);
    expect(missingColumns(index, ["productCode", "quantity", "deliveryDate"])).toEqual([]);
    expect(index.prNumber).toBe(8);
    expect(index.soNumber).toBe(9);
    expect(index.poNumber).toBe(11);
  });

  it("maps a sales sheet captioned exactly as the spec lists it", () => {
    const headers = [
      "เลขเอกสาร SO", "รหัสลูกค้า", "ชื่อลูกค้า", "จำนวน", "หน่วยสินค้า",
      "ราคาต่อหน่วย", "หน่วยราคา", "วันที่ส่งสินค้า", "ชื่อผู้ขอ", "รหัสสินค้า",
    ];
    const { index } = mapHeaders(headers, SO_COLUMNS);
    expect(
      missingColumns(index, ["soNumber", "customerCode", "productCode", "quantity", "deliveryDate"])
    ).toEqual([]);
  });

  it("names what is missing rather than failing silently", () => {
    const { index } = mapHeaders(["รหัสสินค้า", "จำนวน"], PO_COLUMNS);
    expect(missingColumns(index, ["poNumber", "supplierCode", "deliveryDate"])).toEqual([
      "poNumber",
      "supplierCode",
      "deliveryDate",
    ]);
  });
});
