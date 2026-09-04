import { osms } from "@/lib/osms/db";
import { loadConverter, normalizeUnit, round } from "@/lib/osms/units";
import { parseImportDate, parseNumber, type RowSet } from "@/lib/osms/import/rows";
import type { DEMAND_COLUMNS, PO_COLUMNS, SO_COLUMNS } from "@/lib/osms/import/columns";

/**
 * Import validation (§1.1). Rows are checked before anything is written, and
 * the result is shown for confirmation — an import either goes in clean or
 * not at all. Errors block a row; warnings let it through and raise an
 * exception so the responsible department picks it up.
 */

export type IssueSeverity = "error" | "warning";

export interface RowIssue {
  code: string;
  severity: IssueSeverity;
  field?: string;
  message: string;
}

export interface PreparedRow<T> {
  rowNumber: number;
  raw: Record<string, string>;
  data: T | null;
  issues: RowIssue[];
}

export interface PreparedImport<T> {
  rows: PreparedRow<T>[];
  okCount: number;
  errorCount: number;
  warningCount: number;
  missingColumns: string[];
  unmatchedHeaders: string[];
  notices: string[];
}

type DemandField = keyof typeof DEMAND_COLUMNS;
type PoField = keyof typeof PO_COLUMNS;
type SoField = keyof typeof SO_COLUMNS;

export interface DemandRowData {
  deliveryDate: Date;
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  baseQuantity: number;
  purchaseUnit: string | null;
  prNumber: string | null;
  soNumber: string | null;
  poNumber: string | null;
  requester: string | null;
}

function summarize<T>(rows: PreparedRow<T>[]): PreparedImport<T> {
  const errorCount = rows.filter((row) =>
    row.issues.some((issue) => issue.severity === "error")
  ).length;
  const warningCount = rows.filter(
    (row) =>
      !row.issues.some((issue) => issue.severity === "error") &&
      row.issues.length > 0
  ).length;
  return {
    rows,
    okCount: rows.length - errorCount,
    errorCount,
    warningCount,
    missingColumns: [],
    unmatchedHeaders: [],
    notices: [],
  };
}

function withHeaderIssues<T>(
  result: PreparedImport<T>,
  set: RowSet<string>
): PreparedImport<T> {
  return {
    ...result,
    missingColumns: set.missing,
    unmatchedHeaders: set.unmatchedHeaders,
    notices: set.notices,
  };
}

/** §1.1 — the purchasing demand file (PR/SO lines with their PO number). */
export async function validateDemandRows(
  set: RowSet<DemandField>
): Promise<PreparedImport<DemandRowData>> {
  const codes = [
    ...new Set(
      set.rows
        .map((row) => row.values.productCode?.trim().toUpperCase())
        .filter((code): code is string => Boolean(code))
    ),
  ];
  const products = await osms.product.findMany({
    where: { code: { in: codes } },
  });
  const byCode = new Map(products.map((p) => [p.code.toUpperCase(), p]));
  const converter = await loadConverter(osms, products.map((p) => p.id));

  const [existingPrs, existingSos, existingPos] = await Promise.all([
    osms.purchaseRequest.findMany({ select: { prNumber: true } }),
    osms.salesOrder.findMany({ select: { soNumber: true } }),
    osms.purchaseOrder.findMany({ select: { poNumber: true } }),
  ]);
  const knownPrs = new Set(existingPrs.map((r) => r.prNumber.toUpperCase()));
  const knownSos = new Set(existingSos.map((r) => r.soNumber.toUpperCase()));
  const knownPos = new Set(existingPos.map((r) => r.poNumber.toUpperCase()));

  const seen = new Set<string>();
  const prepared: PreparedRow<DemandRowData>[] = [];

  for (const row of set.rows) {
    const issues: RowIssue[] = [];
    const values = row.values;
    const raw = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value != null)
    ) as Record<string, string>;

    const productCode = values.productCode?.trim().toUpperCase() ?? "";
    const product = productCode ? byCode.get(productCode) : undefined;
    if (!productCode) {
      issues.push({
        code: "PRODUCT_CODE_MISSING",
        severity: "error",
        field: "productCode",
        message: "No product code on this row.",
      });
    } else if (!product) {
      issues.push({
        code: "PRODUCT_CODE_UNKNOWN",
        severity: "error",
        field: "productCode",
        message: `Product code ${productCode} is not in the product master.`,
      });
    }

    const quantity = parseNumber(values.quantity);
    if (quantity == null) {
      issues.push({
        code: "QUANTITY_MISSING",
        severity: "error",
        field: "quantity",
        message: "Quantity is missing or not a number.",
      });
    } else if (quantity <= 0) {
      issues.push({
        code: "QUANTITY_INVALID",
        severity: "error",
        field: "quantity",
        message: `Quantity ${quantity} must be greater than zero.`,
      });
    }

    const deliveryDate = parseImportDate(values.deliveryDate);
    if (!deliveryDate) {
      issues.push({
        code: "INVALID_DATE",
        severity: "error",
        field: "deliveryDate",
        message: `"${values.deliveryDate ?? ""}" is not a valid delivery date.`,
      });
    }

    const fileUnit = normalizeUnit(values.inventoryUnit ?? product?.unit);
    let baseQuantity = quantity ?? 0;
    if (product && quantity != null) {
      const masterUnit = normalizeUnit(product.unit);
      if (fileUnit && fileUnit !== masterUnit) {
        const converted = converter.tryConvert(
          quantity,
          fileUnit,
          masterUnit,
          product.id
        );
        if (converted == null) {
          issues.push({
            code: "UNIT_MISMATCH",
            severity: "error",
            field: "inventoryUnit",
            message: `Unit ${fileUnit} does not match the master unit ${masterUnit} and no conversion exists.`,
          });
        } else {
          baseQuantity = converted;
          issues.push({
            code: "UNIT_CONVERTED",
            severity: "warning",
            field: "inventoryUnit",
            message: `${quantity} ${fileUnit} converted to ${converted} ${masterUnit}.`,
          });
        }
      } else {
        baseQuantity = round(quantity);
      }
    }

    const prNumber = values.prNumber?.trim() || null;
    const soNumber = values.soNumber?.trim() || null;
    const poNumber = values.poNumber?.trim() || null;

    if (!prNumber && !soNumber && !poNumber) {
      issues.push({
        code: "NO_DOCUMENT",
        severity: "error",
        message: "The row has no PR, SO or PO number — nothing to attach it to.",
      });
    }
    if (poNumber && !prNumber && !soNumber) {
      issues.push({
        code: "PO_WITHOUT_DEMAND",
        severity: "warning",
        message: `PO ${poNumber} has no PR or SO on this row.`,
      });
    }
    if (!poNumber && (prNumber || soNumber)) {
      issues.push({
        code: "DEMAND_WITHOUT_PO",
        severity: "warning",
        message: "No PO yet — the line goes to Purchasing → Order management.",
      });
    }
    if (prNumber && knownPrs.has(prNumber.toUpperCase())) {
      issues.push({
        code: "DUPLICATE_PR",
        severity: "warning",
        field: "prNumber",
        message: `PR ${prNumber} already exists — the line will be added to it.`,
      });
    }
    if (soNumber && knownSos.has(soNumber.toUpperCase())) {
      issues.push({
        code: "DUPLICATE_SO",
        severity: "warning",
        field: "soNumber",
        message: `SO ${soNumber} already exists — the line will be added to it.`,
      });
    }
    if (poNumber && knownPos.has(poNumber.toUpperCase())) {
      issues.push({
        code: "DUPLICATE_PO",
        severity: "warning",
        field: "poNumber",
        message: `PO ${poNumber} already exists — the line will be linked to it.`,
      });
    }

    // Same product on the same PR/SO/PO for the same day, twice in one file.
    const dedupeKey = [
      prNumber ?? "",
      soNumber ?? "",
      poNumber ?? "",
      productCode,
      values.deliveryDate ?? "",
    ].join("|");
    if (seen.has(dedupeKey)) {
      issues.push({
        code: "DUPLICATE_ROW",
        severity: "error",
        message:
          "This exact PR/SO/PO + product + delivery date already appears earlier in the file.",
      });
    }
    seen.add(dedupeKey);

    const blocked = issues.some((issue) => issue.severity === "error");
    prepared.push({
      rowNumber: row.rowNumber,
      raw,
      issues,
      data:
        blocked || !product || quantity == null || !deliveryDate
          ? null
          : {
              deliveryDate,
              productId: product.id,
              productCode: product.code,
              productName: product.name,
              quantity,
              unit: fileUnit || normalizeUnit(product.unit),
              baseQuantity,
              purchaseUnit: values.purchaseUnit?.trim().toUpperCase() ?? null,
              prNumber,
              soNumber,
              poNumber,
              requester: values.requester?.trim() ?? null,
            },
    });
  }

  return withHeaderIssues(summarize(prepared), set as RowSet<string>);
}

export interface PoRowData {
  poNumber: string;
  supplierCode: string;
  supplierName: string | null;
  productId: string;
  productCode: string;
  quantity: number;
  unit: string;
  baseQuantity: number;
  unitPrice: number;
  priceUnit: string | null;
  currency: string;
  deliveryDate: Date;
}

/** §1.2 — the purchase-order file. */
export async function validatePoRows(
  set: RowSet<PoField>
): Promise<PreparedImport<PoRowData>> {
  const codes = [
    ...new Set(
      set.rows
        .map((row) => row.values.productCode?.trim().toUpperCase())
        .filter((code): code is string => Boolean(code))
    ),
  ];
  const [products, suppliers] = await Promise.all([
    osms.product.findMany({ where: { code: { in: codes } } }),
    osms.supplier.findMany(),
  ]);
  const byCode = new Map(products.map((p) => [p.code.toUpperCase(), p]));
  const bySupplierCode = new Map(
    suppliers.map((s) => [s.code.toUpperCase(), s])
  );
  const converter = await loadConverter(osms, products.map((p) => p.id));

  const seen = new Set<string>();
  const prepared: PreparedRow<PoRowData>[] = [];

  for (const row of set.rows) {
    const issues: RowIssue[] = [];
    const values = row.values;
    const raw = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value != null)
    ) as Record<string, string>;

    const poNumber = values.poNumber?.trim() ?? "";
    if (!poNumber) {
      issues.push({
        code: "PO_NUMBER_MISSING",
        severity: "error",
        field: "poNumber",
        message: "A PO number is required — it is the primary reference.",
      });
    }

    const supplierCode = values.supplierCode?.trim().toUpperCase() ?? "";
    const supplier = supplierCode ? bySupplierCode.get(supplierCode) : undefined;
    if (!supplierCode) {
      issues.push({
        code: "SUPPLIER_MISSING",
        severity: "error",
        field: "supplierCode",
        message: "A supplier code is required.",
      });
    } else if (!supplier) {
      issues.push({
        code: "SUPPLIER_UNKNOWN",
        severity: "warning",
        field: "supplierCode",
        message: `Supplier ${supplierCode} is new — it will be created in the supplier master.`,
      });
    }

    const productCode = values.productCode?.trim().toUpperCase() ?? "";
    const product = productCode ? byCode.get(productCode) : undefined;
    if (!product) {
      issues.push({
        code: "PRODUCT_CODE_UNKNOWN",
        severity: "error",
        field: "productCode",
        message: `Product code ${productCode || "(blank)"} is not in the product master.`,
      });
    }

    const quantity = parseNumber(values.quantity);
    if (quantity == null || quantity <= 0) {
      issues.push({
        code: "QUANTITY_INVALID",
        severity: "error",
        field: "quantity",
        message: "Quantity must be a number greater than zero.",
      });
    }

    const deliveryDate = parseImportDate(values.deliveryDate);
    if (!deliveryDate) {
      issues.push({
        code: "INVALID_DATE",
        severity: "error",
        field: "deliveryDate",
        message: "The delivery date is missing or invalid.",
      });
    }

    const unit = normalizeUnit(values.unit ?? product?.purchaseUnit ?? product?.unit);
    let baseQuantity = quantity ?? 0;
    if (product && quantity != null) {
      const masterUnit = normalizeUnit(product.unit);
      if (unit && unit !== masterUnit) {
        const converted = converter.tryConvert(quantity, unit, masterUnit, product.id);
        if (converted == null) {
          issues.push({
            code: "UNIT_MISMATCH",
            severity: "error",
            field: "unit",
            message: `No conversion from ${unit} to the stock unit ${masterUnit}.`,
          });
        } else {
          baseQuantity = converted;
        }
      } else {
        baseQuantity = round(quantity);
      }
    }

    const unitPrice = parseNumber(values.unitPrice) ?? 0;
    if (unitPrice < 0) {
      issues.push({
        code: "PRICE_INVALID",
        severity: "error",
        field: "unitPrice",
        message: "The unit price cannot be negative.",
      });
    }

    const dedupeKey = `${poNumber}|${productCode}|${values.deliveryDate ?? ""}`;
    if (seen.has(dedupeKey)) {
      issues.push({
        code: "DUPLICATE_ROW",
        severity: "warning",
        message:
          "Same PO, product and date as an earlier row — both lines are kept.",
      });
    }
    seen.add(dedupeKey);

    const blocked = issues.some((issue) => issue.severity === "error");
    prepared.push({
      rowNumber: row.rowNumber,
      raw,
      issues,
      data:
        blocked || !product || quantity == null || !deliveryDate
          ? null
          : {
              poNumber,
              supplierCode,
              supplierName: values.supplierName?.trim() ?? null,
              productId: product.id,
              productCode: product.code,
              quantity,
              unit: unit || normalizeUnit(product.unit),
              baseQuantity,
              unitPrice,
              priceUnit: values.priceUnit?.trim().toUpperCase() ?? null,
              currency: (values.currency?.trim().toUpperCase() ||
                supplier?.currency ||
                "EUR") as string,
              deliveryDate,
            },
    });
  }

  return withHeaderIssues(summarize(prepared), set as RowSet<string>);
}

export interface SoRowData {
  soNumber: string;
  customerCode: string;
  customerName: string | null;
  productId: string;
  productCode: string;
  quantity: number;
  unit: string;
  baseQuantity: number;
  unitPrice: number;
  priceUnit: string | null;
  currency: string;
  deliveryDate: Date;
  requester: string | null;
}

/** §1.4 — the sales-order file. */
export async function validateSoRows(
  set: RowSet<SoField>
): Promise<PreparedImport<SoRowData>> {
  const codes = [
    ...new Set(
      set.rows
        .map((row) => row.values.productCode?.trim().toUpperCase())
        .filter((code): code is string => Boolean(code))
    ),
  ];
  const [products, customers] = await Promise.all([
    osms.product.findMany({ where: { code: { in: codes } } }),
    osms.customer.findMany(),
  ]);
  const byCode = new Map(products.map((p) => [p.code.toUpperCase(), p]));
  const byCustomerCode = new Map(
    customers.map((c) => [c.code.toUpperCase(), c])
  );
  const converter = await loadConverter(osms, products.map((p) => p.id));

  const seen = new Set<string>();
  const prepared: PreparedRow<SoRowData>[] = [];

  for (const row of set.rows) {
    const issues: RowIssue[] = [];
    const values = row.values;
    const raw = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value != null)
    ) as Record<string, string>;

    const soNumber = values.soNumber?.trim() ?? "";
    if (!soNumber) {
      issues.push({
        code: "SO_NUMBER_MISSING",
        severity: "error",
        field: "soNumber",
        message: "An SO number is required.",
      });
    }

    const customerCode = values.customerCode?.trim().toUpperCase() ?? "";
    const customer = customerCode ? byCustomerCode.get(customerCode) : undefined;
    if (!customerCode) {
      issues.push({
        code: "CUSTOMER_MISSING",
        severity: "error",
        field: "customerCode",
        message: "A customer code is required.",
      });
    } else if (!customer) {
      issues.push({
        code: "CUSTOMER_UNKNOWN",
        severity: "warning",
        field: "customerCode",
        message: `Customer ${customerCode} is new — it will be created in the customer master.`,
      });
    }

    const productCode = values.productCode?.trim().toUpperCase() ?? "";
    const product = productCode ? byCode.get(productCode) : undefined;
    if (!product) {
      issues.push({
        code: "PRODUCT_CODE_UNKNOWN",
        severity: "error",
        field: "productCode",
        message: `Product code ${productCode || "(blank)"} is not in the product master.`,
      });
    }

    const quantity = parseNumber(values.quantity);
    if (quantity == null || quantity <= 0) {
      issues.push({
        code: "QUANTITY_INVALID",
        severity: "error",
        field: "quantity",
        message: "Quantity must be a number greater than zero.",
      });
    }

    const deliveryDate = parseImportDate(values.deliveryDate);
    if (!deliveryDate) {
      issues.push({
        code: "INVALID_DATE",
        severity: "error",
        field: "deliveryDate",
        message: "The delivery date is missing or invalid.",
      });
    }

    const unit = normalizeUnit(values.unit ?? product?.unit);
    let baseQuantity = quantity ?? 0;
    if (product && quantity != null) {
      const masterUnit = normalizeUnit(product.unit);
      if (unit && unit !== masterUnit) {
        const converted = converter.tryConvert(quantity, unit, masterUnit, product.id);
        if (converted == null) {
          issues.push({
            code: "UNIT_MISMATCH",
            severity: "error",
            field: "unit",
            message: `No conversion from ${unit} to the stock unit ${masterUnit}.`,
          });
        } else {
          baseQuantity = converted;
        }
      } else {
        baseQuantity = round(quantity);
      }
    }

    const dedupeKey = `${soNumber}|${productCode}|${values.deliveryDate ?? ""}`;
    if (seen.has(dedupeKey)) {
      issues.push({
        code: "DUPLICATE_ROW",
        severity: "error",
        message: "This SO already has the same product and delivery date above.",
      });
    }
    seen.add(dedupeKey);

    const blocked = issues.some((issue) => issue.severity === "error");
    prepared.push({
      rowNumber: row.rowNumber,
      raw,
      issues,
      data:
        blocked || !product || quantity == null || !deliveryDate
          ? null
          : {
              soNumber,
              customerCode,
              customerName: values.customerName?.trim() ?? null,
              productId: product.id,
              productCode: product.code,
              quantity,
              unit: unit || normalizeUnit(product.unit),
              baseQuantity,
              unitPrice: parseNumber(values.unitPrice) ?? 0,
              priceUnit: values.priceUnit?.trim().toUpperCase() ?? null,
              currency: values.currency?.trim().toUpperCase() || "THB",
              deliveryDate,
              requester: values.requester?.trim() ?? null,
            },
    });
  }

  return withHeaderIssues(summarize(prepared), set as RowSet<string>);
}
