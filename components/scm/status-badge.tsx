import { cn } from "@/lib/utils";
import {
  STATUS_LABEL,
  STATUS_TONE,
  isWorkflowStatus,
  type StatusTone,
} from "@/lib/scm/status";

/**
 * Workflow status pill. The colour language is fixed across the module
 * (§19): green completed, yellow pending, red blocked, blue in progress,
 * grey not started.
 */

const TONE_CLASS: Record<StatusTone, string> = {
  done: "bg-success/12 text-success border-success/30",
  pending: "bg-warning/12 text-warning border-warning/30",
  blocked: "bg-destructive/10 text-destructive border-destructive/30",
  progress: "bg-chart-2/12 text-chart-2 border-chart-2/30",
  idle: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({
  status,
  className,
  label,
}: {
  status: string;
  className?: string;
  label?: string;
}) {
  const tone: StatusTone = isWorkflowStatus(status) ? STATUS_TONE[status] : "idle";
  const text =
    label ?? (isWorkflowStatus(status) ? STATUS_LABEL[status] : humanize(status));
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.68rem] font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        className
      )}
    >
      {text}
    </span>
  );
}

/** Same pill, driven by an explicit tone (document statuses, not workflow). */
export function ToneBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.68rem] font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/^\w/, (character) => character.toUpperCase());
}

/** Tone for the per-document statuses (invoice, receiving, allocation…). */
export function documentTone(status: string): StatusTone {
  switch (status) {
    case "verified":
    case "approved":
    case "completed":
    case "received":
    case "shipped":
    case "delivered":
    case "closed":
    case "resolved":
      return "done";
    case "rejected":
    case "blocked":
    case "cancelled":
      return "blocked";
    case "pending_review":
    case "pending_verification":
    case "pending_sales_review":
    case "partial_received":
    case "partial":
    case "open":
      return "pending";
    case "draft":
    case "uploaded":
    case "extracted":
      return "idle";
    default:
      return "progress";
  }
}
