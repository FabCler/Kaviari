import { osms } from "@/lib/osms/db";
import type { Prisma } from "@/lib/generated/osms";
import type { Department } from "@/lib/osms/domain";

/**
 * Workflow notifications (§16). Alerts are written when the workflow moves,
 * addressed to the department that has to act next; the bell in the sidebar
 * and the department dashboards read from here.
 */

export type NotificationSeverity = "info" | "warning" | "critical";

export interface NotificationInput {
  department: Department;
  /** Null = the whole business; set, and only that channel's readers see it. */
  channelId?: string | null;
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
  client: Prisma.TransactionClient | typeof osms = osms
): Promise<void> {
  const list = Array.isArray(inputs) ? inputs : [inputs];
  if (list.length === 0) return;
  await client.notification.createMany({
    data: list.map((input) => ({
      department: input.department,
      channelId: input.channelId ?? null,
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

/**
 * Unread alerts for a department, narrowed to the channels the reader may
 * see. A notification with no channel concerns the whole business and goes
 * to everyone in that department.
 */
export async function unreadFor(
  department: string,
  options: { take?: number; channelIds?: string[] | null } = {}
) {
  const { take = 20, channelIds = null } = options;
  return osms.notification.findMany({
    where: {
      readAt: null,
      ...(department === "admin" || department === "management"
        ? {}
        : { department }),
      ...(channelIds
        ? { OR: [{ channelId: null }, { channelId: { in: channelIds } }] }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function markRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await osms.notification.updateMany({
    where: { id: { in: ids } },
    data: { readAt: new Date() },
  });
}
