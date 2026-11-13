import * as XLSX from "xlsx";

/**
 * Deterministic parser for the customer sales exports. Two layouts:
 *
 * 1. "Top 90% sales" pivot (20260911_Kaviari_QTY_of_Top_90_YTDSep26_vs_25)
 *    — a full snapshot that replaces all customer data:
 *   - a header row starting with "Code Name" | "Commercial Name" |
 *     "PR Code" | "Item Description", followed by month-number columns;
 *   - the row above it carries the year for each month block (2025, 2026, …)
 *     plus "<year> Total" columns, which are ignored (we re-sum ourselves);
 *   - customer code/name appear only on the first product row of each
 *     customer block; "<name> Total" and "Grand Total" rows are skipped.
 *   Year and month columns are detected dynamically.
 *
 * 2. Invoice-line export ("Caviar_Item_Sep-Nov-26": a "Data" sheet with one
 *    row per invoice / credit-note line — CardCode, Commercial Name, PR Code,
 *    Year, Month, Quantity, Sale Rep …) — a partial period that replaces only
 *    the months it covers. All products are listed; only the caller's caviar
 *    PR codes are kept. Credit notes carry negative quantities and are
 *    netted, as the export's own pivot does.
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

export type CustomerSalesParseResult =
  | {
      /** Top 90% snapshot: replaces every stored row. */
      mode: "replace-all";
      rows: CustomerSaleRow[];
      customers: number;
      years: number[];
    }
  | {
      /** Invoice-line export: replaces only the months it covers. */
      mode: "replace-months";
      rows: CustomerSaleRow[];
      customers: number;
      years: number[];
      /** Every (year, month) in the file, caviar or not, ascending. */
      months: { year: number; month: number }[];
      /** customerCode → the sales rep on most of its caviar lines. */
      reps: Record<string, string>;
    };

export interface ParseOptions {
  /**
   * PR codes counted as caviar. Required to read the invoice-line export,
   * which lists every product the company sells.
   */
  caviarPrCodes?: Set<string>;
}

type Cell = string | number | null;

function asText(cell: Cell): string {
  return cell == null ? "" : String(cell).trim();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const FORMAT_HINT =
  'Expected either the "Top 90% sales" pivot export (a "Code Name / Commercial Name / PR Code / Item Description" header with year and month columns) or the invoice-line export (a "Data" sheet with CardCode, PR Code, Year, Month and Quantity columns).';

/** Header names of the invoice-line export, matched case-insensitively. */
const LINE_COLUMNS = {
  code: ["cardcode"],
  commercialName: ["commercial name"],
  cardName: ["cardname"],
  prCode: ["pr code"],
  itemName: ["itemname"],
  year: ["year"],
  month: ["month"],
  quantity: ["quantity"],
  rep: ["sale rep", "salename"],
} as const;

export function parseCustomerSalesWorkbook(
  buffer: Buffer,
  options: ParseOptions = {}
): CustomerSalesParseResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    throw new CustomerSalesParseError(
      "This file could not be read as a spreadsheet. It may be corrupted or password-protected — try re-exporting it as .xlsx."
    );
  }

  const grids = workbook.SheetNames.flatMap((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) return [];
    return [
      XLSX.utils.sheet_to_json<Cell[]>(sheet, {
        header: 1,
        raw: true,
        defval: null,
      }),
    ];
  });

  // Top 90% pivot: a "Code Name" header in the first column.
  for (const grid of grids) {
    const headerIndex = grid.findIndex(
      (row) => asText(row?.[0]).toLowerCase() === "code name"
    );
    if (headerIndex !== -1) return parseGrid(grid, headerIndex);
  }

  // Invoice-line export: a header row naming every required column.
  for (const grid of grids) {
    for (let i = 0; i < Math.min(grid.length, 10); i++) {
      const columns = lineColumns(grid[i] ?? []);
      if (!columns) continue;
      if (!options.caviarPrCodes) {
        throw new CustomerSalesParseError(
          "The invoice-line export needs the product catalog to pick out caviar lines."
        );
      }
      return parseLines(grid, i, columns, options.caviarPrCodes);
    }
  }

  throw new CustomerSalesParseError(
    `The customer sales table was not found in this file. ${FORMAT_HINT}`
  );
}

type LineColumns = Record<keyof typeof LINE_COLUMNS, number>;

/** Column indexes of the invoice-line header, or null if it isn't one. */
function lineColumns(row: Cell[]): LineColumns | null {
  const headers = row.map((cell) => asText(cell).toLowerCase());
  const find = (names: readonly string[]) =>
    headers.findIndex((h) => names.includes(h));
  const columns = Object.fromEntries(
    Object.entries(LINE_COLUMNS).map(([key, names]) => [key, find(names)])
  ) as LineColumns;
  const required: (keyof LineColumns)[] = [
    "code",
    "prCode",
    "year",
    "month",
    "quantity",
  ];
  if (required.some((key) => columns[key] === -1)) return null;
  if (columns.commercialName === -1 && columns.cardName === -1) return null;
  return columns;
}

function parseLines(
  grid: Cell[][],
  headerIndex: number,
  columns: LineColumns,
  caviarPrCodes: Set<string>
): CustomerSalesParseResult {
  const cell = (row: Cell[], key: keyof LineColumns) =>
    columns[key] === -1 ? null : (row[columns[key]] ?? null);

  const totals = new Map<string, CustomerSaleRow>();
  const months = new Map<string, { year: number; month: number }>();
  const repVotes = new Map<string, Map<string, number>>();

  for (const row of grid.slice(headerIndex + 1)) {
    if (!Array.isArray(row)) continue;
    const year = Number(cell(row, "year"));
    const month = Number(cell(row, "month"));
    if (
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      continue;
    }
    // Every dated line marks its month as covered, caviar or not, so a
    // month without caviar sales still replaces stale data.
    months.set(`${year}-${month}`, { year, month });

    const prCode = asText(cell(row, "prCode"));
    const customerCode = asText(cell(row, "code"));
    const quantity = Number(cell(row, "quantity"));
    if (!caviarPrCodes.has(prCode) || !customerCode) continue;
    if (!Number.isFinite(quantity) || quantity === 0) continue;

    const customerName =
      asText(cell(row, "commercialName")) ||
      asText(cell(row, "cardName")) ||
      customerCode;
    const key = `${customerCode}|${prCode}|${year}|${month}`;
    const entry = totals.get(key) ?? {
      customerCode,
      customerName,
      prCode,
      productName: asText(cell(row, "itemName")) || prCode,
      year,
      month,
      quantity: 0,
    };
    entry.quantity += quantity;
    totals.set(key, entry);

    const rep = asText(cell(row, "rep"));
    if (rep) {
      const votes = repVotes.get(customerCode) ?? new Map<string, number>();
      votes.set(rep, (votes.get(rep) ?? 0) + 1);
      repVotes.set(customerCode, votes);
    }
  }

  // Net the credit notes; a line that nets to zero carries nothing.
  const rows = [...totals.values()]
    .map((row) => ({ ...row, quantity: round2(row.quantity) }))
    .filter((row) => row.quantity !== 0);

  if (rows.length === 0) {
    throw new CustomerSalesParseError(
      "No caviar sales were found in this file — check that the PR codes match the product catalog."
    );
  }

  const reps: Record<string, string> = {};
  for (const [code, votes] of repVotes) {
    reps[code] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  return {
    mode: "replace-months",
    rows,
    customers: new Set(rows.map((r) => r.customerCode)).size,
    years: [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b),
    months: [...months.values()].sort(
      (a, b) => a.year - b.year || a.month - b.month
    ),
    reps,
  };
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
  return { mode: "replace-all", rows, customers: customers.size, years };
}
