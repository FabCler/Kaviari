import { osms } from "@/lib/osms/db";
import { round } from "@/lib/osms/units";
import { auditEvent } from "@/lib/osms/audit";
import { raiseException } from "@/lib/osms/exceptions";
import { notify } from "@/lib/osms/notify";
import { syncPendingDemand, syncPoStatuses } from "@/lib/osms/workflow";
import type { Actor } from "@/lib/osms/permissions";
import type {
  DemandRowData,
  PoRowData,
  PreparedImport,
  SoRowData,
} from "@/lib/osms/import/validate";

/**
 * Commit a validated import. Rows carrying an error are skipped; everything
 * else is written inside one pass and audited. Imports are idempotent by
 * document number + product + delivery date, so re-uploading a corrected
 * file updates instead of duplicating.
 */

export interface CommitResult {
  batchId: string;
  imported: number;
  skipped: number;
  createdDocuments: string[];
  warnings: string[];
}

const PLACEHOLDER_CUSTOMER_CODE = "UNASSIGNED";

async function placeholderCustomer(): Promise<string> {
  const existing = await osms.customer.findUnique({
    where: { code: PLACEHOLDER_CUSTOMER_CODE },
  });
  if (existing) return existing.id;
  const created = await osms.customer.create({
    data: {
      code: PLACEHOLDER_CUSTOMER_CODE,
      name: "Unassigned customer",
      salesOwner: null,
      active: true,
    },
  });
  return created.id;
}

async function recordBatch(
  kind: string,
  fileName: string,
  prepared: PreparedImport<unknown>,
  actor: Actor,
  status = "committed"
): Promise<string> {
  const batch = await osms.importBatch.create({
    data: {
      kind,
      fileName,
      rowCount: prepared.rows.length,
      okCount: prepared.okCount,
      errorCount: prepared.errorCount,
      status,
      issues: JSON.stringify(
        prepared.rows
          .filter((row) => row.issues.length > 0)
          .map((row) => ({ row: row.rowNumber, issues: row.issues }))
          .slice(0, 500)
      ),
      createdById: actor.id,
      createdByName: actor.name,
    },
  });
  return batch.id;
}

/** §1.1 — purchasing demand file: creates/extends SOs, PRs and their lines. */
export async function commitDemandImport(
  prepared: PreparedImport<DemandRowData>,
  fileName: string,
  actor: Actor
): Promise<CommitResult> {
  const batchId = await recordBatch("demand", fileName, prepared, actor);
  const rows = prepared.rows.filter((row) => row.data != null);
  const createdDocuments: string[] = [];
  const warnings: string[] = [];
  let imported = 0;

  // ---- sales orders referenced by the file -------------------------------
  const soLineIdByKey = new Map<string, string>();
  const soNumbers = [
    ...new Set(rows.map((row) => row.data!.soNumber).filter(Boolean)),
  ] as string[];

  for (const soNumber of soNumbers) {
    const soRows = rows.filter((row) => row.data!.soNumber === soNumber);
    const first = soRows[0].data!;
    let so = await osms.salesOrder.findUnique({ where: { soNumber } });
    if (!so) {
      // The purchasing file carries no customer — the SO import (§1.4)
      // fills it in; until then the order hangs off a placeholder so the
      // link is never silently lost.
      const customerId = await placeholderCustomer();
      so = await osms.salesOrder.create({
        data: {
          soNumber,
          customerId,
          deliveryDate: first.deliveryDate,
          requester: first.requester,
          importId: batchId,
        },
      });
      createdDocuments.push(soNumber);
      warnings.push(
        `${soNumber} was created without a customer — import the sales-order file to complete it.`
      );
      await raiseException({
        type: "OTHER",
        severity: "low",
        documentType: "so",
        documentId: so.id,
        documentNumber: soNumber,
        description: `${soNumber} came from the purchasing file and has no customer yet.`,
        responsibleDept: "sales",
        action: "Import the sales-order file or assign the customer manually.",
        createdByName: actor.name,
      });
    }

    for (const row of soRows) {
      const data = row.data!;
      const key = `${soNumber}|${data.productId}|${data.deliveryDate.toISOString().slice(0, 10)}`;
      const existing = await osms.salesOrderLine.findFirst({
        where: {
          soId: so.id,
          productId: data.productId,
          deliveryDate: data.deliveryDate,
        },
      });
      if (existing) {
        soLineIdByKey.set(key, existing.id);
        if (data.poNumber && existing.poNumberRef !== data.poNumber) {
          await osms.salesOrderLine.update({
            where: { id: existing.id },
            data: { poNumberRef: data.poNumber },
          });
        }
        continue;
      }
      const lineNo =
        (await osms.salesOrderLine.count({ where: { soId: so.id } })) + 1;
      const line = await osms.salesOrderLine.create({
        data: {
          soId: so.id,
          lineNo,
          productId: data.productId,
          quantity: data.quantity,
          unit: data.unit,
          baseQuantity: data.baseQuantity,
          deliveryDate: data.deliveryDate,
          originalQuantity: data.quantity,
          poNumberRef: data.poNumber,
          status: data.poNumber ? "PO_CREATED" : "PENDING_PO",
        },
      });
      soLineIdByKey.set(key, line.id);
    }
  }

  // ---- purchase requests --------------------------------------------------
  const prNumbers = [
    ...new Set(rows.map((row) => row.data!.prNumber).filter(Boolean)),
  ] as string[];

  for (const prNumber of prNumbers) {
    const prRows = rows.filter((row) => row.data!.prNumber === prNumber);
    const first = prRows[0].data!;
    let pr = await osms.purchaseRequest.findUnique({ where: { prNumber } });
    if (!pr) {
      pr = await osms.purchaseRequest.create({
        data: {
          prNumber,
          requester: first.requester ?? "Unknown",
          requestDate: new Date(),
          importId: batchId,
        },
      });
      createdDocuments.push(prNumber);
    }

    for (const row of prRows) {
      const data = row.data!;
      const existing = await osms.purchaseRequestLine.findFirst({
        where: {
          prId: pr.id,
          productId: data.productId,
          deliveryDate: data.deliveryDate,
        },
      });
      const soKey = data.soNumber
        ? `${data.soNumber}|${data.productId}|${data.deliveryDate.toISOString().slice(0, 10)}`
        : null;
      const soLineId = soKey ? (soLineIdByKey.get(soKey) ?? null) : null;

      if (existing) {
        await osms.purchaseRequestLine.update({
          where: { id: existing.id },
          data: {
            quantity: data.quantity,
            baseQuantity: data.baseQuantity,
            unit: data.unit,
            soLineId: soLineId ?? existing.soLineId,
            poNumberRef: data.poNumber ?? existing.poNumberRef,
          },
        });
      } else {
        const lineNo =
          (await osms.purchaseRequestLine.count({
            where: { prId: pr.id },
          })) + 1;
        await osms.purchaseRequestLine.create({
          data: {
            prId: pr.id,
            lineNo,
            productId: data.productId,
            quantity: data.quantity,
            unit: data.unit,
            baseQuantity: data.baseQuantity,
            deliveryDate: data.deliveryDate,
            soLineId,
            poNumberRef: data.poNumber,
            status: data.poNumber ? "PO_CREATED" : "PENDING_PO",
          },
        });
      }
      imported += 1;
    }
  }

  // Rows with an SO but no PR still count as imported demand.
  imported += rows.filter((row) => !row.data!.prNumber).length;

  // ---- link to purchase orders already in the system ----------------------
  const poNumbers = [
    ...new Set(rows.map((row) => row.data!.poNumber).filter(Boolean)),
  ] as string[];
  for (const poNumber of poNumbers) {
    await linkDemandToPo(poNumber);
  }

  await syncPendingDemand();

  await auditEvent(
    {
      entity: "import_batch",
      entityId: batchId,
      documentNumber: fileName,
      actor,
    },
    "import",
    {
      field: "demand",
      newValue: `${imported} row(s) imported, ${prepared.errorCount} skipped`,
    }
  );

  if (rows.some((row) => !row.data!.poNumber)) {
    await notify({
      department: "purchasing",
      type: "demand_without_po",
      title: "New demand waiting for a purchase order",
      body: `${fileName}: lines without a PO are on the Order management board.`,
      link: "/osms/purchasing/orders",
    });
  }

  return {
    batchId,
    imported,
    skipped: prepared.errorCount,
    createdDocuments,
    warnings,
  };
}

/**
 * Deferred join: attach demand lines that quoted this PO number to the
 * matching PO lines, and refresh each PO line's required quantity.
 */
export async function linkDemandToPo(poNumber: string): Promise<void> {
  const po = await osms.purchaseOrder.findUnique({
    where: { poNumber },
    include: { lines: true },
  });
  if (!po) return;

  for (const poLine of po.lines) {
    const [prLines, soLines] = await Promise.all([
      osms.purchaseRequestLine.findMany({
        where: { poNumberRef: poNumber, productId: poLine.productId },
      }),
      osms.salesOrderLine.findMany({
        where: { poNumberRef: poNumber, productId: poLine.productId },
      }),
    ]);

    // A PR line that already carries its SO line is one demand, not two.
    const prSoLineIds = new Set(
      prLines.map((line) => line.soLineId).filter(Boolean) as string[]
    );
    const relatedSoLines = await osms.salesOrderLine.findMany({
      where: { id: { in: [...prSoLineIds] } },
      select: { id: true, soId: true },
    });
    const soLineToSoId = new Map(
      relatedSoLines.map((line) => [line.id, line.soId])
    );

    for (const prLine of prLines) {
      const existing = await osms.soPoMapping.findFirst({
        where: { poLineId: poLine.id, prLineId: prLine.id },
      });
      if (existing) continue;
      await osms.soPoMapping.create({
        data: {
          poId: po.id,
          poLineId: poLine.id,
          prLineId: prLine.id,
          soLineId: prLine.soLineId,
          soId: prLine.soLineId ? soLineToSoId.get(prLine.soLineId) : null,
          productId: poLine.productId,
          quantity: prLine.baseQuantity,
          unit: poLine.unit,
          reason: "Linked from the purchasing import (PO number reference)",
        },
      });
    }

    for (const soLine of soLines) {
      if (prSoLineIds.has(soLine.id)) continue;
      const existing = await osms.soPoMapping.findFirst({
        where: { poLineId: poLine.id, soLineId: soLine.id },
      });
      if (existing) continue;
      await osms.soPoMapping.create({
        data: {
          poId: po.id,
          poLineId: poLine.id,
          soLineId: soLine.id,
          soId: soLine.soId,
          productId: poLine.productId,
          quantity: soLine.baseQuantity,
          unit: poLine.unit,
          reason: "Linked from the purchasing import (PO number reference)",
        },
      });
    }

    const links = await osms.soPoMapping.findMany({
      where: { poLineId: poLine.id },
    });
    const required = round(
      links.reduce((sum: number, link: { quantity: number }) => sum + link.quantity, 0)
    );
    if (required !== poLine.requiredQuantity) {
      await osms.purchaseOrderLine.update({
        where: { id: poLine.id },
        data: { requiredQuantity: required },
      });
    }
  }

  await syncPoStatuses(po.id);
}

/** §1.2 — purchase-order file. */
export async function commitPoImport(
  prepared: PreparedImport<PoRowData>,
  fileName: string,
  actor: Actor
): Promise<CommitResult> {
  const batchId = await recordBatch("po", fileName, prepared, actor);
  const rows = prepared.rows.filter((row) => row.data != null);
  const createdDocuments: string[] = [];
  const warnings: string[] = [];
  let imported = 0;

  const poNumbers = [...new Set(rows.map((row) => row.data!.poNumber))];

  for (const poNumber of poNumbers) {
    const poRows = rows.filter((row) => row.data!.poNumber === poNumber);
    const first = poRows[0].data!;

    let supplier = await osms.supplier.findUnique({
      where: { code: first.supplierCode },
    });
    if (!supplier) {
      supplier = await osms.supplier.create({
        data: {
          code: first.supplierCode,
          name: first.supplierName ?? first.supplierCode,
          currency: first.currency,
        },
      });
      warnings.push(`Supplier ${first.supplierCode} was created.`);
    }

    const latestDelivery = poRows.reduce(
      (latest, row) =>
        row.data!.deliveryDate > latest ? row.data!.deliveryDate : latest,
      first.deliveryDate
    );

    let po = await osms.purchaseOrder.findUnique({ where: { poNumber } });
    if (!po) {
      po = await osms.purchaseOrder.create({
        data: {
          poNumber,
          supplierId: supplier.id,
          expectedDeliveryDate: latestDelivery,
          currency: first.currency,
          status: "issued",
          importId: batchId,
          createdById: actor.id,
          createdByName: actor.name,
        },
      });
      createdDocuments.push(poNumber);
    }

    for (const row of poRows) {
      const data = row.data!;
      const existing = await osms.purchaseOrderLine.findFirst({
        where: {
          poId: po.id,
          productId: data.productId,
          deliveryDate: data.deliveryDate,
        },
      });
      if (existing) {
        await osms.purchaseOrderLine.update({
          where: { id: existing.id },
          data: {
            quantity: data.quantity,
            unit: data.unit,
            baseQuantity: data.baseQuantity,
            unitPrice: data.unitPrice,
            priceUnit: data.priceUnit,
            currency: data.currency,
          },
        });
      } else {
        const lineNo =
          (await osms.purchaseOrderLine.count({ where: { poId: po.id } })) +
          1;
        await osms.purchaseOrderLine.create({
          data: {
            poId: po.id,
            lineNo,
            productId: data.productId,
            quantity: data.quantity,
            unit: data.unit,
            baseQuantity: data.baseQuantity,
            unitPrice: data.unitPrice,
            priceUnit: data.priceUnit,
            currency: data.currency,
            deliveryDate: data.deliveryDate,
            status: "PO_CREATED",
          },
        });
      }
      imported += 1;
    }

    await linkDemandToPo(poNumber);

    const unlinked = await osms.purchaseOrderLine.findMany({
      where: { poId: po.id, demandLinks: { none: {} } },
      include: { product: true },
    });
    for (const line of unlinked) {
      await raiseException({
        type: "PO_WITHOUT_SO",
        severity: "medium",
        documentType: "po_line",
        documentId: line.id,
        documentNumber: poNumber,
        productId: line.productId,
        description: `${poNumber} line ${line.lineNo} (${line.product.code}) is not linked to any PR or SO.`,
        responsibleDept: "sales",
        action: "Link the line to a customer order or plan it as stock.",
        createdByName: actor.name,
      });
    }
  }

  await auditEvent(
    { entity: "import_batch", entityId: batchId, documentNumber: fileName, actor },
    "import",
    { field: "po", newValue: `${imported} PO line(s) imported` }
  );

  await notify({
    department: "purchasing",
    type: "po_imported",
    title: `${poNumbers.length} purchase order(s) imported`,
    body: "Upload the supplier invoice when it arrives to start the reconciliation.",
    link: "/osms/purchasing/po-invoice",
  });

  return {
    batchId,
    imported,
    skipped: prepared.errorCount,
    createdDocuments,
    warnings,
  };
}

/** §1.4 — sales-order file. */
export async function commitSoImport(
  prepared: PreparedImport<SoRowData>,
  fileName: string,
  actor: Actor
): Promise<CommitResult> {
  const batchId = await recordBatch("so", fileName, prepared, actor);
  const rows = prepared.rows.filter((row) => row.data != null);
  const createdDocuments: string[] = [];
  const warnings: string[] = [];
  let imported = 0;

  const soNumbers = [...new Set(rows.map((row) => row.data!.soNumber))];

  for (const soNumber of soNumbers) {
    const soRows = rows.filter((row) => row.data!.soNumber === soNumber);
    const first = soRows[0].data!;

    let customer = await osms.customer.findUnique({
      where: { code: first.customerCode },
    });
    if (!customer) {
      customer = await osms.customer.create({
        data: {
          code: first.customerCode,
          name: first.customerName ?? first.customerCode,
          salesOwner: first.requester,
        },
      });
      warnings.push(`Customer ${first.customerCode} was created.`);
    }

    const earliestDelivery = soRows.reduce(
      (earliest, row) =>
        row.data!.deliveryDate < earliest ? row.data!.deliveryDate : earliest,
      first.deliveryDate
    );

    let so = await osms.salesOrder.findUnique({ where: { soNumber } });
    if (!so) {
      so = await osms.salesOrder.create({
        data: {
          soNumber,
          customerId: customer.id,
          deliveryDate: earliestDelivery,
          requester: first.requester,
          currency: first.currency,
          importId: batchId,
        },
      });
      createdDocuments.push(soNumber);
    } else if (
      so.customerId !== customer.id &&
      customer.code !== PLACEHOLDER_CUSTOMER_CODE
    ) {
      // The purchasing file created the order against the placeholder;
      // the sales file is authoritative for who the customer is.
      const previous = await osms.customer.findUnique({
        where: { id: so.customerId },
      });
      await osms.salesOrder.update({
        where: { id: so.id },
        data: { customerId: customer.id, currency: first.currency },
      });
      await auditEvent(
        { entity: "sales_order", entityId: so.id, documentNumber: soNumber, actor },
        "update",
        {
          field: "customerId",
          oldValue: previous?.code ?? so.customerId,
          newValue: customer.code,
          reason: "Sales order import",
        }
      );
    }

    for (const row of soRows) {
      const data = row.data!;
      const existing = await osms.salesOrderLine.findFirst({
        where: {
          soId: so.id,
          productId: data.productId,
          deliveryDate: data.deliveryDate,
        },
      });
      if (existing) {
        await osms.salesOrderLine.update({
          where: { id: existing.id },
          data: {
            quantity: data.quantity,
            unit: data.unit,
            baseQuantity: data.baseQuantity,
            unitPrice: data.unitPrice,
            priceUnit: data.priceUnit,
            currency: data.currency,
          },
        });
      } else {
        const lineNo =
          (await osms.salesOrderLine.count({ where: { soId: so.id } })) + 1;
        await osms.salesOrderLine.create({
          data: {
            soId: so.id,
            lineNo,
            productId: data.productId,
            quantity: data.quantity,
            unit: data.unit,
            baseQuantity: data.baseQuantity,
            unitPrice: data.unitPrice,
            priceUnit: data.priceUnit,
            currency: data.currency,
            deliveryDate: data.deliveryDate,
            originalQuantity: data.quantity,
            status: "PENDING_PO",
          },
        });
      }
      imported += 1;
    }
  }

  await syncPendingDemand();

  await auditEvent(
    { entity: "import_batch", entityId: batchId, documentNumber: fileName, actor },
    "import",
    { field: "so", newValue: `${imported} SO line(s) imported` }
  );

  await notify({
    department: "purchasing",
    type: "so_imported",
    title: `${soNumbers.length} sales order(s) imported`,
    body: "New customer demand is waiting on the Order management board.",
    link: "/osms/purchasing/orders",
  });

  return {
    batchId,
    imported,
    skipped: prepared.errorCount,
    createdDocuments,
    warnings,
  };
}
