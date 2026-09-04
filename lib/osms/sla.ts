/**
 * SLA control (§27). Every transaction that someone owes an action on
 * carries a due date, an owner and a priority; this module turns those into
 * the four states the boards colour by.
 *
 * Pure by design: the same computation runs on the server for sorting and in
 * the browser for the countdown, and neither can drift.
 */

export const SLA_STATUSES = [
  "on_track",
  "due_soon",
  "overdue",
  "completed",
] as const;
export type SlaStatus = (typeof SLA_STATUSES)[number];

export const SLA_LABELS: Record<SlaStatus, string> = {
  on_track: "On track",
  due_soon: "Due soon",
  overdue: "Overdue",
  completed: "Completed",
};

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/** Higher first when sorting a queue. */
export const PRIORITY_RANK: Record<Priority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export interface SlaState {
  status: SlaStatus;
  /** Negative when overdue. Null when there is no due date. */
  remainingDays: number | null;
  label: string;
}

const DAY = 86_400_000;

/** Whole days between two dates, ignoring the time of day. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / DAY);
}

/**
 * `dueSoonDays` is the warning window from Settings (default 3): inside it a
 * transaction turns yellow before anyone is actually late.
 */
export function slaState(
  dueDate: Date | null | undefined,
  options: {
    done?: boolean;
    now?: Date;
    dueSoonDays?: number;
  } = {}
): SlaState {
  if (options.done) {
    return { status: "completed", remainingDays: null, label: "Completed" };
  }
  if (!dueDate) {
    return { status: "on_track", remainingDays: null, label: "No due date" };
  }
  const now = options.now ?? new Date();
  const remainingDays = daysBetween(now, dueDate);
  const window = options.dueSoonDays ?? 3;

  if (remainingDays < 0) {
    const late = Math.abs(remainingDays);
    return {
      status: "overdue",
      remainingDays,
      label: `Overdue by ${late} day${late === 1 ? "" : "s"}`,
    };
  }
  if (remainingDays <= window) {
    return {
      status: "due_soon",
      remainingDays,
      label:
        remainingDays === 0
          ? "Due today"
          : `Due in ${remainingDays} day${remainingDays === 1 ? "" : "s"}`,
    };
  }
  return {
    status: "on_track",
    remainingDays,
    label: `${remainingDays} days left`,
  };
}

/** Queue ordering: overdue first, then by priority, then by how soon it is due. */
export function slaSortKey(entry: {
  sla: SlaState;
  priority?: string | null;
}): number {
  const statusWeight =
    entry.sla.status === "overdue"
      ? 0
      : entry.sla.status === "due_soon"
        ? 1
        : entry.sla.status === "on_track"
          ? 2
          : 3;
  const priority =
    PRIORITY_RANK[(entry.priority as Priority) ?? "medium"] ?? 2;
  const remaining = entry.sla.remainingDays ?? 999;
  return statusWeight * 100_000 + (5 - priority) * 1_000 + remaining;
}

/**
 * Due dates the workflow sets when it hands work to a department. Counted
 * back from the delivery date, so the closer the delivery the tighter the SLA.
 */
export const SLA_LEAD_DAYS = {
  invoiceVerification: 2,
  poInvoiceReconciliation: 2,
  salesReview: 2,
  allocation: 1,
  shortageApproval: 1,
  receiving: 0,
} as const;

export function dueDateFor(
  deliveryDate: Date | null | undefined,
  step: keyof typeof SLA_LEAD_DAYS,
  now = new Date()
): Date {
  const lead = SLA_LEAD_DAYS[step];
  if (!deliveryDate) {
    const fallback = new Date(now);
    fallback.setUTCDate(fallback.getUTCDate() + Math.max(lead, 1));
    return fallback;
  }
  const due = new Date(deliveryDate);
  due.setUTCDate(due.getUTCDate() - lead);
  // Never hand someone a due date that is already behind them.
  return due < now ? now : due;
}
