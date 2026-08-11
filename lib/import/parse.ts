import * as XLSX from "xlsx";

/**
 * Raw-content extraction for uploaded files. No interpretation happens here —
 * we only turn spreadsheets into cell grids and PDFs into text, capped to a
 * size the AI can reason about. Interpretation is lib/import/analyze.ts.
 */

export const MAX_ROWS_PER_SHEET = 300;
export const MAX_PDF_CHARS = 50_000;

export type ParsedSheet = {
  name: string;
  /** Cell grid (header row included). Cells are display strings or null. */
  rows: (string | null)[][];
  totalDataRows: number;
  truncated: boolean;
};

export type ParsedContent =
  | { kind: "table"; sheets: ParsedSheet[] }
  | { kind: "text"; text: string; truncated: boolean };

export interface ParseOutput {
  content: ParsedContent;
  /** Human-readable notes (truncation, skipped sheets) surfaced in the preview. */
  notices: string[];
}

/** Thrown for user-fixable problems; the API maps it to a 400 with `message`. */
export class ImportParseError extends Error {}

function extension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

function normalizeCell(cell: unknown): string | null {
  if (cell == null) return null;
  const text = String(cell).trim();
  return text === "" ? null : text;
}

function parseSpreadsheet(buffer: Buffer): ParseOutput {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    throw new ImportParseError(
      "This file could not be read as a spreadsheet. It may be corrupted or password-protected — try re-exporting it as .xlsx or .csv."
    );
  }

  const notices: string[] = [];
  const sheets: ParsedSheet[] = [];

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: null,
    });
    const rows = raw
      .map((row) => (Array.isArray(row) ? row.map(normalizeCell) : []))
      .filter((row) => row.some((cell) => cell !== null));
    if (rows.length === 0) continue;

    const truncated = rows.length > MAX_ROWS_PER_SHEET;
    if (truncated) {
      notices.push(
        `Sheet "${name}" has ${rows.length} rows — only the first ${MAX_ROWS_PER_SHEET} were analyzed.`
      );
    }
    sheets.push({
      name,
      rows: truncated ? rows.slice(0, MAX_ROWS_PER_SHEET) : rows,
      totalDataRows: rows.length,
      truncated,
    });
  }

  if (sheets.length === 0) {
    throw new ImportParseError(
      "No data rows were found in this file. Check that the spreadsheet is not empty."
    );
  }

  return { content: { kind: "table", sheets }, notices };
}

async function parsePdf(buffer: Buffer): Promise<ParseOutput> {
  let text: string;
  try {
    const { extractText } = await import("unpdf");
    const result = await extractText(new Uint8Array(buffer), {
      mergePages: true,
    });
    text = result.text.trim();
  } catch {
    throw new ImportParseError(
      "This PDF could not be read. It may be encrypted or corrupted — try exporting the data as a spreadsheet instead."
    );
  }

  if (!text) {
    throw new ImportParseError(
      "No text could be extracted from this PDF — it looks like a scanned image. Try a spreadsheet export or a text-based PDF."
    );
  }

  const notices: string[] = [];
  const truncated = text.length > MAX_PDF_CHARS;
  if (truncated) {
    notices.push(
      `The PDF text is long (${Math.round(text.length / 1000)}k characters) — only the first ${Math.round(MAX_PDF_CHARS / 1000)}k were analyzed.`
    );
    text = text.slice(0, MAX_PDF_CHARS);
  }

  return { content: { kind: "text", text, truncated }, notices };
}

/**
 * Parse an uploaded file into AI-ready raw content. Throws ImportParseError
 * with a user-friendly message for anything the user can fix themselves.
 */
export async function parseUpload(
  buffer: Buffer,
  filename: string
): Promise<ParseOutput> {
  const ext = extension(filename);
  if (ext === ".pdf") return parsePdf(buffer);
  if (ext === ".xlsx" || ext === ".xls" || ext === ".csv") {
    return parseSpreadsheet(buffer);
  }
  throw new ImportParseError(
    `Unsupported file type "${ext || "unknown"}". Upload a .xlsx, .xls, .csv or .pdf file.`
  );
}

/** Compact text rendering of parsed content for the AI prompt. */
export function renderContentForPrompt(content: ParsedContent): string {
  if (content.kind === "text") {
    return `--- PDF TEXT START ---\n${content.text}\n--- PDF TEXT END ---`;
  }
  return content.sheets
    .map((sheet) => {
      const rows = sheet.rows
        .map((row, i) => `${i + 1}: ${JSON.stringify(row)}`)
        .join("\n");
      const note = sheet.truncated
        ? ` (truncated to first ${sheet.rows.length} of ${sheet.totalDataRows} rows)`
        : "";
      return `--- SHEET "${sheet.name}"${note} ---\n${rows}`;
    })
    .join("\n\n");
}
