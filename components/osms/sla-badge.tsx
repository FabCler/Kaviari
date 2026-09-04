import { cn } from "@/lib/utils";
import { slaState, PRIORITY_LABELS, type Priority } from "@/lib/osms/sla";

/**
 * SLA state (§27): due date, remaining days and priority in one cell.
 * Overdue is red, due-soon amber, everything else quiet.
 */
export function SlaBadge({
  dueDate,
  done,
  dueSoonDays,
  className,
}: {
  dueDate: Date | string | null | undefined;
  done?: boolean;
  dueSoonDays?: number;
  className?: string;
}) {
  const parsed =
    dueDate == null
      ? null
      : dueDate instanceof Date
        ? dueDate
        : new Date(dueDate);
  const state = slaState(parsed, { done, dueSoonDays });

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.68rem] font-medium whitespace-nowrap",
        state.status === "overdue" &&
          "border-destructive/30 bg-destructive/10 text-destructive",
        state.status === "due_soon" &&
          "border-warning/30 bg-warning/10 text-warning",
        state.status === "on_track" && "border-border bg-muted text-muted-foreground",
        state.status === "completed" &&
          "border-success/30 bg-success/10 text-success",
        className
      )}
    >
      {state.label}
    </span>
  );
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: string | null | undefined;
  className?: string;
}) {
  const value = (priority ?? "medium") as Priority;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[0.68rem] font-medium",
        value === "critical" && "bg-destructive/15 text-destructive",
        value === "high" && "bg-warning/15 text-warning",
        value === "medium" && "bg-muted text-muted-foreground",
        value === "low" && "bg-muted text-muted-foreground/70",
        className
      )}
    >
      {PRIORITY_LABELS[value] ?? value}
    </span>
  );
}
