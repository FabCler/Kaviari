import { prisma } from "@/lib/db";
import { round } from "@/lib/scm/units";
import {
  comparePoInvoice,
  compareSoConfirmed,
  confirmedQuantity,
} from "@/lib/scm/reconcile";
import { evaluateGate, type GateResult } from "@/lib/scm/gate";
import { raiseException, resolveExceptions } from "@/lib/scm/exceptions";
import { notify } from "@/lib/scm/notify";
import { resolveStatus, type WorkflowStatus } from "@/lib/scm/status";
import { getScmSettings } from "@/lib/scm/settings";

/**
 * Orchestration: the steps that move a demand line through the 17 states.
 * Everything here is deliberately re-runnable — re-uploading an invoice or
 * re-opening a review recomputes rather than appends, so the pipeline can
 * never end up with two conflicting "truths" for the same quantity.
 */

// ------------------------------------------------------------ distribution

export interface DemandShare {
  id: string;
  quantity: number;
}

/**
 * Split a confirmed quantity across the demand lines a PO line covers,
 * pro-rata by requested quantity. Sales can override the proposal line by
 * line; this only decides what the screen opens with.
 */
export function distributeConfirmed(
  confirmed: number,
  demands: DemandShare[]
): Map<string, number> {
  const result = new Map<string, number>();
  const total = demands.reduce((sum, d) => sum + d.quantity, 0);
  if (demands.length === 0) return result;
  if (total <= 0) {
    const even = round(confirmed / demands.length);
    for (const demand of demands) result.set(demand.id, even);
    return result;
  }
  let assigned = 0;
  demands.forEach((demand, index) => {
    const isLast = index === demands.length - 1;
    // The last line absorbs the rounding remainder so the split always
    // sums back to the confirmed quantity exactly.
    const share = isLast
      ? round(confirmed - assigned)
      : round((demand.quantity / total) * confirmed);
    assigned = round(assigned + share);
    result.set(demand.id, share);
  });
  return result;
}

// ------------------------------------------------- PO / invoice reconciliation

/**
 * (Re)build the PO vs Invoice comparison for one purchase order. Lines that
 * match on both quantity and price are approved automatically; anything else
 * lands in purchasing's queue with a mandatory reason.
 */
export async function runPoInvoiceReconciliation(
  poId: string,
  actorName?: string | null
): Promise<{ created: number; needsReview: number }> {
  const settings = await getScmSettings();
  const po = await prisma.scmPurchaseOrder.findUnique({
    where: { id: poId },
    include: {
      lines: true,
      invoices: { include: { lines: true } },
    },
  });
  if (!po) return { created: 0, needsReview: 0 };

  const verifiedInvoices = po.invoices.filter((i) => i.status === "verified");
  if (verifiedInvoices.length === 0) return { created: 0, needsReview: 0 };

  // Invoice quantity per PO line, summed across every verified invoice.
  const invoiceByPoLine = new Map<
    string,
    { quantity: number; unitPrice: number; invoiceId: string; lineId: string }
  >();
  const unmatchedInvoiceLines: {
    invoiceId: string;
    invoiceNumber: string;
    lineId: string;
    description: string;
  }[] = [];

  for (const invoice of verifiedInvoices) {
    for (const line of invoice.lines) {
      if (!line.poLineId) {
        unmatchedInvoiceLines.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          lineId: line.id,
          description: line.descriptionRaw ?? line.productCodeRaw ?? "line",
        });
        continue;
      }
      const existing = invoiceByPoLine.get(line.poLineId);
      if (existing) {
        existing.quantity = round(existing.quantity + line.baseQuantity);
      } else {
        invoiceByPoLine.set(line.poLineId, {
          quantity: line.baseQuantity,
          unitPrice: line.unitPrice,
          invoiceId: invoice.id,
          lineId: line.id,
        });
      }
    }
  }

  let needsReview = 0;
  let created = 0;

  for (const poLine of po.lines) {
    const invoiced = invoiceByPoLine.get(poLine.id) ?? null;
    const comparison = comparePoInvoice({
      poQuantity: poLine.baseQuantity,
      invoiceQuantity: invoiced?.quantity ?? null,
      poUnitPrice: poLine.unitPrice,
      invoiceUnitPrice: invoiced?.unitPrice ?? null,
      qtyTolerancePct: settings.qtyTolerancePct,
      priceTolerancePct: settings.priceTolerancePct,
    });

    const autoApprove = !comparison.needsReview && invoiced != null;
    const data = {
      poId: po.id,
      poLineId: poLine.id,
      invoiceId: invoiced?.invoiceId ?? null,
      invoiceLineId: invoiced?.lineId ?? null,
      productId: poLine.productId,
      poQuantity: poLine.baseQuantity,
      invoiceQuantity: invoiced?.quantity ?? null,
      qtyDiff: comparison.qtyDiff,
      qtyDiffPct: comparison.qtyDiffPct,
      poUnitPrice: poLine.unitPrice,
      invoiceUnitPrice: invoiced?.unitPrice ?? null,
      priceDiff: comparison.priceDiff,
      priceDiffPct: comparison.priceDiffPct,
      qtyStatus: comparison.qtyStatus,
      priceStatus: comparison.priceStatus,
    };

    const existing = await prisma.scmPoInvoiceRecon.findFirst({
      where: { poLineId: poLine.id },
    });

    if (existing) {
      // A row purchasing already signed off is left alone: re-running the
      // comparison must never quietly undo a human decision.
      if (existing.status === "approved") continue;
      await prisma.scmPoInvoiceRecon.update({
        where: { id: existing.id },
        data: {
          ...data,
          status: autoApprove ? "approved" : "pending_review",
          correctedQuantity: autoApprove ? invoiced.quantity : null,
          reviewedByName: autoApprove ? "System (auto-match)" : null,
          reviewedAt: autoApprove ? new Date() : null,
        },
      });
    } else {
      await prisma.scmPoInvoiceRecon.create({
        data: {
          ...data,
          status: autoApprove ? "approved" : "pending_review",
          correctedQuantity: autoApprove ? invoiced.quantity : null,
          reviewedByName: autoApprove ? "System (auto-match)" : null,
          reviewedAt: autoApprove ? new Date() : null,
        },
      });
      created += 1;
    }

    if (autoApprove) {
      await prisma.scmPurchaseOrderLine.update({
        where: { id: poLine.id },
        data: {
          correctedQuantity: invoiced.quantity,
          correctedReason: "AUTO_MATCH",
          correctedAt: new Date(),
          correctedByName: "System (auto-match)",
        },
      });
    } else {
      needsReview += 1;
      await raiseException({
        type:
          comparison.qtyStatus === "over"
            ? "SUPPLIER_OVER"
            : comparison.qtyStatus === "short"
              ? "SUPPLIER_SHORT"
              : comparison.qtyStatus === "missing_on_invoice"
                ? "PARTIAL_DELIVERY"
                : "PRICE_MISMATCH",
        severity: comparison.priceStatus !== "match" ? "high" : "medium",
        documentType: "po_line",
        documentId: poLine.id,
        documentNumber: po.poNumber,
        productId: poLine.productId,
        description:
          comparison.qtyStatus !== "match"
            ? `Invoice quantity ${invoiced?.quantity ?? 0} vs PO quantity ${poLine.baseQuantity}.`
            : `Invoice price ${invoiced?.unitPrice ?? 0} vs PO price ${poLine.unitPrice}.`,
        responsibleDept: "purchasing",
        action: "Confirm the corrected quantity/price and record the reason.",
        createdByName: actorName ?? null,
      });
    }
  }

  for (const orphan of unmatchedInvoiceLines) {
    await raiseException({
      type: "INVOICE_WITHOUT_PO",
      severity: "high",
      documentType: "invoice_line",
      documentId: orphan.lineId,
      documentNumber: orphan.invoiceNumber,
      description: `Invoice line "${orphan.description}" does not match any line on ${po.poNumber}.`,
      responsibleDept: "purchasing",
      action: "Match the line to a PO line or reject the invoice.",
      createdByName: actorName ?? null,
    });
  }

  if (needsReview > 0) {
    await notify({
      department: "purchasing",
      type: "po_invoice_mismatch",
      severity: "warning",
      title: `${po.poNumber}: ${needsReview} line(s) do not match the invoice`,
      body: "Confirm the corrected quantity and record a reason before the goods can be received.",
      documentType: "po",
      documentId: po.id,
      documentNumber: po.poNumber,
      link: `/scm/purchasing/po-invoice?po=${po.id}`,
    });
  }

  await syncPoStatuses(poId);
  return { created, needsReview };
}

// ------------------------------------------------------ SO reconciliation

/**
 * Compare the confirmed PO/invoice quantity against the customer orders it
 * was bought for (§4). Runs after purchasing approves a reconciliation row.
 */
export async function runSoReconciliation(
  poId: string,
  actorName?: string | null
): Promise<{ pending: number }> {
  const settings = await getScmSettings();
  const po = await prisma.scmPurchaseOrder.findUnique({
    where: { id: poId },
    include: {
      lines: {
        include: {
          demandLinks: {
            include: { soLine: { include: { so: true } }, prLine: true },
          },
          recons: true,
        },
      },
    },
  });
  if (!po) return { pending: 0 };

  let pending = 0;

  for (const poLine of po.lines) {
    const recon = poLine.recons[0];
    // Only reconcile against Sales once purchasing has signed the line off.
    if (!recon || recon.status !== "approved") continue;

    const confirmed = confirmedQuantity({
      poQuantity: poLine.baseQuantity,
      invoiceQuantity: recon.invoiceQuantity,
      correctedQuantity: poLine.correctedQuantity ?? recon.correctedQuantity,
      invoiceVerified: true,
    });

    const soDemands = poLine.demandLinks.filter((link) => link.soLine);
    if (soDemands.length === 0) {
      await raiseException({
        type: "PO_WITHOUT_SO",
        severity: "medium",
        documentType: "po_line",
        documentId: poLine.id,
        documentNumber: po.poNumber,
        productId: poLine.productId,
        description: `${po.poNumber} line ${poLine.lineNo} is not linked to any sales order.`,
        responsibleDept: "sales",
        action: "Link the line to an SO or allocate the quantity to stock.",
        createdByName: actorName ?? null,
      });
      continue;
    }

    const shares = distributeConfirmed(
      confirmed,
      soDemands.map((link) => ({ id: link.id, quantity: link.quantity }))
    );

    for (const link of soDemands) {
      const soLine = link.soLine!;
      const share = shares.get(link.id) ?? 0;
      const result = compareSoConfirmed(
        soLine.quantity,
        share,
        settings.qtyTolerancePct
      );

      const existing = await prisma.scmSoPoRecon.findFirst({
        where: { soLineId: soLine.id, poLineId: poLine.id },
      });
      if (existing?.status === "completed") continue;

      const payload = {
        soLineId: soLine.id,
        poLineId: poLine.id,
        productId: poLine.productId,
        soQuantity: soLine.quantity,
        confirmedQuantity: share,
        diff: result.diff,
        diffPct: result.diffPct,
        diffStatus: result.diffStatus,
        status: result.needsSalesReview
          ? "pending_sales_review"
          : ("completed" as const),
        decision: result.needsSalesReview ? null : "keep_so",
        reviewedByName: result.needsSalesReview ? null : "System (auto-match)",
        reviewedAt: result.needsSalesReview ? null : new Date(),
      };

      if (existing) {
        await prisma.scmSoPoRecon.update({
          where: { id: existing.id },
          data: payload,
        });
      } else {
        await prisma.scmSoPoRecon.create({ data: payload });
      }

      if (result.needsSalesReview) {
        pending += 1;
        await raiseException({
          type: result.diffStatus === "short" ? "SUPPLIER_SHORT" : "EXCESS_STOCK",
          severity: result.diffStatus === "short" ? "high" : "medium",
          documentType: "so_line",
          documentId: soLine.id,
          documentNumber: soLine.so.soNumber,
          productId: soLine.productId,
          description: `${soLine.so.soNumber}: SO ${soLine.quantity} vs confirmed ${share} (${result.diff > 0 ? "+" : ""}${result.diff}).`,
          responsibleDept: "sales",
          action:
            result.diffStatus === "short"
              ? "Decide which customer takes the shortfall and confirm the new SO quantity."
              : "Give the excess to a customer or move it to warehouse stock.",
          createdByName: actorName ?? null,
        });
      } else {
        await prisma.scmSalesOrderLine.update({
          where: { id: soLine.id },
          data: { confirmedQuantity: share },
        });
      }
    }
  }

  if (pending > 0) {
    await notify({
      department: "sales",
      type: "so_quantity_difference",
      severity: "warning",
      title: `${po.poNumber}: ${pending} customer order(s) need a decision`,
      body: "The delivered quantity differs from the sales order — review and confirm.",
      documentType: "po",
      documentId: po.id,
      documentNumber: po.poNumber,
      link: `/scm/sales/review?po=${po.id}`,
    });
  }

  await syncPoStatuses(poId);
  return { pending };
}

// -------------------------------------------------------------- status sync

/** Recompute the workflow status of every line touched by a purchase order. */
export async function syncPoStatuses(poId: string): Promise<void> {
  const po = await prisma.scmPurchaseOrder.findUnique({
    where: { id: poId },
    include: {
      invoices: { select: { status: true } },
      lines: {
        include: {
          recons: true,
          soPoRecons: true,
          allocations: { include: { lines: true } },
          receivingLines: { include: { receiving: true } },
          demandLinks: true,
        },
      },
    },
  });
  if (!po) return;

  const hasInvoice = po.invoices.some((i) =>
    ["extracted", "pending_verification", "verified"].includes(i.status)
  );

  for (const line of po.lines) {
    const recons = line.recons;
    const poInvoiceApproved =
      recons.length > 0 && recons.every((r) => r.status === "approved");
    const poInvoiceOpen = recons.some(
      (r) => r.status === "pending_review" || r.status === "purchasing_review"
    );
    const salesRecons = line.soPoRecons;
    const salesReviewRequired = salesRecons.some(
      (r) => r.diffStatus !== "match"
    );
    const salesReviewDone =
      salesRecons.length > 0 &&
      salesRecons.every((r) => r.status === "completed");
    const allocation = line.allocations[0] ?? null;
    const allocationCompleted = allocation?.status === "completed";
    const received = line.receivingLines.some(
      (rl) => rl.status === "received" || rl.receiving.status === "completed"
    );
    const partialReceived = line.receivingLines.some(
      (rl) => rl.status === "partial"
    );
    const shipped = line.receivingLines.some(
      (rl) => rl.receiving.status === "completed"
    );

    const status: WorkflowStatus = resolveStatus({
      cancelled: po.status === "cancelled",
      blocked: Boolean(line.blockedReason),
      poQuantity: line.baseQuantity,
      requiredQuantity: line.requiredQuantity,
      hasInvoice,
      poInvoiceApproved,
      poInvoiceOpen,
      salesReviewRequired,
      salesReviewDone: salesReviewDone && poInvoiceApproved,
      allocationRequired: poInvoiceApproved && !allocationCompleted,
      allocationCompleted,
      received,
      partialReceived,
      shipped,
    });

    if (status !== line.status) {
      await prisma.scmPurchaseOrderLine.update({
        where: { id: line.id },
        data: { status },
      });
    }

    // Mirror the status onto the demand lines this PO line serves so the
    // Sales and Purchasing boards agree without a second computation.
    const prLineIds = line.demandLinks
      .map((link) => link.prLineId)
      .filter((id): id is string => Boolean(id));
    const soLineIds = line.demandLinks
      .map((link) => link.soLineId)
      .filter((id): id is string => Boolean(id));
    if (prLineIds.length > 0) {
      await prisma.scmPurchaseRequestLine.updateMany({
        where: { id: { in: prLineIds } },
        data: { status },
      });
    }
    if (soLineIds.length > 0) {
      await prisma.scmSalesOrderLine.updateMany({
        where: { id: { in: soLineIds } },
        data: { status },
      });
    }
  }
}

/** Demand lines with no PO yet sit at PENDING_PO, not IMPORTED. */
export async function syncPendingDemand(): Promise<void> {
  const prLines = await prisma.scmPurchaseRequestLine.findMany({
    where: { status: { in: ["IMPORTED", "PENDING_PO"] } },
    include: { demandLinks: true },
  });
  for (const line of prLines) {
    const ordered = line.demandLinks.reduce((sum, l) => sum + l.quantity, 0);
    const status = ordered >= line.baseQuantity ? "PO_CREATED" : "PENDING_PO";
    if (status !== line.status) {
      await prisma.scmPurchaseRequestLine.update({
        where: { id: line.id },
        data: { status },
      });
    }
  }
}

// ------------------------------------------------------------ receiving gate

/** Load everything the six checks need and evaluate them for one PO. */
export async function gateForPo(poId: string): Promise<GateResult | null> {
  const po = await prisma.scmPurchaseOrder.findUnique({
    where: { id: poId },
    include: {
      invoices: { select: { status: true } },
      recons: {
        select: { status: true, qtyStatus: true, priceStatus: true },
      },
      lines: {
        include: {
          allocations: {
            select: { status: true, unallocatedQuantity: true, poLineId: true },
          },
          soPoRecons: { select: { status: true } },
        },
      },
    },
  });
  if (!po) return null;

  const allocations = po.lines.flatMap((line) =>
    line.allocations.map((allocation) => ({
      poLineId: allocation.poLineId ?? line.id,
      status: allocation.status,
      unallocatedQuantity: allocation.unallocatedQuantity,
    }))
  );

  return evaluateGate({
    po: {
      status: po.status,
      supplierId: po.supplierId,
      lineCount: po.lines.length,
    },
    invoices: po.invoices,
    poInvoiceRecons: po.recons,
    salesRecons: po.lines.flatMap((line) => line.soPoRecons),
    allocations,
    requiredAllocationLineIds: po.lines.map((line) => line.id),
  });
}

/** Clear the workflow exceptions a PO raised once it is fully received. */
export async function closePoExceptions(
  poId: string,
  resolvedByName?: string | null
): Promise<void> {
  const lines = await prisma.scmPurchaseOrderLine.findMany({
    where: { poId },
    select: { id: true },
  });
  for (const line of lines) {
    await resolveExceptions(
      { documentType: "po_line", documentId: line.id },
      {
        resolution: "Closed automatically when the goods were received.",
        resolvedByName,
      }
    );
  }
}
