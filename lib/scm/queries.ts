import { prisma } from "@/lib/db";
import { comparePoSo } from "@/lib/scm/reconcile";
import { round } from "@/lib/scm/units";
import type { ComparisonStatus } from "@/lib/scm/domain";
import { getScmSettings } from "@/lib/scm/settings";

/**
 * Read models for the screens. Every board the spec asks for is a join over
 * the same skeleton (demand → PO → invoice → allocation), so the queries live
 * together and the pages stay presentational.
 */

export interface DemandRow {
  kind: "pr" | "so";
  lineId: string;
  documentNumber: string;
  documentId: string;
  productId: string;
  productCode: string;
  productName: string;
  productNameTh: string | null;
  requiredQuantity: number;
  orderedQuantity: number;
  outstandingQuantity: number;
  unit: string;
  purchaseUnit: string | null;
  moq: number | null;
  deliveryDate: Date;
  requester: string | null;
  customerName: string | null;
  soNumber: string | null;
  prNumber: string | null;
  supplierId: string | null;
  supplierName: string | null;
  status: string;
}

/**
 * §2 — everything purchasing still has to buy: no PO at all, or a PO that
 * does not cover the requested quantity.
 */
export async function demandBoard(options?: {
  includeCovered?: boolean;
}): Promise<DemandRow[]> {
  const [prLines, soLines] = await Promise.all([
    prisma.scmPurchaseRequestLine.findMany({
      include: {
        pr: true,
        product: { include: { defaultSupplier: true } },
        demandLinks: true,
        soLine: { include: { so: { include: { customer: true } } } },
      },
      orderBy: { deliveryDate: "asc" },
    }),
    prisma.scmSalesOrderLine.findMany({
      where: { prLines: { none: {} } },
      include: {
        so: { include: { customer: true } },
        product: { include: { defaultSupplier: true } },
        demandLinks: true,
      },
      orderBy: { deliveryDate: "asc" },
    }),
  ]);

  const rows: DemandRow[] = [];

  for (const line of prLines) {
    const ordered = round(
      line.demandLinks.reduce((sum, link) => sum + link.quantity, 0)
    );
    const outstanding = round(line.baseQuantity - ordered);
    if (!options?.includeCovered && outstanding <= 0) continue;
    rows.push({
      kind: "pr",
      lineId: line.id,
      documentNumber: line.pr.prNumber,
      documentId: line.prId,
      productId: line.productId,
      productCode: line.product.prCode,
      productName: line.product.name,
      productNameTh: line.product.nameTh,
      requiredQuantity: line.baseQuantity,
      orderedQuantity: ordered,
      outstandingQuantity: outstanding,
      unit: line.product.unit,
      purchaseUnit: line.product.purchaseUnit,
      moq: line.product.moq,
      deliveryDate: line.deliveryDate,
      requester: line.pr.requester,
      customerName: line.soLine?.so.customer.name ?? null,
      soNumber: line.soLine?.so.soNumber ?? null,
      prNumber: line.pr.prNumber,
      supplierId: line.product.defaultSupplierId,
      supplierName: line.product.defaultSupplier?.name ?? null,
      status: line.status,
    });
  }

  for (const line of soLines) {
    const ordered = round(
      line.demandLinks.reduce((sum, link) => sum + link.quantity, 0)
    );
    const outstanding = round(line.baseQuantity - ordered);
    if (!options?.includeCovered && outstanding <= 0) continue;
    rows.push({
      kind: "so",
      lineId: line.id,
      documentNumber: line.so.soNumber,
      documentId: line.soId,
      productId: line.productId,
      productCode: line.product.prCode,
      productName: line.product.name,
      productNameTh: line.product.nameTh,
      requiredQuantity: line.baseQuantity,
      orderedQuantity: ordered,
      outstandingQuantity: outstanding,
      unit: line.product.unit,
      purchaseUnit: line.product.purchaseUnit,
      moq: line.product.moq,
      deliveryDate: line.deliveryDate,
      requester: line.so.requester,
      customerName: line.so.customer.name,
      soNumber: line.so.soNumber,
      prNumber: null,
      supplierId: line.product.defaultSupplierId,
      supplierName: line.product.defaultSupplier?.name ?? null,
      status: line.status,
    });
  }

  return rows.sort(
    (a, b) => a.deliveryDate.getTime() - b.deliveryDate.getTime()
  );
}

export interface SupplierSummaryRow {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  productId: string;
  productCode: string;
  productName: string;
  requiredQuantity: number;
  orderQuantity: number;
  moq: number | null;
  difference: number;
  differencePct: number | null;
  reason: string | null;
  unit: string;
  deliveryDate: Date;
  poNumber: string;
  poId: string;
  poLineId: string;
  status: string;
}

/** §2.1 — ordered vs required per supplier and product. */
export async function supplierSummary(filters?: {
  supplierId?: string;
  productId?: string;
  status?: string;
  from?: Date;
  to?: Date;
}): Promise<SupplierSummaryRow[]> {
  const lines = await prisma.scmPurchaseOrderLine.findMany({
    where: {
      ...(filters?.productId ? { productId: filters.productId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.from || filters?.to
        ? {
            deliveryDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      po: filters?.supplierId ? { supplierId: filters.supplierId } : undefined,
    },
    include: { po: { include: { supplier: true } }, product: true },
    orderBy: { deliveryDate: "asc" },
  });

  return lines.map((line) => {
    const difference = round(line.baseQuantity - line.requiredQuantity);
    return {
      supplierId: line.po.supplierId,
      supplierCode: line.po.supplier.code,
      supplierName: line.po.supplier.name,
      productId: line.productId,
      productCode: line.product.prCode,
      productName: line.product.name,
      requiredQuantity: line.requiredQuantity,
      orderQuantity: line.baseQuantity,
      moq: line.moq,
      difference,
      differencePct:
        line.requiredQuantity > 0
          ? round((difference / line.requiredQuantity) * 100, 2)
          : null,
      reason: line.adjustmentReason,
      unit: line.product.unit,
      deliveryDate: line.deliveryDate,
      poNumber: line.po.poNumber,
      poId: line.poId,
      poLineId: line.id,
      status: line.status,
    };
  });
}

export interface PoVsSoRow {
  key: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  soQuantity: number;
  poQuantity: number;
  difference: number | null;
  differencePct: number | null;
  status: ComparisonStatus;
  deliveryDate: Date | null;
  supplierName: string | null;
  soNumbers: string[];
  poNumbers: string[];
}

/**
 * §5 — PO vs SO per product and delivery date, including the two asymmetric
 * cases the spec calls out: demand with no PO, and a PO with no demand.
 */
export async function poVsSo(): Promise<PoVsSoRow[]> {
  const settings = await getScmSettings();
  const [soLines, poLines] = await Promise.all([
    prisma.scmSalesOrderLine.findMany({
      include: { so: true, product: true },
    }),
    prisma.scmPurchaseOrderLine.findMany({
      include: { po: { include: { supplier: true } }, product: true },
    }),
  ]);

  type Bucket = {
    productId: string;
    productCode: string;
    productName: string;
    unit: string;
    soQuantity: number;
    poQuantity: number;
    deliveryDate: Date | null;
    supplierName: string | null;
    soNumbers: Set<string>;
    poNumbers: Set<string>;
  };

  const buckets = new Map<string, Bucket>();
  const keyOf = (productId: string, date: Date) =>
    `${productId}:${date.toISOString().slice(0, 10)}`;

  const ensure = (
    key: string,
    seed: Omit<Bucket, "soNumbers" | "poNumbers">
  ): Bucket => {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { ...seed, soNumbers: new Set(), poNumbers: new Set() };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  for (const line of soLines) {
    const key = keyOf(line.productId, line.deliveryDate);
    const bucket = ensure(key, {
      productId: line.productId,
      productCode: line.product.prCode,
      productName: line.product.name,
      unit: line.product.unit,
      soQuantity: 0,
      poQuantity: 0,
      deliveryDate: line.deliveryDate,
      supplierName: null,
    });
    bucket.soQuantity = round(bucket.soQuantity + line.baseQuantity);
    bucket.soNumbers.add(line.so.soNumber);
  }

  for (const line of poLines) {
    const key = keyOf(line.productId, line.deliveryDate);
    const bucket = ensure(key, {
      productId: line.productId,
      productCode: line.product.prCode,
      productName: line.product.name,
      unit: line.product.unit,
      soQuantity: 0,
      poQuantity: 0,
      deliveryDate: line.deliveryDate,
      supplierName: line.po.supplier.name,
    });
    bucket.poQuantity = round(bucket.poQuantity + line.baseQuantity);
    bucket.poNumbers.add(line.po.poNumber);
    bucket.supplierName ??= line.po.supplier.name;
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => {
      const comparison = comparePoSo(
        bucket.soQuantity || null,
        bucket.poQuantity || null,
        settings.qtyTolerancePct
      );
      return {
        key,
        productId: bucket.productId,
        productCode: bucket.productCode,
        productName: bucket.productName,
        unit: bucket.unit,
        soQuantity: bucket.soQuantity,
        poQuantity: bucket.poQuantity,
        difference: comparison.diff,
        differencePct: comparison.diffPct,
        status: comparison.status,
        deliveryDate: bucket.deliveryDate,
        supplierName: bucket.supplierName,
        soNumbers: [...bucket.soNumbers],
        poNumbers: [...bucket.poNumbers],
      };
    })
    .sort((a, b) => {
      const ta = a.deliveryDate?.getTime() ?? 0;
      const tb = b.deliveryDate?.getTime() ?? 0;
      return ta - tb;
    });
}

export interface ScmDashboard {
  purchasing: {
    poPending: number;
    poInvoiceMismatch: number;
    quantityDifference: number;
    priceDifference: number;
    poWithoutInvoice: number;
    latestSuppliers: {
      supplierName: string;
      lines: number;
      mismatches: number;
      onTimePct: number;
    }[];
  };
  sales: {
    soQuantityMismatch: number;
    awaitingCustomer: number;
    toReduce: number;
    excess: number;
    toStock: number;
  };
  warehouse: {
    shipmentsToday: number;
    readyToReceive: number;
    pendingAllocation: number;
    received: number;
    blocked: number;
    unallocatedQuantity: number;
  };
  management: {
    totalPo: number;
    totalSo: number;
    totalInvoice: number;
    totalReceived: number;
    totalCustomerAllocation: number;
    totalWarehouseStock: number;
    quantityVariance: number;
    priceVariance: number;
  };
  openExceptions: number;
}

/** §9 — every number on the management dashboard, in one round trip. */
export async function dashboardMetrics(now = new Date()): Promise<ScmDashboard> {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const [
    poLines,
    recons,
    salesRecons,
    allocations,
    receivingLines,
    shipmentsToday,
    totals,
    openExceptions,
    poWithoutInvoice,
    supplierStats,
  ] = await Promise.all([
    prisma.scmPurchaseOrderLine.findMany({
      select: { status: true, baseQuantity: true, correctedQuantity: true },
    }),
    prisma.scmPoInvoiceRecon.findMany({
      select: {
        status: true,
        qtyStatus: true,
        priceStatus: true,
        qtyDiff: true,
        priceDiff: true,
        invoiceQuantity: true,
        poQuantity: true,
      },
    }),
    prisma.scmSoPoRecon.findMany({
      select: { status: true, diffStatus: true, decision: true, diff: true },
    }),
    prisma.scmAllocation.findMany({
      select: {
        status: true,
        unallocatedQuantity: true,
        allocatedQuantity: true,
        warehouseQuantity: true,
      },
    }),
    prisma.scmReceivingLine.findMany({
      select: { status: true, actualQuantity: true },
    }),
    prisma.scmShipment.count({
      where: { shipDate: { gte: startOfDay, lt: endOfDay } },
    }),
    Promise.all([
      prisma.scmPurchaseOrder.count(),
      prisma.scmSalesOrder.count(),
      prisma.scmInvoice.count(),
    ]),
    prisma.scmException.count({ where: { status: { in: ["open", "in_progress"] } } }),
    prisma.scmPurchaseOrder.count({
      where: { invoices: { none: {} }, status: { notIn: ["draft", "cancelled"] } },
    }),
    prisma.scmPurchaseOrder.findMany({
      select: {
        supplier: { select: { name: true } },
        lines: { select: { id: true } },
        recons: { select: { qtyStatus: true, priceStatus: true } },
      },
    }),
  ]);

  const quantityDifference = round(
    recons.reduce((sum, r) => sum + Math.abs(r.qtyDiff ?? 0), 0)
  );
  const priceDifference = round(
    recons.reduce((sum, r) => sum + Math.abs(r.priceDiff ?? 0), 0)
  );

  const suppliers = new Map<
    string,
    { lines: number; mismatches: number }
  >();
  for (const po of supplierStats) {
    const entry = suppliers.get(po.supplier.name) ?? { lines: 0, mismatches: 0 };
    entry.lines += po.lines.length;
    entry.mismatches += po.recons.filter(
      (r) => r.qtyStatus !== "match" || r.priceStatus === "higher" || r.priceStatus === "lower"
    ).length;
    suppliers.set(po.supplier.name, entry);
  }

  return {
    purchasing: {
      poPending: poLines.filter((l) =>
        ["PO_CREATED", "PENDING_INVOICE"].includes(l.status)
      ).length,
      poInvoiceMismatch: recons.filter((r) => r.status !== "approved").length,
      quantityDifference,
      priceDifference,
      poWithoutInvoice,
      latestSuppliers: [...suppliers.entries()]
        .map(([supplierName, stat]) => ({
          supplierName,
          lines: stat.lines,
          mismatches: stat.mismatches,
          onTimePct:
            stat.lines === 0
              ? 100
              : round(((stat.lines - stat.mismatches) / stat.lines) * 100, 1),
        }))
        .sort((a, b) => b.mismatches - a.mismatches)
        .slice(0, 6),
    },
    sales: {
      soQuantityMismatch: salesRecons.filter((r) => r.diffStatus !== "match")
        .length,
      awaitingCustomer: salesRecons.filter(
        (r) => r.status === "pending_sales_review"
      ).length,
      toReduce: salesRecons.filter((r) => r.diffStatus === "short").length,
      excess: salesRecons.filter((r) => r.diffStatus === "over").length,
      toStock: salesRecons.filter((r) => r.decision === "warehouse_stock")
        .length,
    },
    warehouse: {
      shipmentsToday,
      readyToReceive: poLines.filter((l) => l.status === "READY_TO_RECEIVE")
        .length,
      pendingAllocation: poLines.filter((l) => l.status === "PENDING_ALLOCATION")
        .length,
      received: poLines.filter((l) =>
        ["RECEIVED", "COMPLETED"].includes(l.status)
      ).length,
      blocked: poLines.filter((l) => l.status === "BLOCKED").length,
      unallocatedQuantity: round(
        allocations.reduce((sum, a) => sum + a.unallocatedQuantity, 0)
      ),
    },
    management: {
      totalPo: totals[0],
      totalSo: totals[1],
      totalInvoice: totals[2],
      totalReceived: round(
        receivingLines.reduce((sum, l) => sum + l.actualQuantity, 0)
      ),
      totalCustomerAllocation: round(
        allocations.reduce((sum, a) => sum + a.allocatedQuantity, 0)
      ),
      totalWarehouseStock: round(
        allocations.reduce((sum, a) => sum + a.warehouseQuantity, 0)
      ),
      quantityVariance: quantityDifference,
      priceVariance: priceDifference,
    },
    openExceptions,
  };
}
