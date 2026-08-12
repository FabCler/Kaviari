import ExcelJS from "exceljs";

/**
 * Styled Excel exports for the Order Planner and Purchase Orders.
 * One shared builder keeps every downloaded workbook on-brand:
 * navy title band, champagne header row with autofilter, frozen header,
 * zebra body rows and tabular number formats.
 */

const NAVY = "FF0F192B";
const CHAMPAGNE = "FFE8D5A3";
const ZEBRA = "FFF7F5F0";
const WHITE = "FFFFFFFF";
const BORDER = "FFD9D2C5";

export const INTEGER_FORMAT = "#,##0";

export interface PoExcelColumn {
  header: string;
  width: number;
  /** Excel number format for body cells in this column (e.g. '#,##0'). */
  numFmt?: string;
  align?: "left" | "right" | "center";
}

export interface PoExcelSpec {
  /** Worksheet tab name (max 31 chars, enforced here). */
  sheetName: string;
  /** Painted white-on-navy across the full table width. */
  title: string;
  /** Optional label/value block under the title (PO header info). */
  meta?: [label: string, value: string][];
  columns: PoExcelColumn[];
  rows: (string | number | null)[][];
  /** Optional italic note rendered under the table. */
  note?: string;
}

function fill(color: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: color } };
}

const thinBottom: Partial<ExcelJS.Borders> = {
  bottom: { style: "thin", color: { argb: BORDER } },
};

/** Build a styled single-sheet workbook and return its .xlsx bytes. */
export async function buildStyledWorkbook(
  spec: PoExcelSpec
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Kaviari Cellar";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(spec.sheetName.slice(0, 31), {
    properties: { defaultRowHeight: 18 },
  });

  const columnCount = spec.columns.length;
  sheet.columns = spec.columns.map((col) => ({ width: col.width }));

  // --- Title band -----------------------------------------------------
  const titleRow = sheet.addRow([spec.title]);
  titleRow.height = 30;
  sheet.mergeCells(1, 1, 1, columnCount);
  const titleCell = titleRow.getCell(1);
  titleCell.font = { bold: true, size: 14, color: { argb: WHITE } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  for (let c = 1; c <= columnCount; c += 1) {
    titleRow.getCell(c).fill = fill(NAVY);
  }

  // --- Meta block (reference, dates, status…) --------------------------
  if (spec.meta && spec.meta.length > 0) {
    for (const [label, value] of spec.meta) {
      const row = sheet.addRow([label, value]);
      row.getCell(1).font = { bold: true, size: 10 };
      row.getCell(2).font = { size: 10 };
      row.getCell(2).alignment = { horizontal: "left" };
    }
  }
  // Spacer between title/meta and the table.
  sheet.addRow([]);

  // --- Header row -------------------------------------------------------
  const headerRow = sheet.addRow(spec.columns.map((col) => col.header));
  headerRow.height = 22;
  headerRow.eachCell((cell, colNumber) => {
    const col = spec.columns[colNumber - 1];
    cell.fill = fill(CHAMPAGNE);
    cell.font = { bold: true, size: 10, color: { argb: NAVY } };
    cell.alignment = {
      vertical: "middle",
      horizontal: col?.align ?? "left",
      wrapText: true,
    };
    cell.border = {
      bottom: { style: "medium", color: { argb: NAVY } },
    };
  });
  const headerRowNumber = headerRow.number;

  // Freeze everything above and including the header; filter on the header.
  sheet.views = [{ state: "frozen", ySplit: headerRowNumber }];
  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: columnCount },
  };

  // --- Body rows (zebra) --------------------------------------------------
  spec.rows.forEach((values, index) => {
    const row = sheet.addRow(values.map((v) => (v === null ? "" : v)));
    const zebra = index % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber > columnCount) return;
      const col = spec.columns[colNumber - 1];
      if (zebra) cell.fill = fill(ZEBRA);
      cell.border = thinBottom;
      cell.alignment = { horizontal: col?.align ?? "left" };
      if (col?.numFmt && typeof cell.value === "number") {
        cell.numFmt = col.numFmt;
      }
    });
  });

  // --- Optional note --------------------------------------------------------
  if (spec.note) {
    sheet.addRow([]);
    const noteRow = sheet.addRow([spec.note]);
    sheet.mergeCells(noteRow.number, 1, noteRow.number, columnCount);
    noteRow.getCell(1).font = {
      italic: true,
      size: 9,
      color: { argb: "FF6B6455" },
    };
    noteRow.getCell(1).alignment = { horizontal: "left", wrapText: true };
  }

  const out = await workbook.xlsx.writeBuffer();
  return new Uint8Array(out as ArrayBuffer);
}

/** Standard download headers for a generated .xlsx file. */
export function xlsxResponse(
  bytes: Uint8Array<ArrayBuffer>,
  filename: string
): Response {
  const safe = filename.replace(/[^\w.-]+/g, "-");
  return new Response(bytes, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Cache-Control": "no-store",
    },
  });
}
