import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type {
  Department,
  ExceptionSeverity,
  ExceptionType,
} from "@/lib/scm/domain";
import { nextExceptionCode } from "@/lib/scm/numbering";
import type { Priority } from "@/lib/scm/sla";

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
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const existing = await client.scmException.findFirst({
    where: {
      type: input.type,
      documentType: input.documentType ?? null,
      documentId: input.documentId ?? null,
      status: { in: ["open", "in_progress"] },
    },
  });
  if (existing) return existing;

  const code = await nextExceptionCode();
  return client.scmException.create({
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
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
  await client.scmException.updateMany({
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
