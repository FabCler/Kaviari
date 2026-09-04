/**
 * Header mapping for the imported workbooks. Purchasing, Sales and the
 * supplier all send the same data under different captions — English, Thai,
 * or an abbreviation — so every field carries its aliases and the importer
 * matches on a normalised form instead of an exact string.
 */

export type ColumnMap<T extends string> = Record<T, readonly string[]>;

export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[._\-/()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const DEMAND_COLUMNS = {
  deliveryDate: [
    "delivery date",
    "วันที่ส่งสินค้า",
    "วันที่ส่ง",
    "delivery",
    "ship date",
  ],
  productCode: ["product code", "รหัสสินค้า", "item code", "code", "pr code"],
  productNameEn: [
    "product name en",
    "english name",
    "ชื่อสินค้าอังกฤษ",
    "product name",
    "description",
  ],
  productNameTh: ["product name th", "thai name", "ชื่อสินค้าไทย", "ชื่อไทย"],
  inventoryUnit: [
    "inventory unit",
    "stock unit",
    "หน่วยคลัง",
    "unit",
    "หน่วย",
  ],
  quantity: ["quantity", "qty", "จำนวน", "required qty"],
  purchaseUnit: ["purchase unit", "หน่วยซื้อ", "buy unit", "po unit"],
  productType: ["product type", "ประเภทสินค้า", "category", "type"],
  prNumber: ["pr no", "pr number", "เลขเอกสาร pr", "pr doc", "pr"],
  soNumber: ["so no", "so number", "เลขเอกสาร so", "so doc", "so"],
  requester: ["requester", "ชื่อผู้ขอ", "requested by", "ผู้ขอ"],
  poNumber: ["po no", "po number", "เลขเอกสาร po", "po doc", "po"],
} as const satisfies ColumnMap<string>;

export const PO_COLUMNS = {
  poNumber: ["po no", "po number", "เลขเอกสาร po", "po"],
  supplierCode: [
    "supplier code",
    "รหัสซัพ",
    "รหัสซัพพลายเออร์",
    "รหัส supplier",
    "รหัสผู้ขาย",
    "vendor code",
  ],
  supplierName: [
    "supplier name",
    "ชื่อซัพ",
    "ชื่อซัพพลายเออร์",
    "ชื่อ supplier",
    "ชื่อผู้ขาย",
    "vendor",
  ],
  productCode: ["product code", "รหัสสินค้า", "item code", "code"],
  quantity: ["quantity", "qty", "จำนวน"],
  unit: ["unit", "หน่วยสินค้า", "หน่วย", "uom"],
  unitPrice: ["unit price", "ราคาต่อหน่วย", "price"],
  priceUnit: ["price unit", "หน่วยราคา", "per"],
  currency: ["currency", "สกุลเงิน", "ccy"],
  deliveryDate: ["delivery date", "วันที่ส่งสินค้า", "วันที่ส่ง"],
} as const satisfies ColumnMap<string>;

export const SO_COLUMNS = {
  soNumber: ["so no", "so number", "เลขเอกสาร so", "so"],
  customerCode: ["customer code", "รหัสลูกค้า", "cust code"],
  customerName: ["customer name", "ชื่อลูกค้า", "customer"],
  productCode: ["product code", "รหัสสินค้า", "item code", "code"],
  quantity: ["quantity", "qty", "จำนวน"],
  unit: ["unit", "หน่วย", "uom"],
  unitPrice: ["unit price", "ราคาต่อหน่วย", "price"],
  priceUnit: ["price unit", "หน่วยราคา", "per"],
  currency: ["currency", "สกุลเงิน", "ccy"],
  deliveryDate: ["delivery date", "วันที่ส่งสินค้า", "วันที่ส่ง"],
  requester: ["requester", "ชื่อผู้ขอ", "sales owner", "ผู้ขอ"],
} as const satisfies ColumnMap<string>;

/**
 * Resolve header captions to field names. Exact alias first, then a
 * "starts with" pass so "Quantity (KG)" still lands on `quantity`.
 */
export function mapHeaders<T extends string>(
  headers: (string | null)[],
  columns: ColumnMap<T>
): { index: Partial<Record<T, number>>; unmatched: string[] } {
  const index: Partial<Record<T, number>> = {};
  const unmatched: string[] = [];
  const fields = Object.keys(columns) as T[];

  headers.forEach((header, position) => {
    if (!header) return;
    const normalized = normalizeHeader(header);
    let matched: T | null = null;
    for (const field of fields) {
      if (index[field] != null) continue;
      if (columns[field].some((alias) => normalizeHeader(alias) === normalized)) {
        matched = field;
        break;
      }
    }
    if (!matched) {
      for (const field of fields) {
        if (index[field] != null) continue;
        if (
          columns[field].some((alias) =>
            normalized.startsWith(normalizeHeader(alias))
          )
        ) {
          matched = field;
          break;
        }
      }
    }
    if (matched) index[matched] = position;
    else unmatched.push(header);
  });

  return { index, unmatched };
}

/** Missing required columns, reported before a single row is read. */
export function missingColumns<T extends string>(
  index: Partial<Record<T, number>>,
  required: readonly T[]
): T[] {
  return required.filter((field) => index[field] == null);
}
