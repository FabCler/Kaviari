import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  detectEuroNumbers,
  findTriple,
  linesFromItems,
  parseNum,
  pdfCandidateRows,
  readPdf,
  type PdfLine,
} from "@/lib/import/pdf";

// Real supplier documents are not in the repository — they carry a vendor's
// prices. Point PDF_FIXTURES at a folder holding them to run these two.
const FIXTURES = process.env.PDF_FIXTURES ?? "";
const has = (f: string) => !!FIXTURES && existsSync(`${FIXTURES}/${f}`);
const bytes = (f: string) => new Uint8Array(readFileSync(`${FIXTURES}/${f}`));
const PO = "e378e344-Cultimer__PO_1.pdf";
const SCAN = "f72d9ca7-Cultimer__Docs.pdf";

describe("numbers on a document", () => {
  it("reads a European invoice and an English one", () => {
    const euro: PdfLine[] = [
      { y: 0, cells: [], text: "25,00 KG 4,05 101,25" },
      { y: 1, cells: [], text: "1.234,56" },
    ];
    const us: PdfLine[] = [
      { y: 0, cells: [], text: "25.00 KG 4.05 101.25" },
      { y: 1, cells: [], text: "1,234.56" },
    ];
    expect(detectEuroNumbers(euro)).toBe(true);
    expect(detectEuroNumbers(us)).toBe(false);
    expect(parseNum("1.234,56", true)).toBe(1234.56);
    expect(parseNum("1,234.56", false)).toBe(1234.56);
  });

  it("finds the line that obeys quantity x price = amount", () => {
    // a stray page number and a date sit among the real figures
    expect(findTriple([2026, 25, 4.05, 101.25])).toEqual({
      qty: 25,
      price: 4.05,
      amount: 101.25,
    });
    expect(findTriple([1, 2, 3])).toBeNull();
  });
});

describe("turning positioned text into rows", () => {
  it("clusters strings that share a band into one line", () => {
    const lines = linesFromItems([
      { str: "8131", x: 40, y: 700 },
      { str: "Live Bouchot Mussel", x: 90, y: 701 },
      { str: "25", x: 300, y: 700 },
      { str: "4.05", x: 360, y: 700.5 },
      { str: "101.25", x: 430, y: 700 },
      { str: "Page 1", x: 40, y: 40 },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("8131 Live Bouchot Mussel 25 4.05 101.25");
    const rows = pdfCandidateRows(lines, false);
    expect(rows[0]).toMatchObject({
      itemCode: "8131",
      qty: 25,
      price: 4.05,
      amount: 101.25,
    });
  });
});

describe.skipIf(!has(PO))("a real supplier PDF", () => {
  it("reads the purchase order lines", async () => {
    const out = await readPdf(bytes(PO));
    expect(out.header.poNo).toBe("26080645-0");
    expect(out.header.currency).toBe("EUR");
    expect(out.rows).toHaveLength(2);
    expect(out.rows.map((r) => [r.itemCode, r.qty, r.price])).toEqual([
      ["8131", 25, 4.05],
      ["8548", 20, 4.7],
    ]);
  });

  it("says so plainly when the PDF is a scan", async () => {
    await expect(readPdf(bytes(SCAN))).rejects.toThrow(
      /no text in it/i
    );
  });
});
