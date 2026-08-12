import { prisma } from "@/lib/db";
import { getPlannerData } from "@/lib/planner";
import { getExpiringLots } from "@/lib/stock";
import { OPEN_PO_STATUSES } from "@/lib/domain";
import { formatDate } from "@/lib/format";

/**
 * Compact plain-text snapshot of the business handed to the AI assistant and
 * contextual AI actions. Kept terse on purpose — it is prepended to every
 * assistant call.
 */
export async function buildBusinessSummary(now = new Date()): Promise<string> {
  const [planner, expiring, openPos, recentByChannel, campaigns] =
    await Promise.all([
      getPlannerData(now),
      getExpiringLots({ now }),
      prisma.purchaseOrder.findMany({
        where: { status: { in: [...OPEN_PO_STATUSES] } },
        include: { lines: { include: { product: true } } },
        orderBy: { expectedDeliveryDate: "asc" },
      }),
      prisma.stockMovement.groupBy({
        by: ["channel"],
        where: {
          type: { in: ["consumption", "sale", "marketing_sample"] },
          date: { gte: new Date(now.getTime() - 30 * 86_400_000) },
        },
        _sum: { quantityTins: true, gramsEquivalent: true },
      }),
      prisma.campaign.findMany({
        where: { status: { in: ["planned", "active"] } },
        include: { products: { include: { product: true } } },
        orderBy: { startDate: "asc" },
      }),
    ]);

  const { settings } = planner;
  const lines: string[] = [];

  lines.push(`# Business snapshot (${formatDate(now)})`);
  lines.push(
    `Replenishment policy: review every ${settings.reviewPeriodDays} days, ` +
      `lead time ${settings.leadTimeDays} days, safety stock ${settings.safetyStockDays} days, ` +
      `ADU window ${settings.aduWindowDays} days. Currency ${settings.currency}.`
  );
  lines.push(
    planner.nextOrderDate
      ? `Last order ${formatDate(planner.lastOrderDate!)}; next order due ${formatDate(planner.nextOrderDate)} (${planner.daysUntilOrder} days ${planner.daysUntilOrder! < 0 ? "OVERDUE" : "away"}).`
      : "No order recorded yet — an order is due now."
  );

  lines.push("");
  lines.push(
    "## Products (name | on hand units | on order units | ADU units/day | days cover | suggested order units)"
  );
  for (const row of planner.rows) {
    if (
      row.onHandUnits === 0 &&
      row.onOrderUnits === 0 &&
      row.aduUnitsPerDay === 0
    ) {
      continue; // dormant SKU — keep the summary small
    }
    const cover =
      row.daysOfCover == null ? "∞" : row.daysOfCover.toFixed(0);
    lines.push(
      `${row.product.name} | ${row.onHandUnits} | ${row.onOrderUnits} | ` +
        `${row.aduUnitsPerDay.toFixed(1)}${row.aduIsOverride ? " (manual)" : ""} | ${cover} | ${row.suggestion.suggestedUnits}`
    );
  }

  lines.push("");
  lines.push(`## Lots expiring within ${settings.expiryAlertDays} days`);
  if (expiring.length === 0) lines.push("None.");
  for (const lot of expiring) {
    lines.push(
      `${lot.productName} lot ${lot.lotNumber}: ${lot.quantityTins} tins, expires ${formatDate(lot.expiryDate)} (${lot.daysLeft} days)`
    );
  }

  lines.push("");
  lines.push("## Open purchase orders");
  if (openPos.length === 0) lines.push("None.");
  for (const po of openPos) {
    const items = po.lines
      .map((line) => `${line.product.name} × ${line.quantityTins}`)
      .join(", ");
    lines.push(
      `${po.reference} (${po.status}), ordered ${formatDate(po.orderDate)}, ETA ${formatDate(po.expectedDeliveryDate)}: ${items}`
    );
  }

  lines.push("");
  lines.push("## Consumption by channel, last 30 days (units, kg reference)");
  if (recentByChannel.length === 0) lines.push("None.");
  for (const row of recentByChannel) {
    lines.push(
      `${row.channel ?? "unspecified"}: ${Math.abs(row._sum.quantityTins ?? 0).toFixed(0)} units (${(Math.abs(row._sum.gramsEquivalent ?? 0) / 1000).toFixed(1)} kg)`
    );
  }

  lines.push("");
  lines.push("## Planned / active campaigns");
  if (campaigns.length === 0) lines.push("None.");
  for (const campaign of campaigns) {
    const products = campaign.products
      .map((cp) => cp.product.name)
      .join(", ");
    lines.push(
      `${campaign.name} (${campaign.type}, ${campaign.status}) ${formatDate(campaign.startDate)}${campaign.endDate ? `–${formatDate(campaign.endDate)}` : ""}${products ? ` — products: ${products}` : ""}`
    );
  }

  return lines.join("\n");
}
