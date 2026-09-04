import { prisma } from "@/lib/db";
import { round } from "@/lib/scm/units";
import { nearlyEqual } from "@/lib/scm/domain";

/**
 * Cross-channel shortage (§20, §45).
 *
 * When one delivery cannot cover the demand of more than one business
 * channel, the system stops. It lays out the shortfall per channel, proposes
 * a split from the channel priorities — and waits.
 *
 * **The system never reduces a customer on its own.** The proposal is a
 * starting point on a screen; nothing reaches a sales order until a person
 * with `shortage.approve` has signed the numbers off. That is the whole
 * reason this module exists rather than a `Math.min()` somewhere in the
 * allocation code.
 */

export interface ChannelDemand {
  channelId: string | null;
  channelCode: string;
  channelName: string;
  defaultPriority: number;
  soLineId: string;
  soNumber: string;
  customerId: string;
  customerName: string;
  requestedQuantity: number;
}

export interface ShortageProposalLine extends ChannelDemand {
  priority: number;
  proposedQuantity: number;
  reduction: number;
}

/**
 * Proportional split inside a priority band: channels ranked first are served
 * in full while stock lasts, and the band that runs out shares what is left
 * pro-rata. Whole numbers are not forced — seafood is sold by weight.
 */
export function proposeShortageSplit(
  actualQuantity: number,
  demands: ChannelDemand[]
): ShortageProposalLine[] {
  const sorted = [...demands].sort(
    (a, b) =>
      a.defaultPriority - b.defaultPriority ||
      b.requestedQuantity - a.requestedQuantity
  );

  let remaining = round(actualQuantity);
  const result: ShortageProposalLine[] = [];

  // Group by priority so channels that rank equally share the shortfall.
  const bands = new Map<number, ChannelDemand[]>();
  for (const demand of sorted) {
    const band = bands.get(demand.defaultPriority) ?? [];
    band.push(demand);
    bands.set(demand.defaultPriority, band);
  }

  for (const [priority, band] of [...bands.entries()].sort(
    (a, b) => a[0] - b[0]
  )) {
    const bandTotal = round(
      band.reduce((sum, demand) => sum + demand.requestedQuantity, 0)
    );

    if (remaining >= bandTotal - 0.0001) {
      for (const demand of band) {
        result.push({
          ...demand,
          priority,
          proposedQuantity: demand.requestedQuantity,
          reduction: 0,
        });
      }
      remaining = round(remaining - bandTotal);
      continue;
    }

    // This band is where the stock runs out — share it pro-rata.
    let assigned = 0;
    band.forEach((demand, index) => {
      const isLast = index === band.length - 1;
      const share = isLast
        ? round(Math.max(0, remaining - assigned))
        : round(
            bandTotal > 0
              ? (demand.requestedQuantity / bandTotal) * Math.max(0, remaining)
              : 0
          );
      assigned = round(assigned + share);
      result.push({
        ...demand,
        priority,
        proposedQuantity: share,
        reduction: round(demand.requestedQuantity - share),
      });
    });
    remaining = 0;
  }

  return result;
}

export interface ShortageValidation {
  ok: boolean;
  errors: string[];
  approvedTotal: number;
  unassigned: number;
}

/**
 * What an approver may sign. The approved quantities must add up to exactly
 * what arrived, and nobody may be promised more than they ordered.
 */
export function validateShortageDecision(
  actualQuantity: number,
  lines: { requestedQuantity: number; approvedQuantity: number | null }[]
): ShortageValidation {
  const errors: string[] = [];
  const approvedTotal = round(
    lines.reduce((sum, line) => sum + (line.approvedQuantity ?? 0), 0)
  );
  const unassigned = round(actualQuantity - approvedTotal);

  for (const [index, line] of lines.entries()) {
    const approved = line.approvedQuantity;
    if (approved == null) {
      errors.push(`Line ${index + 1}: decide a quantity for every channel.`);
      continue;
    }
    if (approved < 0) {
      errors.push(`Line ${index + 1}: the quantity cannot be negative.`);
    }
    if (approved > line.requestedQuantity + 0.0001) {
      errors.push(
        `Line ${index + 1}: ${approved} is more than the ${line.requestedQuantity} ordered.`
      );
    }
  }

  if (!nearlyEqual(unassigned, 0)) {
    errors.push(
      unassigned > 0
        ? `${unassigned} still unassigned — the approved quantities must add up to the ${actualQuantity} received.`
        : `Over-assigned by ${Math.abs(unassigned)} — only ${actualQuantity} arrived.`
    );
  }

  return { ok: errors.length === 0, errors, approvedTotal, unassigned };
}

/**
 * Raise a shortage case for one PO line when the confirmed quantity cannot
 * cover the demand it was bought for, and that demand spans more than one
 * channel. A single-channel shortfall is an ordinary sales review (§14);
 * only a cross-channel one needs management to rank the channels.
 */
export async function detectCrossChannelShortage(
  poLineId: string,
  confirmed: number,
  actorName?: string | null
): Promise<{ caseId: string; caseNumber: string } | null> {
  const poLine = await prisma.scmPurchaseOrderLine.findUnique({
    where: { id: poLineId },
    include: {
      product: true,
      po: true,
      demandLinks: {
        include: {
          soLine: {
            include: { so: { include: { customer: true, channel: true } } },
          },
        },
      },
    },
  });
  if (!poLine) return null;

  const demands: ChannelDemand[] = [];
  for (const link of poLine.demandLinks) {
    if (!link.soLine) continue;
    const so = link.soLine.so;
    demands.push({
      channelId: so.channelId,
      channelCode: so.channel?.code ?? "—",
      channelName: so.channel?.name ?? "Unassigned channel",
      defaultPriority: so.channel?.defaultPriority ?? 100,
      soLineId: link.soLine.id,
      soNumber: so.soNumber,
      customerId: so.customerId,
      customerName: so.customer.name,
      requestedQuantity: link.quantity,
    });
  }

  const totalDemand = round(
    demands.reduce((sum, demand) => sum + demand.requestedQuantity, 0)
  );
  const shortage = round(totalDemand - confirmed);
  const channels = new Set(demands.map((demand) => demand.channelId ?? "none"));

  if (shortage <= 0 || channels.size < 2) return null;

  const existing = await prisma.scmShortageCase.findFirst({
    where: {
      poLineId,
      status: { in: ["open", "pending_approval"] },
    },
  });
  if (existing) {
    return { caseId: existing.id, caseNumber: existing.caseNumber };
  }

  const proposal = proposeShortageSplit(confirmed, demands);
  const caseNumber = await nextShortageNumber();

  const created = await prisma.scmShortageCase.create({
    data: {
      caseNumber,
      productId: poLine.productId,
      poLineId,
      deliveryDate: poLine.deliveryDate,
      actualQuantity: confirmed,
      totalSoQuantity: totalDemand,
      shortageQuantity: shortage,
      unit: poLine.product.unit,
      status: "pending_approval",
      createdByName: actorName ?? null,
      lines: {
        create: proposal.map((line) => ({
          channelId: line.channelId,
          customerId: line.customerId,
          soLineId: line.soLineId,
          requestedQuantity: line.requestedQuantity,
          // A proposal, not a decision: approvedQuantity stays null until a
          // person signs it.
          approvedQuantity: null,
          priority: line.priority,
          reason: null,
        })),
      },
    },
  });

  return { caseId: created.id, caseNumber };
}

async function nextShortageNumber(date = new Date()): Promise<string> {
  const prefix = `SHT-${date.getUTCFullYear()}-`;
  const rows = await prisma.scmShortageCase.findMany({
    where: { caseNumber: { startsWith: prefix } },
    select: { caseNumber: true },
  });
  let max = 0;
  for (const row of rows) {
    const parsed = Number.parseInt(row.caseNumber.slice(prefix.length), 10);
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/** Open shortage cases blocking a purchase order. */
export async function openShortageCases(poId: string) {
  return prisma.scmShortageCase.findMany({
    where: {
      poLine: { poId },
      status: { in: ["open", "pending_approval"] },
    },
    select: { id: true, caseNumber: true, status: true },
  });
}
