import { prisma } from "@/lib/db";

/**
 * Document numbering. Every generated document gets a human-readable,
 * sortable number (PO-2026-0007) — these are what people quote on the phone,
 * so they must never be reused, even after a delete.
 */

function yearOf(date: Date): string {
  return String(date.getUTCFullYear());
}

function nextSequence(existing: string[], prefix: string): number {
  let max = 0;
  for (const value of existing) {
    const tail = value.slice(prefix.length);
    const parsed = Number.parseInt(tail, 10);
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return max + 1;
}

async function nextNumber(
  kind: "PO" | "RCV" | "ALC" | "SHP" | "EXC" | "PR" | "SO",
  date = new Date()
): Promise<string> {
  const prefix = `${kind}-${yearOf(date)}-`;
  const existing = await currentNumbers(kind, prefix);
  const seq = nextSequence(existing, prefix);
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

async function currentNumbers(kind: string, prefix: string): Promise<string[]> {
  const where = { startsWith: prefix };
  switch (kind) {
    case "PO": {
      const rows = await prisma.scmPurchaseOrder.findMany({
        where: { poNumber: where },
        select: { poNumber: true },
      });
      return rows.map((r) => r.poNumber);
    }
    case "RCV": {
      const rows = await prisma.scmReceiving.findMany({
        where: { receiptNumber: where },
        select: { receiptNumber: true },
      });
      return rows.map((r) => r.receiptNumber);
    }
    case "ALC": {
      const rows = await prisma.scmAllocation.findMany({
        where: { allocationNumber: where },
        select: { allocationNumber: true },
      });
      return rows.map((r) => r.allocationNumber);
    }
    case "SHP": {
      const rows = await prisma.scmShipment.findMany({
        where: { shipmentNumber: where },
        select: { shipmentNumber: true },
      });
      return rows.map((r) => r.shipmentNumber);
    }
    case "EXC": {
      const rows = await prisma.scmException.findMany({
        where: { code: where },
        select: { code: true },
      });
      return rows.map((r) => r.code);
    }
    case "PR": {
      const rows = await prisma.scmPurchaseRequest.findMany({
        where: { prNumber: where },
        select: { prNumber: true },
      });
      return rows.map((r) => r.prNumber);
    }
    default: {
      const rows = await prisma.scmSalesOrder.findMany({
        where: { soNumber: where },
        select: { soNumber: true },
      });
      return rows.map((r) => r.soNumber);
    }
  }
}

export const nextPoNumber = (date?: Date) => nextNumber("PO", date);
export const nextReceiptNumber = (date?: Date) => nextNumber("RCV", date);
export const nextAllocationNumber = (date?: Date) => nextNumber("ALC", date);
export const nextShipmentNumber = (date?: Date) => nextNumber("SHP", date);
export const nextExceptionCode = (date?: Date) => nextNumber("EXC", date);

export { nextSequence };
