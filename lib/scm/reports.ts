import { prisma } from "@/lib/db";
import { round } from "@/lib/scm/units";

/**
 * Supplier performance (§33) and channel performance (§34).
 *
 * Both read the same skeleton — PO line → reconciliation → receiving →
 * shipment — from opposite ends: one groups by who sold it to us, the other
 * by who we sold it to.
 */

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return round((part / whole) * 100, 1);
}

export interface SupplierPerformanceRow {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  poLines: number;
  poQuantity: number;
  invoiceQuantity: number;
  actualQuantity: number;
  shortLines: number;
  excessLines: number;
  shortPct: number;
  excessPct: number;
  priceVariance: number;
  quantityAccuracyPct: number;
  priceAccuracyPct: number;
  onTimeDeliveryPct: number;
  deliveries: number;
}

export interface PerformanceFilters {
  supplierId?: string | null;
  productId?: string | null;
  channelId?: string | null;
  channelIds?: string[] | null;
  from?: Date | null;
  to?: Date | null;
}

export async function supplierPerformance(
  filters: PerformanceFilters = {}
): Promise<SupplierPerformanceRow[]> {
  const lines = await prisma.scmPurchaseOrderLine.findMany({
    where: {
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.from || filters.to
        ? {
            deliveryDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(filters.supplierId ? { po: { supplierId: filters.supplierId } } : {}),
      ...(filters.channelId
        ? { demandLinks: { some: { soLine: { so: { channelId: filters.channelId } } } } }
        : filters.channelIds
          ? {
              demandLinks: {
                some: { soLine: { so: { channelId: { in: filters.channelIds } } } },
              },
            }
          : {}),
    },
    include: {
      po: { include: { supplier: true } },
      recons: true,
      receivingLines: { include: { receiving: true } },
    },
  });

  const bySupplier = new Map<string, SupplierPerformanceRow>();

  for (const line of lines) {
    const key = line.po.supplierId;
    const row =
      bySupplier.get(key) ??
      ({
        supplierId: key,
        supplierCode: line.po.supplier.code,
        supplierName: line.po.supplier.name,
        poLines: 0,
        poQuantity: 0,
        invoiceQuantity: 0,
        actualQuantity: 0,
        shortLines: 0,
        excessLines: 0,
        shortPct: 0,
        excessPct: 0,
        priceVariance: 0,
        quantityAccuracyPct: 0,
        priceAccuracyPct: 0,
        onTimeDeliveryPct: 0,
        deliveries: 0,
      } satisfies SupplierPerformanceRow);

    row.poLines += 1;
    row.poQuantity = round(row.poQuantity + line.baseQuantity);

    const recon = line.recons[0];
    if (recon) {
      row.invoiceQuantity = round(
        row.invoiceQuantity + (recon.invoiceQuantity ?? 0)
      );
      if (recon.qtyStatus === "short" || recon.qtyStatus === "missing_on_invoice") {
        row.shortLines += 1;
      }
      if (recon.qtyStatus === "over") row.excessLines += 1;
      row.priceVariance = round(
        row.priceVariance + Math.abs(recon.priceDiff ?? 0),
        2
      );
    }

    for (const receivingLine of line.receivingLines) {
      row.actualQuantity = round(row.actualQuantity + receivingLine.actualQuantity);
      row.deliveries += 1;
      // On time = arrived on or before the date the PO line promised.
      if (receivingLine.receiving.receivedDate <= line.deliveryDate) {
        row.onTimeDeliveryPct += 1; // counted, converted below
      }
    }

    bySupplier.set(key, row);
  }

  return [...bySupplier.values()]
    .map((row) => {
      const reconciledLines = row.shortLines + row.excessLines;
      const priceIssueLines = row.priceVariance > 0 ? 1 : 0;
      return {
        ...row,
        shortPct: pct(row.shortLines, row.poLines),
        excessPct: pct(row.excessLines, row.poLines),
        quantityAccuracyPct: pct(row.poLines - reconciledLines, row.poLines),
        priceAccuracyPct: pct(row.poLines - priceIssueLines * row.shortLines, row.poLines),
        onTimeDeliveryPct: pct(row.onTimeDeliveryPct, Math.max(row.deliveries, 1)),
      };
    })
    .sort((a, b) => b.poQuantity - a.poQuantity);
}

export interface ChannelPerformanceRow {
  channelId: string | null;
  channelCode: string;
  channelName: string;
  soQuantity: number;
  poQuantity: number;
  actualQuantity: number;
  shipmentQuantity: number;
  shortQuantity: number;
  excessQuantity: number;
  stockQuantity: number;
  soCount: number;
  customerCount: number;
}

export async function channelPerformance(
  filters: PerformanceFilters = {}
): Promise<ChannelPerformanceRow[]> {
  const channelWhere = filters.channelId
    ? { channelId: filters.channelId }
    : filters.channelIds
      ? { channelId: { in: filters.channelIds } }
      : {};

  const dateWhere =
    filters.from || filters.to
      ? {
          deliveryDate: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {};

  const [soLines, stock, channels] = await Promise.all([
    prisma.scmSalesOrderLine.findMany({
      where: {
        ...(filters.productId ? { productId: filters.productId } : {}),
        ...dateWhere,
        so: channelWhere,
      },
      include: {
        so: { include: { channel: true } },
        demandLinks: { include: { poLine: { include: { receivingLines: true } } } },
        soPoRecons: true,
        allocationLines: { include: { shipmentLines: true } },
      },
    }),
    prisma.scmWarehouseStock.findMany({
      where: {
        status: { in: ["on_hand", "reserved"] },
        ...(filters.productId ? { productId: filters.productId } : {}),
        ...channelWhere,
      },
      select: { channelId: true, quantity: true },
    }),
    prisma.businessChannel.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
  ]);

  const rows = new Map<string, ChannelPerformanceRow>();
  const customers = new Map<string, Set<string>>();
  const orders = new Map<string, Set<string>>();

  const ensure = (
    channelId: string | null,
    code: string,
    name: string
  ): ChannelPerformanceRow => {
    const key = channelId ?? "none";
    const existing = rows.get(key);
    if (existing) return existing;
    const created: ChannelPerformanceRow = {
      channelId,
      channelCode: code,
      channelName: name,
      soQuantity: 0,
      poQuantity: 0,
      actualQuantity: 0,
      shipmentQuantity: 0,
      shortQuantity: 0,
      excessQuantity: 0,
      stockQuantity: 0,
      soCount: 0,
      customerCount: 0,
    };
    rows.set(key, created);
    return created;
  };

  // Seed every active channel so a channel with no activity still shows up
  // as a zero row rather than vanishing from the report.
  for (const channel of channels) {
    if (filters.channelId && channel.id !== filters.channelId) continue;
    if (filters.channelIds && !filters.channelIds.includes(channel.id)) continue;
    ensure(channel.id, channel.code, channel.name);
  }

  for (const line of soLines) {
    const channel = line.so.channel;
    const row = ensure(
      line.so.channelId,
      channel?.code ?? "—",
      channel?.name ?? "Unassigned channel"
    );
    const key = line.so.channelId ?? "none";

    row.soQuantity = round(row.soQuantity + line.baseQuantity);

    const poShare = round(
      line.demandLinks.reduce((sum, link) => sum + link.quantity, 0)
    );
    row.poQuantity = round(row.poQuantity + poShare);

    const receivedShare = round(
      line.demandLinks.reduce((sum, link) => {
        const poLine = link.poLine;
        if (!poLine) return sum;
        const poLineReceived = poLine.receivingLines.reduce(
          (total, rl) => total + rl.actualQuantity,
          0
        );
        // Attribute the receipt to this SO line in the ratio it was mapped.
        const ratio =
          poLine.baseQuantity > 0 ? link.quantity / poLine.baseQuantity : 0;
        return sum + poLineReceived * ratio;
      }, 0)
    );
    row.actualQuantity = round(row.actualQuantity + receivedShare);

    for (const recon of line.soPoRecons) {
      if (recon.diffStatus === "short") {
        row.shortQuantity = round(row.shortQuantity + Math.abs(recon.diff));
      } else if (recon.diffStatus === "over") {
        row.excessQuantity = round(row.excessQuantity + recon.diff);
      }
    }

    for (const allocationLine of line.allocationLines) {
      for (const shipmentLine of allocationLine.shipmentLines) {
        row.shipmentQuantity = round(row.shipmentQuantity + shipmentLine.quantity);
      }
    }

    const customerSet = customers.get(key) ?? new Set<string>();
    customerSet.add(line.so.customerId);
    customers.set(key, customerSet);

    const orderSet = orders.get(key) ?? new Set<string>();
    orderSet.add(line.soId);
    orders.set(key, orderSet);
  }

  for (const entry of stock) {
    const key = entry.channelId ?? "none";
    const row = rows.get(key);
    if (!row) continue;
    row.stockQuantity = round(row.stockQuantity + entry.quantity);
  }

  for (const [key, row] of rows) {
    row.customerCount = customers.get(key)?.size ?? 0;
    row.soCount = orders.get(key)?.size ?? 0;
  }

  return [...rows.values()].sort((a, b) =>
    a.channelCode.localeCompare(b.channelCode)
  );
}
