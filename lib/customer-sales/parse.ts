import * as XLSX from "xlsx";

/**
 * Deterministic parser for the "Top 90% sales" customer pivot export
 * (20260911_Kaviari_QTY_of_Top_90_YTDSep26_vs_25.xlsx and its bi-monthly
 * successors). The layout is a pivot table:
 *
 *   - a header row starting with "Code Name" | "Commercial Name" |
 *     "PR Code" | "Item Description", followed by month-number columns;
 *   - the row above it carries the year for each month block (2025, 2026, …)
 *     plus "<year> Total" columns, which are ignored (we re-sum ourselves);
 *   - customer code/name appear only on the first product row of each
 *     customer block; "<name> Total" and "Grand Total" rows are skipped.
 *
 * Year and month columns are detected dynamically so future exports with
 * more months (or a new year) parse without code changes.
 */

export class CustomerSalesParseError extends Error {}

export interface CustomerSaleRow {
  customerCode: string;
  customerName: string;
  /** PR code as text; null for the export's "(blank)" bucket. */
  prCode: string | null;
  productName: string;
  year: number;
  month: number; // 1-12
  quantity: number;
}

export interface CustomerSalesParseResult {
  rows: CustomerSaleRow[];
  customers: number;
  years: number[];
}

type Cell = string | number | null;

function asText(cell: Cell): string {
  return cell == null ? "" : String(cell).trim();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const FORMAT_HINT =
  'Expected the "Top 90% sales" pivot export: a "Code Name / Commercial Name / PR Code / Item Description" header with year and month columns.';

export function parseCustomerSalesWorkbook(
  buffer: Buffer
): CustomerSalesParseResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    throw new CustomerSalesParseError(
      "This file could not be read as a spreadsheet. It may be corrupted or password-protected — try re-exporting it as .xlsx."
    );
  }

  // Find the sheet + header row ("Code Name" in the first column).
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const grid = XLSX.utils.sheet_to_json<Cell[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
    });
    const headerIndex = grid.findIndex(
      (row) => asText(row?.[0]).toLowerCase() === "code name"
    );
    if (headerIndex === -1) continue;
    return parseGrid(grid, headerIndex);
  }

  throw new CustomerSalesParseError(
    `No "Code Name" header row was found in this file. ${FORMAT_HINT}`
  );
}

function parseGrid(
  grid: Cell[][],
  headerIndex: number
): CustomerSalesParseResult {
  const headerRow = grid[headerIndex] ?? [];
  const yearRow = grid[headerIndex - 1] ?? [];

  // Map data columns to (year, month). A numeric year cell opens a year
  // block; its month columns carry 1-12 in the header row. "<year> Total"
  // columns have no month number and are skipped.
  const columns: { index: number; year: number; month: number }[] = [];
  let currentYear: number | null = null;
  const width = Math.max(headerRow.length, yearRow.length);
  for (let c = 4; c < width; c += 1) {
    const yearCell = yearRow[c];
    if (typeof yearCell === "number" && yearCell >= 2000 && yearCell <= 2100) {
      currentYear = yearCell;
    }
    const monthCell = headerRow[c];
    if (
      currentYear !== null &&
      typeof monthCell === "number" &&
      Number.isInteger(monthCell) &&
      monthCell >= 1 &&
      monthCell <= 12
    ) {
      columns.push({ index: c, year: currentYear, month: monthCell });
    }
  }
  if (columns.length === 0) {
    throw new CustomerSalesParseError(
      `No year/month columns were recognized. ${FORMAT_HINT}`
    );
  }

  const rows: CustomerSaleRow[] = [];
  const customers = new Set<string>();
  let customerCode = "";
  let customerName = "";

  for (let r = headerIndex + 1; r < grid.length; r += 1) {
    const row = grid[r] ?? [];
    const codeCell = asText(row[0]);
    const nameCell = asText(row[1]);
    const prCell = asText(row[2]);

    if (/^grand total$/i.test(codeCell)) break;
    // Subtotal rows ("<customer> Total") carry no PR code.
    if (prCell === "" && / total$/i.test(nameCell)) continue;

    if (codeCell !== "") customerCode = codeCell;
    if (nameCell !== "") customerName = nameCell;
    if (prCell === "" || customerCode === "") continue;

    const prCode = /^\(blank\)$/i.test(prCell) ? null : prCell;
    const productName = asText(row[3]) || (prCode ?? "Unspecified product");

    for (const column of columns) {
      const value = row[column.index];
      if (typeof value !== "number" || value === 0) continue;
      customers.add(customerCode);
      rows.push({
        customerCode,
        customerName,
        prCode,
        productName,
        year: column.year,
        month: column.month,
        quantity: round2(value),
      });
    }
  }

  if (rows.length === 0) {
    throw new CustomerSalesParseError(
      `No customer quantities were found in this file. ${FORMAT_HINT}`
    );
  }

  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
  return { rows, customers: customers.size, years };
}
