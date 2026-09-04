import { osms } from "@/lib/osms/db";
import { requirePermission, isResponse } from "@/lib/osms/guard";
import { MAX_FILE_BYTES } from "@/lib/import/types";
import { ImportParseError } from "@/lib/import/parse";
import { extractInvoice, matchInvoiceToPo } from "@/lib/osms/import/invoice";
import { auditEvent } from "@/lib/osms/audit";
import { notify } from "@/lib/osms/notify";
import { raiseException } from "@/lib/osms/exceptions";

export const dynamic = "force-dynamic";

/**
 * §1.3 — upload a supplier invoice. The file is read, the extraction is
 * stored verbatim and the invoice waits at `pending_verification` until
 * purchasing confirms it line by line.
 */
export async function POST(request: Request) {
  const actor = await requirePermission("import.invoice");
  if (isResponse(actor)) return actor;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const poIdInput = String(form?.get("poId") ?? "").trim() || null;

  if (!(file instanceof File)) {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json(
      { error: `The file is larger than ${Math.round(MAX_FILE_BYTES / 1_000_000)} MB.` },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let extraction;
  try {
    extraction = await extractInvoice(buffer, file.name);
  } catch (error) {
    if (error instanceof ImportParseError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  // Resolve the PO: the one chosen in the UI wins over the printed number.
  let po = poIdInput
    ? await osms.purchaseOrder.findUnique({ where: { id: poIdInput } })
    : null;
  if (!po && extraction.poNumber) {
    po = await osms.purchaseOrder.findUnique({
      where: { poNumber: extraction.poNumber.trim() },
    });
  }

  const supplier =
    (po
      ? await osms.supplier.findUnique({ where: { id: po.supplierId } })
      : null) ??
    (extraction.supplierCode
      ? await osms.supplier.findUnique({
          where: { code: extraction.supplierCode.trim().toUpperCase() },
        })
      : null);

  const invoiceNumber =
    extraction.invoiceNumber?.trim() ||
    `DRAFT-${file.name.replace(/\.[^.]+$/, "").slice(0, 24)}-${Date.now().toString(36)}`;

  const duplicate = supplier
    ? await osms.invoice.findFirst({
        where: { invoiceNumber, supplierId: supplier.id },
      })
    : null;
  if (duplicate) {
    return Response.json(
      {
        error: `Invoice ${invoiceNumber} from this supplier is already in the system.`,
        invoiceId: duplicate.id,
      },
      { status: 409 }
    );
  }

  const invoice = await osms.invoice.create({
    data: {
      invoiceNumber,
      supplierId: supplier?.id ?? null,
      poId: po?.id ?? null,
      supplierCodeRaw: extraction.supplierCode,
      supplierNameRaw: extraction.supplierName,
      poNumberRaw: extraction.poNumber,
      invoiceDate: extraction.invoiceDate,
      deliveryDate: extraction.deliveryDate,
      currency: extraction.currency,
      status: extraction.lines.length > 0 ? "pending_verification" : "extracted",
      fileName: file.name,
      fileSize: file.size,
      extractionRaw: extraction.raw ? JSON.stringify(extraction.raw) : null,
      extractionMode: extraction.mode,
      uploadedById: actor.id,
      uploadedByName: actor.name,
      lines: {
        create: extraction.lines.map((line) => ({
          lineNo: line.lineNo,
          productId: line.productId,
          productCodeRaw: line.productCodeRaw,
          descriptionRaw: line.descriptionRaw,
          quantity: line.quantity,
          unit: line.unit,
          baseQuantity: line.baseQuantity,
          unitPrice: line.unitPrice,
          priceUnit: line.priceUnit,
          currency: line.currency,
          deliveryDate: line.deliveryDate,
        })),
      },
    },
  });

  // Keep the raw document text for the audit file.
  await osms.attachment.create({
    data: {
      entity: "invoice",
      entityId: invoice.id,
      fileName: file.name,
      mimeType: file.type || null,
      size: file.size,
      uploadedByName: actor.name,
    },
  });

  if (po) await matchInvoiceToPo(invoice.id);

  if (!po) {
    await raiseException({
      type: "INVOICE_WITHOUT_PO",
      severity: "high",
      documentType: "invoice",
      documentId: invoice.id,
      documentNumber: invoiceNumber,
      description: `Invoice ${invoiceNumber} is not linked to a purchase order.`,
      responsibleDept: "purchasing",
      action: "Pick the matching PO on the invoice screen, or reject the invoice.",
      createdByName: actor.name,
    });
  }

  await auditEvent(
    {
      entity: "invoice",
      entityId: invoice.id,
      documentNumber: invoiceNumber,
      actor,
    },
    "import",
    {
      field: "file",
      newValue: file.name,
      reason: extraction.mode === "ai" ? "Read automatically" : "Manual entry",
    }
  );

  await notify({
    department: "purchasing",
    type: "invoice_uploaded",
    title: `Invoice ${invoiceNumber} needs verification`,
    body: extraction.notices[0] ?? "Check the extracted lines and confirm.",
    documentType: "invoice",
    documentId: invoice.id,
    documentNumber: invoiceNumber,
    link: `/osms/purchasing/invoices/${invoice.id}`,
  });

  return Response.json(
    {
      id: invoice.id,
      invoiceNumber,
      status: invoice.status,
      poId: po?.id ?? null,
      lineCount: extraction.lines.length,
      notices: extraction.notices,
      mode: extraction.mode,
    },
    { status: 201 }
  );
}
