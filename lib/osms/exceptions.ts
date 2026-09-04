import { osms } from "@/lib/osms/db";
import type { Prisma } from "@/lib/generated/osms";
import type {
  Department,
  ExceptionSeverity,
  ExceptionType,
} from "@/lib/osms/domain";
import { nextExceptionCode } from "@/lib/osms/numbering";
import type { Priority } from "@/lib/osms/sla";

/**
 * Exception management (§15). Every exception carries the five things the
 * spec insists on: reason, responsible department, action, due date, status.
 * Raising one is idempotent per document + type so a re-import or a second
 * reconciliation run does not spam the queue.
 */

export interface RaiseExceptionInput {
  type: ExceptionType;
  severity?: ExceptionSeverity;
  documentType?: string | null;
  documentId?: string | null;
  documentNumber?: string | null;
  productId?: string | null;
  channelId?: string | null;
  description: string;
  reason?: string | null;
  responsibleDept: Department;
  /** The person accountable, not just the department (§26). */
  ownerName?: string | null;
  priority?: Priority;
  action?: string | null;
  dueDate?: Date | null;
  createdByName?: string | null;
}

export async function raiseException(
  input: RaiseExceptionInput,
  client: Prisma.TransactionClient | typeof osms = osms
) {
  const existing = await client.exception.findFirst({
    where: {
      type: input.type,
      documentType: input.documentType ?? null,
      documentId: input.documentId ?? null,
      status: { in: ["open", "in_progress"] },
    },
  });
  if (existing) return existing;

  const code = await nextExceptionCode();
  return client.exception.create({
    data: {
      code,
      type: input.type,
      severity: input.severity ?? "medium",
      documentType: input.documentType ?? null,
      documentId: input.documentId ?? null,
      documentNumber: input.documentNumber ?? null,
      productId: input.productId ?? null,
      channelId: input.channelId ?? null,
      description: input.description,
      reason: input.reason ?? null,
      responsibleDept: input.responsibleDept,
      ownerName: input.ownerName ?? null,
      priority: input.priority ?? "medium",
      action: input.action ?? null,
      dueDate: input.dueDate ?? null,
      createdByName: input.createdByName ?? null,
    },
  });
}

/** Close every open exception raised for a document + type. */
export async function resolveExceptions(
  where: { type?: ExceptionType; documentType: string; documentId: string },
  resolution: { resolution: string; resolvedByName?: string | null },
  client: Prisma.TransactionClient | typeof osms = osms
): Promise<void> {
  await client.exception.updateMany({
    where: {
      ...(where.type ? { type: where.type } : {}),
      documentType: where.documentType,
      documentId: where.documentId,
      status: { in: ["open", "in_progress"] },
    },
    data: {
      status: "resolved",
      resolution: resolution.resolution,
      resolvedByName: resolution.resolvedByName ?? null,
      resolvedAt: new Date(),
    },
  });
}

/**
 * Flow §4 — sweep for PO/Invoice differences still open past their delivery
 * date, and raise one exception each.
 *
 * Purchasing is supposed to settle a difference before the goods arrive. When
 * that date passes, nobody is going to notice on their own: the warehouse only
 * finds out when it tries to receive and the gate refuses. This turns a silent
 * block into an owned, dated case on the Exception Center.
 *
 * Idempotent — `raiseException` returns the existing open case rather than
 * stacking a new one on every page load — and it also closes cases whose line
 * has since been settled, so the board never shows stale red.
 */
export async function sweepOverdueReconciliations(
  now: Date = new Date()
): Promise<{ raised: number; cleared: number }> {
  const overdue = await osms.poInvoiceRecon.findMany({
    where: {
      status: { notIn: ["approved", "rejected"] },
      deliveryDate: { lt: now },
    },
    include: { po: { select: { poNumber: true } }, product: true },
  });

  let raised = 0;
  for (const row of overdue) {
    const days = Math.max(
      1,
      Math.round((now.getTime() - row.deliveryDate!.getTime()) / 86_400_000)
    );
    await raiseException({
      type: "RECON_PAST_DELIVERY",
      severity: "high",
      documentType: "po_invoice_reconciliation",
      documentId: row.id,
      documentNumber: row.po.poNumber,
      productId: row.productId,
      description:
        `${row.product.code} ${row.product.name}: the PO/Invoice difference is still open ` +
        `${days} day${days === 1 ? "" : "s"} after the delivery date. Receiving cannot book this line in.`,
      responsibleDept: "purchasing",
      priority: "critical",
      action: "Confirm the quantity that actually arrived, with a reason.",
      dueDate: row.deliveryDate,
      createdByName: "System (SLA sweep)",
    });
    raised += 1;
  }

  // Anything settled since the last sweep stops being an exception.
  const settled = await osms.poInvoiceRecon.findMany({
    where: { status: { in: ["approved", "rejected"] } },
    select: { id: true },
  });
  const { count: cleared } = await osms.exception.updateMany({
    where: {
      type: "RECON_PAST_DELIVERY",
      status: { in: ["open", "in_progress"] },
      documentId: { in: settled.map((row) => row.id) },
    },
    data: {
      status: "resolved",
      resolution: "The reconciliation was settled.",
      resolvedByName: "System (SLA sweep)",
      resolvedAt: now,
    },
  });

  return { raised, cleared };
}
