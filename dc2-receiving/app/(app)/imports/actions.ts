"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { record } from "@/lib/audit";
import { mapRows, type DocKind } from "@/lib/import/columns";
import { readMatrix } from "@/lib/import/read";
import { loadItemIndex, resolveItem } from "@/lib/workspace";
import { norm } from "@/lib/format";

export type ImportResult =
  | { ok: true; rows: number; unmatched: number; source: string }
  | { ok: false; error: string };

const KINDS: DocKind[] = ["po", "invoice", "so"];

/**
 * One file becomes one batch, so a wrong export can be removed in a single
 * step. Items are matched to the master here, once, rather than on every
 * screen that reads the line back.
 */
export async function importDocument(formData: FormData): Promise<ImportResult> {
  const user = await requireSection("imports");

  const shipmentId = String(formData.get("shipmentId") ?? "");
  const kind = String(formData.get("kind") ?? "") as DocKind;
  const supplierCode = norm(formData.get("supplierCode"));
  const file = formData.get("file");

  if (!KINDS.includes(kind)) return { ok: false, error: "Choose what the file holds." };
  if (!shipmentId) return { ok: false, error: "Choose the shipment first." };
  if (!(file instanceof File) || !file.size)
    return { ok: false, error: "Choose a file to import." };
  if (file.size > 15 * 1024 * 1024)
    return { ok: false, error: "That file is larger than 15 MB." };

  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) return { ok: false, error: "That shipment no longer exists." };

  let matrix;
  try {
    matrix = readMatrix(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "That file could not be read.",
    };
  }

  const rows = mapRows(matrix, kind);
  if (!rows.length)
    return {
      ok: false,
      error:
        "No usable rows. Check that the first row holds the column headers (Item Code / CodeBars, Quantity, …).",
    };

  // Importing the same export twice silently doubles the expected quantity —
  // exactly the kind of error this app exists to catch — so the second one is
  // refused until the first is removed.
  const twin = await prisma.importBatch.findFirst({
    where: { shipmentId, kind, source: file.name },
    orderBy: { createdAt: "desc" },
  });
  if (twin) {
    return {
      ok: false,
      error: `${file.name} was already imported into ${shipment.code} on ${twin.createdAt
        .toISOString()
        .slice(0, 10)} (${twin.rows} lines). Remove that import below first if you are replacing it.`,
    };
  }

  const index = await loadItemIndex();
  const batch = await prisma.importBatch.create({
    data: {
      shipmentId,
      kind,
      supplierCode,
      source: file.name,
      rows: rows.length,
      importedById: user.id,
    },
  });

  let unmatched = 0;
  const resolved = rows.map((r) => {
    const sup = norm(r.supplierCode) || supplierCode;
    const { barcode, rawItem } = resolveItem(index, r, sup);
    if (!barcode) unmatched += 1;
    return { row: r, sup, barcode, rawItem };
  });

  if (kind === "po") {
    await prisma.poLine.createMany({
      data: resolved.map(({ row, sup, barcode, rawItem }) => ({
        shipmentId,
        batchId: batch.id,
        poNo: row.docNo,
        supplierCode: sup,
        supplierName: row.supplierName,
        rawItem,
        itemBarcode: barcode,
        itemDesc: row.itemDesc,
        qty: row.qty,
        uom: row.uom,
        price: row.price,
        currency: row.currency,
        moq: row.moq,
        variableWeight: row.variableWeight,
      })),
    });
  } else if (kind === "invoice") {
    await prisma.invoiceLine.createMany({
      data: resolved.map(({ row, sup, barcode, rawItem }) => ({
        shipmentId,
        batchId: batch.id,
        invoiceNo: row.docNo,
        supplierCode: sup,
        supplierName: row.supplierName,
        rawItem,
        itemBarcode: barcode,
        itemDesc: row.itemDesc,
        qty: row.qty,
        uom: row.uom,
        price: row.price,
        currency: row.currency,
      })),
    });
  } else {
    await prisma.soLine.createMany({
      data: resolved.map(({ row, barcode, rawItem }) => ({
        shipmentId,
        batchId: batch.id,
        soNo: row.docNo,
        customerCode: row.customerCode,
        customerName: row.customerName,
        rawItem,
        itemBarcode: barcode,
        itemDesc: row.itemDesc,
        qty: row.qty,
        // nothing is allocated yet: the revised quantity starts at the order
        revisedQty: row.qty,
        uom: row.uom,
        // an SO carries a supplier only when the export names one
        supplierCode: norm(row.supplierCode),
      })),
    });
  }

  await record(
    user.id,
    `import.${kind}`,
    shipment.code,
    `${rows.length} rows from ${file.name}${unmatched ? `, ${unmatched} unmatched` : ""}`
  );
  revalidatePath("/imports");
  revalidatePath("/validation");
  revalidatePath("/");
  return { ok: true, rows: rows.length, unmatched, source: file.name };
}

export async function deleteBatch(
  batchId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireSection("imports");
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    include: { shipment: true },
  });
  if (!batch) return { ok: false, error: "That import no longer exists." };
  // The lines go with it: an import is undone whole, never half.
  await prisma.$transaction([
    prisma.poLine.deleteMany({ where: { batchId } }),
    prisma.invoiceLine.deleteMany({ where: { batchId } }),
    prisma.soLine.deleteMany({ where: { batchId } }),
    prisma.importBatch.delete({ where: { id: batchId } }),
  ]);
  await record(user.id, "import.delete", batch.shipment.code, batch.source);
  revalidatePath("/imports");
  revalidatePath("/validation");
  revalidatePath("/");
  return { ok: true };
}
