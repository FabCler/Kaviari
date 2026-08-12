import ExcelJS from "exceljs";

/**
 * Shared exceljs helpers for the branded workbook exports (consumption
 * export, forecast template). One visual language: navy title bar, gold
 * accent rule, champagne column headers with autoFilter, frozen panes,
 * pearl zebra striping and tabular number formats.
 */

export const EXCEL_COLORS = {
  navy: "FF0F192B",
  gold: "FFC9A227",
  champagne: "FFE8D5A3",
  zebra: "FFF7F5F0",
  white: "FFFFFFFF",
  ink: "FF171A20",
  muted: "FF6D6F74",
  red: "FFB3261E",
} as const;

export const NUM_FMT = "#,##0.0";
export const INT_FMT = "#,##0";
export const KG_FMT = '#,##0.00" kg"';
export const PCT_FMT = '0.0"%"';

export function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

export interface ColumnSpec {
  header: string;
  width: number;
  align?: "left" | "right" | "center";
  /** Number format applied to every data cell in the column. */
  numFmt?: string;
  /** Paint negative numbers red (variance-style columns). */
  redNegative?: boolean;
}

/** Navy title row + thin gold accent rule (+ optional muted subtitle). */
export function addTitleBlock(
  ws: ExcelJS.Worksheet,
  title: string,
  columnCount: number,
  subtitle?: string
): void {
  const titleRow = ws.addRow([title]);
  titleRow.height = 30;
  for (let c = 1; c <= columnCount; c++) {
    titleRow.getCell(c).fill = solidFill(EXCEL_COLORS.navy);
  }
  ws.mergeCells(titleRow.number, 1, titleRow.number, columnCount);
  const titleCell = titleRow.getCell(1);
  titleCell.font = { bold: true, size: 14, color: { argb: EXCEL_COLORS.white } };
  titleCell.alignment = { vertical: "middle", indent: 1 };

  const rule = ws.addRow([]);
  rule.height = 3;
  for (let c = 1; c <= columnCount; c++) {
    rule.getCell(c).fill = solidFill(EXCEL_COLORS.gold);
  }

  if (subtitle) {
    const sub = ws.addRow([subtitle]);
    ws.mergeCells(sub.number, 1, sub.number, columnCount);
    sub.getCell(1).font = { size: 9, italic: true, color: { argb: EXCEL_COLORS.muted } };
    sub.getCell(1).alignment = { vertical: "middle", indent: 1 };
  }
}

/** Small "Filters:"-style info block: heading + label/value rows. */
export function addInfoBlock(
  ws: ExcelJS.Worksheet,
  heading: string,
  entries: [string, string][]
): void {
  ws.addRow([]);
  const head = ws.addRow([heading]);
  head.getCell(1).font = { bold: true, size: 10, color: { argb: EXCEL_COLORS.ink } };
  for (const [label, value] of entries) {
    const row = ws.addRow([`${label}:`, value]);
    row.getCell(1).font = { size: 9, color: { argb: EXCEL_COLORS.muted } };
    row.getCell(2).font = { size: 9, color: { argb: EXCEL_COLORS.ink } };
  }
}

/**
 * Bold champagne header row; sets column widths from the specs.
 * Returns the header row number (freeze/autoFilter anchor).
 */
export function addHeaderRow(ws: ExcelJS.Worksheet, columns: ColumnSpec[]): number {
  ws.addRow([]);
  const row = ws.addRow(columns.map((c) => c.header));
  row.height = 20;
  columns.forEach((spec, i) => {
    const cell = row.getCell(i + 1);
    cell.fill = solidFill(EXCEL_COLORS.champagne);
    cell.font = { bold: true, size: 10, color: { argb: EXCEL_COLORS.ink } };
    cell.alignment = { vertical: "middle", horizontal: spec.align ?? "left" };
    cell.border = { bottom: { style: "thin", color: { argb: EXCEL_COLORS.gold } } };
    ws.getColumn(i + 1).width = spec.width;
  });
  return row.number;
}

/** Zebra striping, per-column number formats/alignment and red negatives. */
export function styleDataRows(
  ws: ExcelJS.Worksheet,
  columns: ColumnSpec[],
  firstRow: number,
  lastRow: number
): void {
  for (let r = firstRow; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const stripe = (r - firstRow) % 2 === 1;
    columns.forEach((spec, i) => {
      const cell = row.getCell(i + 1);
      if (stripe) cell.fill = solidFill(EXCEL_COLORS.zebra);
      if (spec.numFmt) cell.numFmt = spec.numFmt;
      if (spec.align) cell.alignment = { horizontal: spec.align };
      if (spec.redNegative && typeof cell.value === "number" && cell.value < 0) {
        cell.font = { color: { argb: EXCEL_COLORS.red } };
      }
    });
  }
}

/** Bold totals row on a champagne tint with a gold top border. */
export function styleTotalsRow(
  ws: ExcelJS.Worksheet,
  columns: ColumnSpec[],
  rowNumber: number
): void {
  const row = ws.getRow(rowNumber);
  columns.forEach((spec, i) => {
    const cell = row.getCell(i + 1);
    cell.font = { bold: true, size: 10, color: { argb: EXCEL_COLORS.ink } };
    cell.border = { top: { style: "thin", color: { argb: EXCEL_COLORS.gold } } };
    if (spec.numFmt) cell.numFmt = spec.numFmt;
    if (spec.align) cell.alignment = { horizontal: spec.align };
    if (spec.redNegative && typeof cell.value === "number" && cell.value < 0) {
      cell.font = { bold: true, color: { argb: EXCEL_COLORS.red } };
    }
  });
}

/** Enable autoFilter over the table and freeze panes below the header. */
export function finishTable(
  ws: ExcelJS.Worksheet,
  headerRow: number,
  lastDataRow: number,
  columnCount: number
): void {
  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: Math.max(headerRow, lastDataRow), column: columnCount },
  };
  ws.views = [{ state: "frozen", ySplit: headerRow }];
}

/** Column width sized to content (clamped so one long name can't blow up). */
export function fitWidth(
  header: string,
  values: Array<string | number | null | undefined>,
  { min = 9, max = 46 }: { min?: number; max?: number } = {}
): number {
  let longest = header.length;
  for (const v of values) {
    if (v == null) continue;
    const len = String(v).length;
    if (len > longest) longest = len;
  }
  return Math.min(max, Math.max(min, longest + 3));
}

/** Serialize the workbook as an .xlsx attachment response. */
export async function workbookResponse(
  wb: ExcelJS.Workbook,
  filename: string
): Promise<Response> {
  const out = await wb.xlsx.writeBuffer();
  // exceljs returns a Node Buffer (typed as ExcelJS.Buffer); copy into a
  // plain Uint8Array so Response gets exactly the workbook bytes.
  const body = new Uint8Array(
    Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer)
  );
  return new Response(body, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Fresh branded workbook with app metadata. */
export function createWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kaviari Cellar";
  wb.created = new Date();
  return wb;
}
