"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { record } from "@/lib/audit";
import { mapRows, type DocKind } from "@/lib/import/columns";
import { readMatrix } from "@/lib/import/read";
import { loadItemIndex, resolveItem } from "@/lib/workspace";
import { norm } from "@/lib/format";
import { readPdf } from "@/lib/import/pdf";
import { z } from "zod";

export type ImportResult =
  | { ok: true; rows: number; unmatched: number; source: string }
  | { ok: false; error: string };

const KINDS: DocKind[] = ["po", "invoice", "so"];

/** Refuses a second import of the same file into the same shipment. */
async function duplicateOf(shipmentId: string, kind: DocKind, source: string) {
  return prisma.importBatch.findFirst({
    where: { shipmentId, kind, source },
    orderBy: { createdAt: "desc" },
  });
}

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
  const twin = await duplicateOf(shipmentId, kind, file.name);
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

// ---------------------------------------------------------------- PDF

export type PdfPreviewRow = {
  /** what the app matched it to, empty when nothing matched */
  barcode: string;
  itemCode: string;
  itemDesc: string;
  qty: number;
  uom: string;
  price: number;
  amount: number;
};

export type PdfPreview =
  | {
      ok: true;
      source: string;
      docNo: string;
      supplierName: string;
      currency: string;
      rows: PdfPreviewRow[];
      lineCount: number;
    }
  | { ok: false; error: string };

/**
 * A PDF is a drawing, so what comes out of it is a proposal, not data: it is
 * returned for the desk to check and correct, and nothing is written until
 * they confirm the rows.
 */
export async function parsePdf(formData: FormData): Promise<PdfPreview> {
  await requireSection("imports");
  const kind = String(formData.get("kind") ?? "") as DocKind;
  const supplierCode = norm(formData.get("supplierCode"));
  const file = formData.get("file");
  if (!KINDS.includes(kind)) return { ok: false, error: "Choose what the file holds." };
  if (!(file instanceof File) || !file.size)
    return { ok: false, error: "Choose a file to read." };
  if (file.size > 15 * 1024 * 1024)
    return { ok: false, error: "That file is larger than 15 MB." };

  let read;
  try {
    read = await readPdf(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "That PDF could not be read.",
    };
  }
  if (!read.rows.length)
    return {
      ok: false,
      error:
        "No document lines could be read from that PDF. Its rows have to show quantity, unit price and amount — otherwise use the Excel or CSV export.",
    };

  const index = await loadItemIndex();
  const rows: PdfPreviewRow[] = read.rows.map((r) => {
    const { barcode } = resolveItem(
      index,
      { barcode: "", itemCode: r.itemCode, itemDesc: r.desc },
      supplierCode || read.header.supplierCode
    );
    return {
      barcode,
      itemCode: r.itemCode,
      itemDesc: r.desc,
      qty: r.qty,
      uom: r.uom || "KG",
      price: r.price,
      amount: r.amount,
    };
  });

  return {
    ok: true,
    source: file.name,
    docNo: kind === "invoice" ? read.header.invoiceNo : read.header.poNo,
    supplierName: read.header.supplierName,
    currency: read.header.currency,
    rows,
    lineCount: read.lineCount,
  };
}

const confirmSchema = z.object({
  shipmentId: z.string().min(1),
  kind: z.enum(["po", "invoice", "so"]),
  supplierCode: z.string().max(60),
  docNo: z.string().max(60),
  currency: z.string().max(10),
  source: z.string().min(1).max(200),
  rows: z
    .array(
      z.object({
        barcode: z.string().max(60),
        itemCode: z.string().max(60),
        itemDesc: z.string().max(200),
        qty: z.number().min(0).max(1_000_000),
        uom: z.string().max(20),
        price: z.number().min(0).max(1_000_000),
      })
    )
    .min(1)
    .max(500),
});

export type ConfirmPayload = z.infer<typeof confirmSchema>;

/** Writing the rows a desk confirmed on the PDF preview. */
export async function importParsedRows(
  payload: ConfirmPayload
): Promise<ImportResult> {
  const user = await requireSection("imports");
  const parsed = confirmSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Those lines could not be read." };
  const { shipmentId, kind, supplierCode, docNo, currency, source, rows } = parsed.data;

  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) return { ok: false, error: "That shipment no longer exists." };
  const twin = await duplicateOf(shipmentId, kind, source);
  if (twin)
    return {
      ok: false,
      error: `${source} was already imported into ${shipment.code} on ${twin.createdAt
        .toISOString()
        .slice(0, 10)} (${twin.rows} lines). Remove that import below first if you are replacing it.`,
    };

  const index = await loadItemIndex();
  const batch = await prisma.importBatch.create({
    data: {
      shipmentId,
      kind,
      supplierCode,
      source,
      rows: rows.length,
      importedById: user.id,
    },
  });

  let unmatched = 0;
  const resolved = rows.map((r) => {
    // the desk may have typed a CodeBars in the preview; look it up again
    const hit = resolveItem(
      index,
      { barcode: r.barcode, itemCode: r.itemCode, itemDesc: r.itemDesc },
      supplierCode
    );
    if (!hit.barcode) unmatched += 1;
    return { row: r, barcode: hit.barcode, rawItem: hit.rawItem };
  });

  if (kind === "po") {
    await prisma.poLine.createMany({
      data: resolved.map(({ row, barcode, rawItem }) => ({
        shipmentId,
        batchId: batch.id,
        poNo: docNo,
        supplierCode,
        supplierName: "",
        rawItem,
        itemBarcode: barcode,
        itemDesc: row.itemDesc,
        qty: row.qty,
        uom: row.uom,
        price: row.price,
        currency,
      })),
    });
  } else if (kind === "invoice") {
    await prisma.invoiceLine.createMany({
      data: resolved.map(({ row, barcode, rawItem }) => ({
        shipmentId,
        batchId: batch.id,
        invoiceNo: docNo,
        supplierCode,
        supplierName: "",
        rawItem,
        itemBarcode: barcode,
        itemDesc: row.itemDesc,
        qty: row.qty,
        uom: row.uom,
        price: row.price,
        currency,
      })),
    });
  } else {
    await prisma.soLine.createMany({
      data: resolved.map(({ row, barcode, rawItem }) => ({
        shipmentId,
        batchId: batch.id,
        soNo: docNo,
        customerCode: "",
        customerName: "",
        rawItem,
        itemBarcode: barcode,
        itemDesc: row.itemDesc,
        qty: row.qty,
        revisedQty: row.qty,
        uom: row.uom,
        supplierCode,
      })),
    });
  }

  await record(
    user.id,
    `import.${kind}.pdf`,
    shipment.code,
    `${rows.length} rows from ${source}${unmatched ? `, ${unmatched} unmatched` : ""}`
  );
  revalidatePath("/imports");
  revalidatePath("/validation");
  revalidatePath("/");
  return { ok: true, rows: rows.length, unmatched, source };
}
