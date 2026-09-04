import { osms } from "@/lib/osms/db";
import { round } from "@/lib/osms/units";
import {
  comparePoInvoice,
  compareSoConfirmed,
  confirmedQuantity,
} from "@/lib/osms/reconcile";
import { evaluateGate, type GateResult } from "@/lib/osms/gate";
import { raiseException, resolveExceptions } from "@/lib/osms/exceptions";
import { notify } from "@/lib/osms/notify";
import { resolveStatus, type WorkflowStatus } from "@/lib/osms/status";
import { QTY_EPSILON } from "@/lib/osms/domain";
import { loadToleranceResolver } from "@/lib/osms/tolerance";
import { detectCrossChannelShortage } from "@/lib/osms/shortage";
import { dueDateFor, priorityFor } from "@/lib/osms/sla";

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
  const tolerances = await loadToleranceResolver();
  const po = await osms.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      lines: { include: { product: true, demandLinks: { include: { soLine: { include: { so: true } } } } } },
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
    // §28 — the tolerance that applies to *this* supplier, channel and
    // product type, not one global number for the whole business.
    const channelId =
      poLine.demandLinks.find((link) => link.soLine?.so.channelId)?.soLine?.so
        .channelId ?? null;
    const tolerance = tolerances.resolve({
      supplierId: po.supplierId,
      channelId,
      productType: poLine.product.category,
    });
    const comparison = comparePoInvoice({
      poQuantity: poLine.baseQuantity,
      invoiceQuantity: invoiced?.quantity ?? null,
      poUnitPrice: poLine.unitPrice,
      invoiceUnitPrice: invoiced?.unitPrice ?? null,
      qtyTolerancePct: tolerance.qtyTolerancePct,
      priceTolerancePct: tolerance.priceTolerancePct,
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
      // Flow §4: the difference has to be settled before the goods arrive.
      // Both fields are derived from the PO line — nobody types a deadline.
      deliveryDate: poLine.deliveryDate,
      dueDate: dueDateFor(poLine.deliveryDate, "poInvoiceReconciliation"),
      priority: priorityFor(poLine.deliveryDate),
    };

    const existing = await osms.poInvoiceRecon.findFirst({
      where: { poLineId: poLine.id },
    });

    if (existing) {
      // A row purchasing already signed off is left alone: re-running the
      // comparison must never quietly undo a human decision.
      if (existing.status === "approved") continue;
      await osms.poInvoiceRecon.update({
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
      await osms.poInvoiceRecon.create({
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
      await osms.purchaseOrderLine.update({
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
      link: `/osms/purchasing/po-invoice?po=${po.id}`,
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
): Promise<{ pending: number; shortageCases: string[] }> {
  const tolerances = await loadToleranceResolver();
  const po = await osms.purchaseOrder.findUnique({
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
  if (!po) return { pending: 0, shortageCases: [] };

  let pending = 0;
  const shortageCases: string[] = [];

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

    // §20 — when the shortfall spans more than one business channel the
    // system must NOT decide who gets cut. It raises a case and stops here;
    // the sales reviews are written from the approved numbers instead.
    const shortage = await detectCrossChannelShortage(
      poLine.id,
      confirmed,
      actorName
    );
    if (shortage) {
      shortageCases.push(shortage.caseNumber);
      await raiseException({
        type: "SUPPLIER_SHORT",
        severity: "high",
        documentType: "shortage_case",
        documentId: shortage.caseId,
        documentNumber: shortage.caseNumber,
        productId: poLine.productId,
        description: `${shortage.caseNumber}: ${confirmed} available against demand from more than one channel — management must rank the channels.`,
        responsibleDept: "management",
        action: "Approve the cross-channel split before allocation can start.",
        dueDate: dueDateFor(poLine.deliveryDate, "shortageApproval"),
        priority: "critical",
        createdByName: actorName ?? null,
      });
      await notify({
        department: "management",
        type: "cross_channel_shortage",
        severity: "critical",
        title: `${shortage.caseNumber}: cross-channel shortage needs a decision`,
        body: `${po.poNumber} — ${confirmed} available, demand spans several channels.`,
        documentType: "shortage_case",
        documentId: shortage.caseId,
        documentNumber: shortage.caseNumber,
        link: `/osms/sales/shortage/${shortage.caseId}`,
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
      const tolerance = tolerances.resolve({
        supplierId: po.supplierId,
        channelId: soLine.so.channelId,
      });
      const result = compareSoConfirmed(
        soLine.quantity,
        share,
        tolerance.qtyTolerancePct
      );

      const existing = await osms.soPoRecon.findFirst({
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
        await osms.soPoRecon.update({
          where: { id: existing.id },
          data: payload,
        });
      } else {
        await osms.soPoRecon.create({ data: payload });
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
          channelId: soLine.so.channelId,
          dueDate: dueDateFor(soLine.deliveryDate, "salesReview"),
          priority: result.diffStatus === "short" ? "high" : "medium",
          action:
            result.diffStatus === "short"
              ? "Decide which customer takes the shortfall and confirm the new SO quantity."
              : "Give the excess to a customer or move it to warehouse stock.",
          createdByName: actorName ?? null,
        });
      } else {
        await osms.salesOrderLine.update({
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
      link: `/osms/sales/review?po=${po.id}`,
    });
  }

  await syncPoStatuses(poId);
  return { pending, shortageCases };
}

// -------------------------------------------------------------- status sync

/** Recompute the workflow status of every line touched by a purchase order. */
export async function syncPoStatuses(poId: string): Promise<void> {
  const po = await osms.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      invoices: { select: { status: true } },
      lines: {
        include: {
          recons: true,
          soPoRecons: true,
          shortageCases: { select: { status: true } },
          allocations: {
            include: { lines: { include: { shipmentLines: true } } },
          },
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

    // §23 — a PO line can be delivered over several receipts. What decides
    // PARTIALLY vs FULLY received is the running total against the quantity
    // purchasing confirmed, not the number of receipts.
    const expected = confirmedQuantity({
      poQuantity: line.baseQuantity,
      correctedQuantity: line.correctedQuantity,
      invoiceVerified: true,
    });
    const receivedQuantity = round(
      line.receivingLines.reduce((sum, rl) => sum + rl.actualQuantity, 0)
    );
    const received = line.receivingLines.length > 0;
    const fullyReceived = received && receivedQuantity >= expected - QTY_EPSILON;
    const partiallyReceived = received && !fullyReceived;

    const customerLines = (allocation?.lines ?? []).filter(
      (allocationLine) => allocationLine.target === "customer"
    );
    const shippedLines = customerLines.filter(
      (allocationLine) => allocationLine.shipmentLines.length > 0
    );
    const shipped = shippedLines.length > 0;
    // Complete only when every customer line has actually left. A leftover
    // that stayed in the warehouse does not hold the line open.
    const completed =
      fullyReceived &&
      customerLines.length > 0 &&
      shippedLines.length === customerLines.length;

    // A cross-channel shortage waiting for management is not "blocked by a
    // mistake" — it is an approval the workflow is holding for (§20).
    const shortagePending = line.shortageCases.some((shortage) =>
      ["open", "pending_approval"].includes(shortage.status)
    );
    const rejected = recons.some((r) => r.status === "rejected");

    const status: WorkflowStatus = resolveStatus({
      cancelled: po.status === "cancelled",
      rejected,
      blocked: Boolean(line.blockedReason),
      exception: shortagePending,
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
      partiallyReceived,
      fullyReceived,
      readyToShip: fullyReceived && allocationCompleted && !shipped,
      shipped,
      completed,
    });

    if (status !== line.status) {
      await osms.purchaseOrderLine.update({
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
      await osms.purchaseRequestLine.updateMany({
        where: { id: { in: prLineIds } },
        data: { status },
      });
    }
    if (soLineIds.length > 0) {
      await osms.salesOrderLine.updateMany({
        where: { id: { in: soLineIds } },
        data: { status },
      });
    }
  }
}

/** Demand lines with no PO yet sit at PENDING_PO, not IMPORTED. */
export async function syncPendingDemand(): Promise<void> {
  const prLines = await osms.purchaseRequestLine.findMany({
    where: { status: { in: ["IMPORTED", "PENDING_PO"] } },
    include: { demandLinks: true },
  });
  for (const line of prLines) {
    const ordered = line.demandLinks.reduce((sum, l) => sum + l.quantity, 0);
    const status = ordered >= line.baseQuantity ? "PO_CREATED" : "PENDING_PO";
    if (status !== line.status) {
      await osms.purchaseRequestLine.update({
        where: { id: line.id },
        data: { status },
      });
    }
  }
}

// ------------------------------------------------------------ receiving gate

/** Load everything the six checks need and evaluate them for one PO. */
export async function gateForPo(poId: string): Promise<GateResult | null> {
  const po = await osms.purchaseOrder.findUnique({
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
          shortageCases: {
            where: { status: { in: ["open", "pending_approval"] } },
            select: { caseNumber: true },
          },
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
    openShortageCases: po.lines.flatMap((line) => line.shortageCases),
    allocations,
    requiredAllocationLineIds: po.lines.map((line) => line.id),
  });
}

/** Clear the workflow exceptions a PO raised once it is fully received. */
export async function closePoExceptions(
  poId: string,
  resolvedByName?: string | null
): Promise<void> {
  const lines = await osms.purchaseOrderLine.findMany({
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
