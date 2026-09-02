/**
 * The validation engine: SAP PO ↔ supplier invoice ↔ customer SO, grouped by
 * shipment / supplier / item, with the exception each desk owns.
 *
 * It is a pure function over plain rows so the rules can be unit-tested
 * without a database, and so a screen never has to re-derive them.
 *
 * The lanes a line moves through:
 *   HOLD            — a document is still missing; nothing can be reviewed
 *   PURCHASE REVIEW — PO against supplier invoice (Purchasing's question)
 *   SALE REVIEW     — invoice against customer demand (the commercial desks)
 *   READY           — every desk has confirmed; DC2 may receive it
 */

import { close, fmt, fmt2, keyOf, norm, num, pct, r2, same2 } from "@/lib/format";

export const ROOT_CAUSES = [
  "MOQ / carton rounding",
  "Supplier over-shipped",
  "Variable weight tolerance",
  "Purchasing agreed a larger quantity",
  "Customer reduced the order after the PO",
] as const;

export const STATUSES = [
  "HOLD",
  "PURCHASE REVIEW",
  "SALE REVIEW",
  "READY",
] as const;
export type Status = (typeof STATUSES)[number];

export type IssueLane = "po" | "so";

export type Issue = {
  type: string;
  owner: string;
  severity: "HOLD" | "REVIEW";
  /** manual: a desk ticks it off. Otherwise it clears when the data does. */
  manual: boolean;
  detail: string;
  lane: IssueLane;
};

export type DocRow = {
  id: string;
  supplierCode: string;
  supplierName: string;
  itemBarcode: string;
  rawItem: string;
  itemDesc: string;
  qty: number;
  uom: string;
  price: number;
  currency: string;
  moq?: number;
  variableWeight?: boolean;
};

export type SoRow = {
  id: string;
  soNo: string;
  customerCode: string;
  customerName: string;
  itemBarcode: string;
  rawItem: string;
  itemDesc: string;
  qty: number;
  revisedQty: number;
  sapUpdated: boolean;
  uom: string;
  supplierCode: string;
};

export type ItemRec = {
  barcode: string;
  itemCode: string;
  nameTh: string;
  nameEn: string;
  uom: string;
};

export type LineStateRec = { freeStockQty: number; rootCause: string };

export type Workspace = {
  shipmentCode: string;
  tolerancePct: number;
  po: DocRow[];
  invoice: DocRow[];
  so: SoRow[];
  /** master items by CodeBars and by SAP item code, both upper-cased */
  items: Map<string, ItemRec>;
  /** `${supplierCode}|${itemKey}` → decisions recorded on that line */
  lineStates: Map<string, LineStateRec>;
  /** `${supplierCode}|${itemKey}|${issueType}` for every ticked exception */
  resolutions: Set<string>;
};

export type Line = {
  key: string;
  itemKey: string;
  shipmentCode: string;
  supplierCode: string;
  supplierName: string;
  itemCode: string;
  barcode: string;
  /** CodeBars where the item is known, otherwise whatever the document said */
  mainCode: string;
  itemDesc: string;
  inMaster: boolean;
  uom: string;
  currency: string;
  poQty: number;
  invQty: number;
  soQty: number;
  revisedSoQty: number;
  freeQty: number;
  poPrice: number;
  invPrice: number;
  moq: number;
  variableWeight: boolean;
  rootCause: string;
  poDiffers: boolean;
  poInvVar: number;
  soVar: number;
  allocationBalance: number;
  changedCount: number;
  pendingSapCount: number;
  missingDocs: string[];
  soRows: SoRow[];
  ambiguousSo: SoRow[];
  issues: Issue[];
  unresolved: Issue[];
  status: Status;
};

/** The identity a document line is grouped by. */
export function itemKeyOf(row: { itemBarcode?: string; rawItem?: string }): string {
  return keyOf(norm(row.itemBarcode) || norm(row.rawItem));
}

export function lineKey(supplierCode: string, itemKey: string): string {
  return `${keyOf(supplierCode)}|${itemKey}`;
}

function weightedPrice(rows: DocRow[]): number {
  if (!rows.length) return 0;
  const q = rows.reduce((a, b) => a + num(b.qty), 0);
  if (!q) return rows.reduce((a, b) => a + num(b.price), 0) / rows.length;
  return rows.reduce((a, b) => a + num(b.qty) * num(b.price), 0) / q;
}

type Bucket = { rows: DocRow[]; qty: number; head: DocRow };

function bucket(rows: DocRow[]): Map<string, Bucket> {
  const out = new Map<string, Bucket>();
  for (const r of rows) {
    const k = lineKey(r.supplierCode, itemKeyOf(r));
    const b = out.get(k);
    if (b) {
      b.rows.push(r);
      b.qty += num(r.qty);
    } else {
      out.set(k, { rows: [r], qty: num(r.qty), head: r });
    }
  }
  return out;
}

export const soChanged = (r: SoRow): boolean => !close(r.revisedQty, r.qty, 0.0001);

export function aggregate(ws: Workspace): Line[] {
  const po = bucket(ws.po);
  const inv = bucket(ws.invoice);

  // Which suppliers carry an item on this shipment, and which customer SOs ask
  // for it — worked out once instead of re-filtering inside the loop.
  const supByItem = new Map<string, Set<string>>();
  const soByItem = new Map<string, SoRow[]>();
  for (const r of [...ws.po, ...ws.invoice]) {
    const k = itemKeyOf(r);
    const set = supByItem.get(k) ?? new Set<string>();
    set.add(keyOf(r.supplierCode));
    supByItem.set(k, set);
  }
  for (const r of ws.so) {
    const k = itemKeyOf(r);
    const list = soByItem.get(k);
    if (list) list.push(r);
    else soByItem.set(k, [r]);
  }

  const out: Line[] = [];
  for (const k of new Set([...po.keys(), ...inv.keys()])) {
    const p = po.get(k);
    const i = inv.get(k);
    const src = (p ?? i)!.head;
    const supplier = norm(src.supplierCode);
    const ikey = itemKeyOf(src);
    const master =
      ws.items.get(keyOf(src.itemBarcode)) ?? ws.items.get(keyOf(src.rawItem));

    const candidates = supByItem.get(ikey) ?? new Set<string>();
    const allSo = soByItem.get(ikey) ?? [];
    // An SO belongs to this supplier when it says so, or when the item comes
    // from only one supplier on the shipment.
    const soRows = allSo.filter((x) =>
      norm(x.supplierCode)
        ? keyOf(x.supplierCode) === keyOf(supplier)
        : candidates.size === 1
    );
    const ambiguousSo = allSo.filter(
      (x) => !norm(x.supplierCode) && candidates.size > 1
    );

    const poQty = p?.qty ?? 0;
    const invQty = i?.qty ?? 0;
    const soQty = soRows.reduce((a, b) => a + num(b.qty), 0);
    const revisedSoQty = soRows.reduce((a, b) => a + num(b.revisedQty), 0);

    const state = ws.lineStates.get(k) ?? { freeStockQty: 0, rootCause: "" };
    const freeQty = num(state.freeStockQty);
    const rootCause = norm(state.rootCause);
    const allocationBalance = invQty - revisedSoQty - freeQty;

    const changed = soRows.filter(soChanged);
    const pendingSap = changed.filter((r) => !r.sapUpdated);

    const poDiffers = !!(p && i && !same2(invQty, poQty));
    const poInvVar = poQty ? ((invQty - poQty) / poQty) * 100 : invQty ? 100 : 0;
    // The allocation gap is measured against the confirmed invoice quantity.
    const soVar = invQty ? ((invQty - soQty) / invQty) * 100 : soQty ? -100 : 0;

    const issues: Issue[] = [];
    const add = (
      type: string,
      owner: string,
      severity: Issue["severity"] = "HOLD",
      manual = true,
      detail = "",
      lane: IssueLane = "so"
    ) => issues.push({ type, owner, severity, manual, detail, lane });

    if (!p)
      add("PO missing", "Purchasing", "HOLD", true,
        "No SAP PO found for this supplier/item.", "po");
    if (!i)
      add("Invoice missing", "Purchasing", "HOLD", true,
        "No supplier invoice found for this supplier/item.", "po");

    if (p && i) {
      if (!same2(invQty, poQty))
        add("PO/invoice qty differs", "Purchasing", "HOLD", true,
          `PO ${fmt2(poQty)} vs invoice ${fmt2(invQty)} (${fmt2(r2(invQty - poQty))} apart at 2 decimals).`,
          "po");
      if (keyOf(p.head.currency) !== keyOf(i.head.currency))
        add("Currency mismatch", "Purchasing", "HOLD", true,
          `PO ${p.head.currency || "-"} vs invoice ${i.head.currency || "-"}.`, "po");
      if (!same2(weightedPrice(p.rows), weightedPrice(i.rows)))
        add("Price mismatch", "Purchasing", "HOLD", true,
          `PO ${fmt(weightedPrice(p.rows))} vs invoice ${fmt(weightedPrice(i.rows))}.`, "po");
      if (norm(p.head.uom) && norm(i.head.uom) && keyOf(p.head.uom) !== keyOf(i.head.uom))
        add("UOM conversion required", "Purchasing", "HOLD", true,
          `PO is in ${p.head.uom || "-"} but the invoice is in ${i.head.uom || "-"}. Convert the document to one unit before release.`,
          "po");
    }

    if (ambiguousSo.length)
      add("SO supplier allocation required", "Customer Service", "HOLD", false,
        "Assign each customer SO to the correct supplier.");

    const variable = !!p?.head.variableWeight;
    const moq = num(p?.head.moq ?? 0);
    const tol = num(ws.tolerancePct) || 10;

    if (i) {
      if (!soRows.length) {
        add("No customer SO allocation", "Sales", "HOLD", true,
          "No customer Sales Orders are assigned to this supplier/item.");
      } else {
        if (!close(invQty, soQty, 0.0001)) {
          if (Math.abs(soVar) > tol)
            add("SO variance > tolerance", "Sales", "HOLD", true,
              `Invoice ${fmt2(invQty)} vs original SO ${fmt(soQty)} (${pct(soVar)} of invoice) exceeds the ${fmt(tol)}% tolerance.`);
          else if (!variable)
            add("Fixed quantity difference", "Sales/CS", "HOLD", true,
              `This is a fixed-quantity item, so any difference needs manual review. Invoice ${fmt2(invQty)} vs SO ${fmt(soQty)}.`);
        }
        // An invoice above both the PO and customer demand needs a reason on
        // the record before the goods are released.
        if (poDiffers && invQty > soQty + 0.01 && !rootCause)
          add("MOQ excess - select root cause", "Purchasing", "REVIEW", false,
            `Invoice ${fmt2(invQty)} exceeds both the PO ${fmt2(poQty)} and customer SO demand ${fmt(soQty)}. Record why before release.`,
            "po");
        if (!close(allocationBalance, 0, 0.01))
          add("SO adjustment not balanced", "Customer Service", "REVIEW", false,
            `Remaining ${fmt2(r2(allocationBalance))} ${p?.head.uom || i.head.uom || ""}. Adjust individual SOs${freeQty ? " / free stock" : ""} until the balance is zero.`);
        if (pendingSap.length)
          add("SAP SO updates pending", "Customer Service", "REVIEW", false,
            `${pendingSap.length} changed SO line(s) still need to be updated in SAP.`);
      }

      if (moq > 0) {
        const bad = soRows.filter((x) => {
          const q = num(x.revisedQty);
          return q + 0.01 < moq || Math.abs(q / moq - Math.round(q / moq)) > 0.001;
        });
        if (bad.length)
          add("MOQ/carton mismatch", "Sales", "HOLD", true,
            `MOQ/carton ${fmt(moq)} ${p?.head.uom || i.head.uom || ""}; check ${bad.map((x) => x.soNo).join(", ")}.`);
      }
      if (freeQty > 0)
        add("Free stock approval", "Sales", "HOLD", true,
          `${fmt(freeQty)} ${p?.head.uom || i.head.uom || ""} is being held as free stock.`);
    }

    const unresolved = issues.filter((x) =>
      x.manual ? !ws.resolutions.has(`${k}|${x.type}`) : true
    );

    // Nothing can be reviewed until all three documents are in.
    const docsComplete = !!p && !!i && soRows.length > 0;
    let status: Status = "READY";
    if (!docsComplete) status = "HOLD";
    else if (unresolved.some((x) => x.lane === "po")) status = "PURCHASE REVIEW";
    else if (unresolved.length) status = "SALE REVIEW";

    const missingDocs = [
      !p ? "PO" : null,
      !i ? "Invoice" : null,
      !soRows.length ? "SO" : null,
    ].filter(Boolean) as string[];

    out.push({
      key: k,
      itemKey: ikey,
      shipmentCode: ws.shipmentCode,
      supplierCode: supplier,
      supplierName: p?.head.supplierName || i?.head.supplierName || "",
      itemCode: master?.itemCode || norm(src.rawItem),
      barcode: master?.barcode || norm(src.itemBarcode),
      mainCode:
        master?.barcode || norm(src.itemBarcode) || master?.itemCode || norm(src.rawItem),
      itemDesc:
        master?.nameEn || master?.nameTh || p?.head.itemDesc || i?.head.itemDesc || "",
      inMaster: !!master,
      uom: p?.head.uom || i?.head.uom || "",
      currency: i?.head.currency || p?.head.currency || "",
      poQty,
      invQty,
      soQty,
      revisedSoQty,
      freeQty,
      poPrice: p ? weightedPrice(p.rows) : 0,
      invPrice: i ? weightedPrice(i.rows) : 0,
      moq,
      variableWeight: variable,
      rootCause,
      poDiffers,
      poInvVar,
      soVar,
      allocationBalance,
      changedCount: changed.length,
      pendingSapCount: pendingSap.length,
      missingDocs,
      soRows,
      ambiguousSo,
      issues,
      unresolved,
      status,
    });
  }

  return out.sort(
    (a, b) =>
      a.supplierCode.localeCompare(b.supplierCode) ||
      a.mainCode.localeCompare(b.mainCode)
  );
}

export function shipmentStatus(lines: Line[]): Status {
  if (!lines.length) return "HOLD";
  if (lines.every((l) => l.status === "READY")) return "READY";
  if (lines.some((l) => l.status === "HOLD")) return "HOLD";
  if (lines.some((l) => l.status === "PURCHASE REVIEW")) return "PURCHASE REVIEW";
  return "SALE REVIEW";
}
