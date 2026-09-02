/**
 * Reading a PDF purchase order or supplier invoice.
 *
 * A PDF is a drawing, not a table: there are no columns, only strings at
 * coordinates. The text is extracted with its positions, clustered into lines,
 * and each line is accepted as a document row only when its numbers obey
 * quantity × price = amount. That invariant is what keeps a page-break overlay
 * or a footer out of the result.
 *
 * Nothing read here reaches the database on its own: the rows are shown in an
 * editable preview and the desk confirms them.
 */

import { extractTextItems } from "unpdf";
import { norm } from "@/lib/format";

export type PdfCell = { x: number; t: string };
export type PdfLine = { y: number; cells: PdfCell[]; text: string };

export type PdfRow = {
  itemCode: string;
  desc: string;
  qty: number;
  uom: string;
  price: number;
  amount: number;
};

export type PdfHeader = {
  poNo: string;
  invoiceNo: string;
  supplierCode: string;
  supplierName: string;
  currency: string;
  deliveryDate: string;
};

const NUMTOK = /^[-+]?[\d.,]*\d[.,]?\d*$/;
const DATETOK = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;
const UOMS = /^\(?(KG|KGS|PC|PCS|BOX|BOXES|CTN|G|GR|L|K|UN|EA)\)?$/i;

const isNum = (t: string): boolean =>
  NUMTOK.test(t) && /\d/.test(t) && !DATETOK.test(t);

/** Strings at coordinates become lines: same band of y, ordered by x. */
export function linesFromItems(
  items: { str: string; x: number; y: number }[]
): PdfLine[] {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const groups: { y: number; arr: typeof sorted }[] = [];
  for (const it of sorted) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(g.y - it.y) <= 4) g.arr.push(it);
    else groups.push({ y: it.y, arr: [it] });
  }
  return groups
    .map((g) => g.arr.sort((a, b) => a.x - b.x))
    .map((arr) => {
      // An overlaid page repeats the same string in the same spot — keep one.
      const cells: PdfCell[] = [];
      for (const a of arr) {
        const t = a.str.trim();
        if (!t) continue;
        const prev = cells[cells.length - 1];
        if (prev && prev.t === t && Math.abs(prev.x - a.x) < 1) continue;
        cells.push({ x: a.x, t });
      }
      const run: PdfCell[] = [];
      for (const c of cells) if (run[run.length - 1]?.t !== c.t) run.push(c);
      return {
        y: arr[0].y,
        cells: run,
        text: run.map((c) => c.t).join(" ").replace(/\s+/g, " ").trim(),
      };
    })
    .filter((r) => r.text);
}

/** European invoices write 1.234,56 — the whole document is read one way. */
export function detectEuroNumbers(lines: PdfLine[]): boolean {
  let eu = 0;
  let us = 0;
  for (const l of lines) {
    for (const m of l.text.matchAll(/\d+[.,]\d+/g)) {
      if (/,\d{2}$/.test(m[0])) eu += 1;
      if (/\.\d{2}$/.test(m[0])) us += 1;
    }
    if (/\d\.\d{3},\d/.test(l.text)) eu += 5;
    if (/\d,\d{3}\.\d/.test(l.text)) us += 5;
  }
  return eu > us;
}

export function parseNum(tok: string | undefined, euro: boolean): number {
  if (tok == null) return 0;
  let t = String(tok).replace(/[^\d.,-]/g, "");
  if (!t) return 0;
  t = euro ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The three numbers on a document line that satisfy qty × price = amount.
 * Searching for that beats "the last three numbers", which a stray figure from
 * an overlaid page break would win.
 */
export function findTriple(
  v: number[]
): { qty: number; price: number; amount: number } | null {
  const n = Math.min(v.length, 14);
  let best: { qty: number; price: number; amount: number; score: number } | null = null;
  for (let k = n - 1; k >= 2; k--) {
    const amount = v[k];
    if (!(amount > 0)) continue;
    for (let j = k - 1; j >= 1; j--) {
      const price = v[j];
      if (!(price > 0)) continue;
      for (let i = j - 1; i >= 0; i--) {
        const qty = v[i];
        if (!(qty > 0)) continue;
        if (qty === price && price === amount) continue;
        const err = Math.abs(qty * price - amount);
        if (err > Math.max(0.5, amount * 0.02)) continue;
        if (amount < 1 && qty < 1) continue;
        const score = amount * 1000 - err; // prefer the real money column
        if (!best || score > best.score) best = { qty, price, amount, score };
      }
    }
  }
  return best ? { qty: best.qty, price: best.price, amount: best.amount } : null;
}

const looksLikeProse = (t: string): boolean =>
  t.split(/\s+/).length > 9 ||
  /\b(the|and|of|shall|carrier|conditions|liability|request)\b/i.test(t);

type Collected = PdfRow & { leftCells: PdfCell[] };

function collect(lines: PdfLine[], euro: boolean, preferX: number | null): Collected[] {
  const out: Collected[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].cells;
    if (cells.length < 3) continue;

    // A leading 3–8 digit cell at the far left is the item code, not a quantity.
    let leadCode = "";
    if (/^\d{3,8}$/.test(cells[0].t) && cells[0].x < 120) leadCode = cells[0].t;
    const numCells = cells.filter((c, ci) => isNum(c.t) && !(ci === 0 && leadCode));
    if (numCells.length < 3) continue;
    const firstNumX = numCells[0].x;

    const hit = findTriple(numCells.map((c) => parseNum(c.t, euro)));
    if (!hit) continue;
    const { qty, price, amount } = hit;
    const qtyCell = numCells.find((c) => Math.abs(parseNum(c.t, euro) - qty) < 1e-9);
    const descX = qtyCell ? qtyCell.x : firstNumX;

    let desc = "";
    let descExtra = "";
    let code = leadCode;
    const left = cells.filter(
      (c) =>
        c.x < firstNumX - 2 &&
        !isNum(c.t) &&
        !UOMS.test(c.t) &&
        c.t.length > 2 &&
        !looksLikeProse(c.t)
    );
    if (left.length) {
      let pick = left[left.length - 1];
      if (preferX != null) {
        let best: PdfCell | null = null;
        let bestD = Infinity;
        for (const c of left) {
          const d = Math.abs(c.x - preferX);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        if (best && bestD <= 6) pick = best;
      }
      desc = pick.t.trim();

      // A printed name is usually split across cells — "Fresh Spanish Bronzini"
      // "(" "Seabass) 500" "-" "600". Join the run, but only on a clean table
      // row: an overlaid page drops unrelated text into the same band.
      const band = cells.filter((c) => c.x >= pick.x && c.x < descX - 2);
      const unitish = (t: string) => /^\(?[A-Z]{1,5}\)?$/.test(t);
      while (
        band.length > 2 &&
        unitish(band[band.length - 1].t) &&
        isNum(band[band.length - 2].t)
      )
        band.splice(-2);
      if (band.length > 1 && band.length <= 6 && !band.some((c) => looksLikeProse(c.t)))
        descExtra = band
          .slice(1)
          .map((c) => c.t.trim())
          .filter(Boolean)
          .join(" ");

      // The size often wraps onto the line above, which is what tells
      // "Bronzini 500-600" apart from "Bronzini 1800-2600".
      const prev = i > 0 ? lines[i - 1] : null;
      if (
        prev &&
        prev.cells.length &&
        prev.cells.length <= 12 &&
        prev.cells.filter((c) => isNum(c.t)).length < 3 &&
        prev.cells.every((c) => c.x < firstNumX - 2 && !looksLikeProse(c.t)) &&
        prev.text.length <= 45 &&
        desc.length + descExtra.length + prev.text.length <= 88
      )
        descExtra += (descExtra ? " " : "") + prev.text.trim();
    }

    // PO layouts print "8831 Fresh Spanish Dorade" on the line above the
    // numbers — but only when the line itself carries no code.
    for (let b = 1; b <= 3 && i - b >= 0 && !code; b++) {
      const m = /^(\d{3,8})\s+(.{3,})$/.exec(lines[i - b].text.trim());
      if (m && !looksLikeProse(m[2])) {
        code = m[1];
        if (!desc || isNum(desc) || desc.length < 4) desc = m[2].trim();
        break;
      }
    }
    const lead = /^(\d{3,8})\s+(.{3,})$/.exec(desc);
    if (lead) {
      code = code || lead[1];
      desc = lead[2].trim();
    }
    if (!desc || desc.length < 3 || !/[A-Za-z฀-๿]/.test(desc)) continue;
    if (looksLikeProse(desc)) continue;

    const uom = (cells.map((c) => c.t).find((t) => UOMS.test(t)) ?? "")
      .replace(/[()]/g, "")
      .toUpperCase();
    const fullDesc = `${desc}${descExtra ? ` ${descExtra}` : ""}`
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
      .replace(/\s+/g, " ")
      .trim();

    out.push({
      itemCode: code,
      desc: fullDesc.slice(0, 90),
      qty,
      uom: uom === "K" ? "KG" : uom,
      price,
      amount,
      leftCells: left,
    });
  }
  return out;
}

export function pdfCandidateRows(lines: PdfLine[], euro: boolean): PdfRow[] {
  // Pass 1 finds every plausible description cell; pass 2 keeps only the ones
  // in the column the document actually uses, so overlaid boilerplate cannot
  // win.
  const first = collect(lines, euro, null);
  const tally = new Map<number, number>();
  for (const r of first)
    for (const c of r.leftCells)
      tally.set(Math.round(c.x), (tally.get(Math.round(c.x)) ?? 0) + 1);
  let bestX: number | null = null;
  let bestN = 0;
  for (const [x, n] of tally)
    if (n > bestN || (n === bestN && bestX !== null && x < bestX)) {
      bestX = x;
      bestN = n;
    }
  const rows = bestN >= 2 ? collect(lines, euro, bestX) : first;

  const seen = new Set<string>();
  return rows
    .filter((r) => {
      const k = `${r.desc}|${r.qty}|${r.price}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map(({ leftCells: _leftCells, ...r }) => r);
}

export function pdfHeader(lines: PdfLine[]): PdfHeader {
  const flat = lines.map((l) => l.text);
  const all = flat.join("\n");
  // a document number always carries a digit — keeps words like "ADJUNTA" out
  const g = (re: RegExp): string => {
    const m = re.exec(all);
    if (!m) return "";
    const v = m[1].trim().replace(/\s+/g, "");
    return /\d/.test(v) ? v : "";
  };
  const supplierLine =
    flat.find(
      (t) => /\b(S\.?A\.?U?\.?|CO\.,? ?LTD|B\.?V\.?|GmbH|LLC|A\/S)\b/.test(t) && t.length < 70
    ) ?? "";
  // This SAP PO prints the vendor on the line above its "Supplier Name" label,
  // which catches names with no company suffix that the pattern cannot see.
  let namedSupplier = "";
  const supIdx = flat.findIndex((t) => /Supplier\s*Name/i.test(t));
  if (supIdx > 0) {
    const cand = flat[supIdx - 1].trim();
    if (cand.length >= 3 && cand.length <= 48 && /[A-Za-z]{3}/.test(cand) && !/\d{3,}/.test(cand))
      namedSupplier = cand;
  }
  // "Please ship on" is the date receiving works to; the date at the top of the
  // page is the day the PO was raised.
  let shipOn = "";
  const shipIdx = flat.findIndex((t) => /Please\s*ship\s*on/i.test(t));
  if (shipIdx > 0) {
    const m = /\b(\d{2}\/\d{2}\/\d{4})\b/.exec(flat[shipIdx - 1]);
    if (m) shipOn = m[1];
  }

  return {
    poNo:
      g(/P\.?\s*O\.?\s*No\s*\.?\s*:?\s*([A-Z0-9][A-Z0-9\-\s]{3,12}?)(?:\s*$|\s{2})/im) ||
      g(/N[º°o]\s*pedido\s*:?\s*([A-Z0-9][A-Z0-9-]{3,12})/i),
    invoiceNo:
      g(/N[º°o]\s*ALB\s*:?\s*([A-Z0-9][A-Z0-9\-/]{3,})/i) ||
      g(/(?:Invoice|Factura)\s*(?:No\.?|n[º°o]|Number)?\s*:?\s*([A-Z0-9][A-Z0-9\-/]{4,})/i),
    supplierCode: g(/\b([A-Z]{2}\d{5,8})\b/),
    supplierName:
      namedSupplier ||
      (/^([A-Z][A-Za-z&.,'\- ]{3,40}?(?:S\.?A\.?U?\.?|CO\.,? ?LTD|B\.?V\.?|GmbH|LLC|A\/S))/.exec(
        supplierLine.trim()
      ) ?? [, ""])[1]!.trim(),
    currency: (/\b(EUR|USD|THB|GBP|JPY|SGD)\b/.exec(all) ?? [, ""])[1] ?? "",
    deliveryDate: shipOn || (/\b(\d{2}\/\d{2}\/\d{4})\b/.exec(all) ?? [, ""])[1] || "",
  };
}

export type PdfRead = {
  header: PdfHeader;
  rows: PdfRow[];
  lineCount: number;
  euro: boolean;
};

/** Read a PDF into candidate document rows. Throws when there is no text. */
export async function readPdf(bytes: Uint8Array): Promise<PdfRead> {
  const { items } = await extractTextItems(bytes);
  const flat = items.flat();
  if (!flat.length || flat.every((i) => !norm(i.str))) {
    throw new Error(
      "This PDF has no text in it — it is a scan or a photo. Ask the supplier for the Excel or CSV export, or type the lines in by hand."
    );
  }
  const lines = linesFromItems(flat);
  const euro = detectEuroNumbers(lines);
  return { header: pdfHeader(lines), rows: pdfCandidateRows(lines, euro), lineCount: lines.length, euro };
}
