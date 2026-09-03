import { ImportParseError, parseUpload } from "@/lib/import/parse";
import { mapHeaders, missingColumns, type ColumnMap } from "@/lib/scm/import/columns";

/**
 * Turn an uploaded workbook into typed rows. Reuses the app's existing
 * spreadsheet reader (lib/import/parse.ts) so .xlsx, .xls and .csv all
 * behave the same, then applies the column mapping.
 */

export interface RowSet<T extends string> {
  fields: T[];
  rows: { rowNumber: number; values: Partial<Record<T, string>> }[];
  unmatchedHeaders: string[];
  missing: T[];
  notices: string[];
  sheetName: string;
}

export async function readRows<T extends string>(
  file: { name: string; arrayBuffer(): Promise<ArrayBuffer> },
  columns: ColumnMap<T>,
  required: readonly T[]
): Promise<RowSet<T>> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parseUpload(buffer, file.name);
  if (parsed.content.kind !== "table") {
    throw new ImportParseError(
      "This importer expects a spreadsheet (.xlsx, .xls or .csv). Upload PDF invoices under Import → Supplier invoice instead."
    );
  }
  const sheet = parsed.content.sheets[0];
  if (!sheet || sheet.rows.length < 2) {
    throw new ImportParseError(
      "The file has no data rows — the first row must be the column headers."
    );
  }

  const [headerRow, ...dataRows] = sheet.rows;
  const { index, unmatched } = mapHeaders(headerRow, columns);
  const missing = missingColumns(index, required);
  const fields = Object.keys(index) as T[];

  const rows = dataRows
    .map((cells, position) => {
      const values: Partial<Record<T, string>> = {};
      for (const field of fields) {
        const column = index[field];
        if (column == null) continue;
        const cell = cells[column];
        if (cell != null && cell !== "") values[field] = String(cell).trim();
      }
      // +2: one for the header row, one because humans count from 1.
      return { rowNumber: position + 2, values };
    })
    .filter((row) => Object.keys(row.values).length > 0);

  return {
    fields,
    rows,
    unmatchedHeaders: unmatched,
    missing,
    notices: parsed.notices,
    sheetName: sheet.name,
  };
}

/** Excel serial dates, ISO strings and the dd/mm/yyyy people actually type. */
export function parseImportDate(value: string | undefined): Date | null {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;

  if (/^\d{5}$/.test(text)) {
    // Excel serial (1900 date system), read as UTC noon to dodge DST.
    const serial = Number.parseInt(text, 10);
    const ms = (serial - 25569) * 86_400_000;
    const date = new Date(ms + 12 * 3600 * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const date = new Date(
      Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12)
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    // Thai Buddhist-era years arrive as 2568 etc.
    if (year > 2400) year -= 543;
    const date = new Date(
      Date.UTC(year, Number(dmy[2]) - 1, Number(dmy[1]), 12)
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function parseNumber(value: string | undefined): number | null {
  if (value == null) return null;
  const cleaned = value.replace(/[,\s]/g, "").replace(/[^\d.\-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}
