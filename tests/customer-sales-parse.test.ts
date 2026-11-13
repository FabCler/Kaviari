import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  CustomerSalesParseError,
  parseCustomerSalesWorkbook,
} from "@/lib/customer-sales/parse";

function workbook(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const LINE_HEADER = [
  "#", "DocDate", "Year", "Week", "Month", "YTD", "Quantity", "UOM",
  "ItemCode", "ItemName", "SaleName", "Sale Rep", "CardCode", "CardName",
  "U_Reason", "PR Code", "Commercial Name",
];

function line(
  month: number,
  quantity: number,
  prCode: string,
  code = "CL001",
  rep = "Rep A",
  ytd = "Act"
) {
  return [
    1, "01/09/26", 2026, 1, month, ytd, quantity, "TIN", "X",
    `Item ${prCode}`, rep, rep, code, "Legal name", null, prCode, `Name ${code}`,
  ];
}

describe("parseCustomerSalesWorkbook — invoice-line export", () => {
  const caviarPrCodes = new Set(["1216", "3126"]);

  it("keeps caviar lines, nets credit notes and lists covered months", () => {
    const buffer = workbook({
      Pivot: [["Performance by customers"], ["Commercial Name", "PR Code"]],
      Data: [
        LINE_HEADER,
        line(9, 10, "1216"),
        line(9, -2, "1216"), // credit note, same month
        line(9, 5, "34"), // not caviar: ignored, but Sep is covered
        line(10, 3, "3126", "CL002", "Rep B"),
        line(10, -3, "3126", "CL002", "Rep B"), // nets to zero: dropped
        line(11, 4, "1216", "CL001", "Rep A", "CM"), // CM = current month
      ],
    });

    const parsed = parseCustomerSalesWorkbook(buffer, { caviarPrCodes });

    expect(parsed.mode).toBe("replace-months");
    if (parsed.mode !== "replace-months") return;
    expect(parsed.rows).toEqual([
      expect.objectContaining({
        customerCode: "CL001", prCode: "1216", year: 2026, month: 9, quantity: 8,
      }),
      expect.objectContaining({
        customerCode: "CL001", prCode: "1216", year: 2026, month: 11, quantity: 4,
      }),
    ]);
    expect(parsed.rows[0].customerName).toBe("Name CL001");
    expect(parsed.months).toEqual([
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
    ]);
    expect(parsed.reps).toEqual({ CL001: "Rep A", CL002: "Rep B" });
  });

  it("keeps exactly the products the file's pivot lists", () => {
    const item = (prCode: string | number, name: string, month = 9) => {
      const row = line(month, 5, String(prCode));
      row[9] = name;
      row[15] = prCode;
      return row;
    };
    const buffer = workbook({
      Pivot: [
        ["Performance by customers"],
        [],
        ["Commercial Name", "PR Code", "ItemName", 9, "Grand Total"],
        ["Name CL001", "1216", "Kristal 30g", 5, 5],
        [null, 0, "Other Brand Caviar 100g", 5, 5],
        ["Name CL001 Total", null, null, 10, 10],
        ["Grand Total", null, null, 10, 10],
      ],
      Data: [
        LINE_HEADER,
        item("1216", "Kristal 30g"),
        item(0, "Other Brand Caviar 100g"), // no PR code, listed by the pivot
        item(0, "Fresh seafood"), // no PR code, not in the pivot
        item("3126", "Oscietra 30g"), // catalog caviar the pivot leaves out
      ],
    });

    const parsed = parseCustomerSalesWorkbook(buffer, { caviarPrCodes });

    expect(
      parsed.rows.map((r) => [r.prCode, r.productName, r.quantity])
    ).toEqual([
      ["1216", "Kristal 30g", 5],
      [null, "Other Brand Caviar 100g", 5],
    ]);
  });

  it("needs the caviar PR codes to read the line export", () => {
    const buffer = workbook({ Data: [LINE_HEADER, line(9, 1, "1216")] });
    expect(() => parseCustomerSalesWorkbook(buffer)).toThrow(
      CustomerSalesParseError
    );
  });

  it("still reads the Top 90% pivot as a full replacement", () => {
    const buffer = workbook({
      "Top 90 sales": [
        ["Sum of Qty", null, null, null, "Year", "Month"],
        [null, null, null, null, 2026],
        ["Code Name", "Commercial Name", "PR Code", "Item Description", 1, 2],
        ["CL001", "Name", 1216, "Kristal 30g", 3, null],
        [null, "Name Total", null, null, 3, null],
        ["Grand Total", null, null, null, 3, null],
      ],
    });
    const parsed = parseCustomerSalesWorkbook(buffer, { caviarPrCodes });
    expect(parsed.mode).toBe("replace-all");
    expect(parsed.rows).toEqual([
      expect.objectContaining({ customerCode: "CL001", month: 1, quantity: 3 }),
    ]);
  });
});
