import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { Department } from "@/lib/scm/domain";

/**
 * Workflow notifications (§16). Alerts are written when the workflow moves,
 * addressed to the department that has to act next; the bell in the sidebar
 * and the department dashboards read from here.
 */

export type NotificationSeverity = "info" | "warning" | "critical";

export interface NotificationInput {
  department: Department;
  type: string;
  title: string;
  body?: string | null;
  severity?: NotificationSeverity;
  documentType?: string | null;
  documentId?: string | null;
  documentNumber?: string | null;
  link?: string | null;
}

export async function notify(
  inputs: NotificationInput | NotificationInput[],
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
  const list = Array.isArray(inputs) ? inputs : [inputs];
  if (list.length === 0) return;
  await client.scmNotification.createMany({
    data: list.map((input) => ({
      department: input.department,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      severity: input.severity ?? "info",
      documentType: input.documentType ?? null,
      documentId: input.documentId ?? null,
      documentNumber: input.documentNumber ?? null,
      link: input.link ?? null,
    })),
  });
}

export async function unreadFor(department: string, take = 20) {
  return prisma.scmNotification.findMany({
    where:
      department === "admin" || department === "management"
        ? { readAt: null }
        : { department, readAt: null },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function markRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.scmNotification.updateMany({
    where: { id: { in: ids } },
    data: { readAt: new Date() },
  });
}
