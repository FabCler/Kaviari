/**
 * Reading a shipment out of the database into the shape the rules engine
 * works on, and matching a document line to the item master on the way in.
 */

import { prisma } from "@/lib/db";
import { keyOf, norm } from "@/lib/format";
import {
  aggregate,
  lineKey,
  type ItemRec,
  type Line,
  type Workspace,
} from "@/lib/domain";
import type { ParsedRow } from "@/lib/import/columns";

export type ItemIndex = {
  byKey: Map<string, ItemRec>;
  links: {
    supplierCode: string;
    supplierItemCode: string;
    supplierItemName: string;
    barcode: string;
  }[];
};

/**
 * CodeBars is the master key; the SAP item code is a second way in, so a PO
 * priced by item code and an invoice scanned by barcode still meet on the same
 * line.
 */
export async function loadItemIndex(): Promise<ItemIndex> {
  const [items, links] = await Promise.all([
    prisma.item.findMany(),
    prisma.supplierLink.findMany({ include: { item: true } }),
  ]);
  const byKey = new Map<string, ItemRec>();
  for (const it of items) {
    const rec: ItemRec = {
      barcode: it.barcode,
      itemCode: it.itemCode,
      nameTh: it.nameTh,
      nameEn: it.nameEn,
      uom: it.uom,
    };
    const b = keyOf(it.barcode);
    const c = keyOf(it.itemCode);
    if (b && !byKey.has(b)) byKey.set(b, rec);
    if (c && !byKey.has(c)) byKey.set(c, rec);
  }
  return {
    byKey,
    links: links.map((l) => ({
      supplierCode: l.supplierCode,
      supplierItemCode: l.supplierItemCode,
      supplierItemName: l.supplierItemName,
      barcode: l.item.barcode,
    })),
  };
}

/**
 * What a document line is about. A supplier invoices under its own product
 * name — "DORADA 500-600 10K" where SAP says 8831 — so the supplier links are
 * tried when neither code lands on a master item.
 */
export function resolveItem(
  index: ItemIndex,
  row: Pick<ParsedRow, "barcode" | "itemCode" | "itemDesc">,
  supplierCode: string
): { barcode: string; rawItem: string } {
  const rawItem = norm(row.barcode) || norm(row.itemCode) || norm(row.itemDesc);
  const direct =
    index.byKey.get(keyOf(row.barcode)) ?? index.byKey.get(keyOf(row.itemCode));
  if (direct) return { barcode: direct.barcode, rawItem };

  const sc = keyOf(supplierCode);
  // a link with no supplier code is a wildcard: it matches any supplier
  const forSupplier = (l: ItemIndex["links"][number]) =>
    !l.supplierCode || !sc || keyOf(l.supplierCode) === sc;
  const code = keyOf(row.itemCode) || keyOf(row.barcode);
  const name = keyOf(row.itemDesc);

  let hit =
    index.links.find((l) => forSupplier(l) && code && keyOf(l.supplierItemCode) === code) ??
    index.links.find((l) => forSupplier(l) && name && keyOf(l.supplierItemName) === name);
  if (!hit && name)
    hit = index.links.find(
      (l) =>
        forSupplier(l) &&
        l.supplierItemName &&
        (name.includes(keyOf(l.supplierItemName)) ||
          keyOf(l.supplierItemName).includes(name))
    );
  return { barcode: hit ? hit.barcode : "", rawItem };
}

export type ShipmentWorkspace = {
  shipment: {
    id: string;
    code: string;
    eta: Date | null;
    mode: string;
    tolerancePct: number;
    notes: string;
    status: string;
  };
  lines: Line[];
};

export async function loadShipmentLines(
  shipmentId: string
): Promise<ShipmentWorkspace | null> {
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) return null;

  const [po, invoice, so, lineStates, resolutions, index] = await Promise.all([
    prisma.poLine.findMany({ where: { shipmentId } }),
    prisma.invoiceLine.findMany({ where: { shipmentId } }),
    prisma.soLine.findMany({ where: { shipmentId } }),
    prisma.lineState.findMany({ where: { shipmentId } }),
    prisma.resolution.findMany({ where: { shipmentId } }),
    loadItemIndex(),
  ]);

  const ws: Workspace = {
    shipmentCode: shipment.code,
    tolerancePct: shipment.tolerancePct,
    po: po.map((r) => ({
      id: r.id,
      supplierCode: r.supplierCode,
      supplierName: r.supplierName,
      itemBarcode: r.itemBarcode,
      rawItem: r.rawItem,
      itemDesc: r.itemDesc,
      qty: r.qty,
      uom: r.uom,
      price: r.price,
      currency: r.currency,
      moq: r.moq,
      variableWeight: r.variableWeight,
    })),
    invoice: invoice.map((r) => ({
      id: r.id,
      supplierCode: r.supplierCode,
      supplierName: r.supplierName,
      itemBarcode: r.itemBarcode,
      rawItem: r.rawItem,
      itemDesc: r.itemDesc,
      qty: r.qty,
      uom: r.uom,
      price: r.price,
      currency: r.currency,
    })),
    so: so.map((r) => ({
      id: r.id,
      soNo: r.soNo,
      customerCode: r.customerCode,
      customerName: r.customerName,
      itemBarcode: r.itemBarcode,
      rawItem: r.rawItem,
      itemDesc: r.itemDesc,
      qty: r.qty,
      revisedQty: r.revisedQty,
      sapUpdated: r.sapUpdated,
      uom: r.uom,
      supplierCode: r.supplierCode,
    })),
    items: index.byKey,
    lineStates: new Map(
      lineStates.map((s) => [
        lineKey(s.supplierCode, s.itemKey),
        { freeStockQty: s.freeStockQty, rootCause: s.rootCause },
      ])
    ),
    resolutions: new Set(
      resolutions.map((r) => `${lineKey(r.supplierCode, r.itemKey)}|${r.issueType}`)
    ),
  };

  return { shipment, lines: aggregate(ws) };
}

/** Every open shipment with its lines — the dashboard and the lane screens. */
export async function loadAllLines(shipmentId?: string): Promise<ShipmentWorkspace[]> {
  const shipments = await prisma.shipment.findMany({
    where: shipmentId ? { id: shipmentId } : undefined,
    orderBy: [{ eta: "asc" }, { code: "asc" }],
  });
  const out: ShipmentWorkspace[] = [];
  for (const s of shipments) {
    const ws = await loadShipmentLines(s.id);
    if (ws) out.push(ws);
  }
  return out;
}
