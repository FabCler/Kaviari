/**
 * Turn an uploaded file into a header row plus data rows.
 *
 * Excel and CSV go through SheetJS, which reads .xlsx, .xls, .csv and
 * tab-separated text alike, so the importer does not care which of them the
 * SAP query produced.
 */

import * as XLSX from "xlsx";
import type { Matrix } from "@/lib/import/columns";

export type FileKind = "xlsx" | "text" | "pdf";

export function sniffKind(bytes: Uint8Array, name = ""): FileKind {
  const n = name.toLowerCase();
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)
    return "pdf";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "xlsx";
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".xlsx") || n.endsWith(".xlsm") || n.endsWith(".xls")) return "xlsx";
  return "text";
}

/**
 * The first sheet, as a matrix. Blank leading rows are dropped so a workbook
 * with a title above its table still lands on the header row.
 */
export function readMatrix(bytes: Uint8Array, name = ""): Matrix {
  const kind = sniffKind(bytes, name);
  if (kind === "pdf") {
    throw new Error(
      "PDF import is not available yet — export the document as Excel or CSV."
    );
  }
  const wb = XLSX.read(bytes, { type: "array", raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Matrix[number]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  // Skip anything above the widest row: SAP exports often carry a title line.
  const widest = rows.reduce((best, r, i) => (r.length > (rows[best]?.length ?? 0) ? i : best), 0);
  return rows.slice(widest);
}
