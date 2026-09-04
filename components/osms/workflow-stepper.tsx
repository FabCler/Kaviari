import { Check, CircleDashed, CircleDot, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { WORKFLOW_STEPS, statusRank, type WorkflowStatus } from "@/lib/osms/status";

/**
 * Progress stepper for a document detail page (§19):
 * SO → PR → PO → Invoice → Reconciliation → Allocation → Receiving → Shipment.
 */
export function WorkflowStepper({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const blocked = status === "BLOCKED" || status === "CANCELLED";
  const current = statusRank(status);

  return (
    <ol
      className={cn("flex flex-wrap items-center gap-x-1 gap-y-2", className)}
      aria-label="Workflow progress"
    >
      {WORKFLOW_STEPS.map((step, index) => {
        const stepRank = Math.max(
          ...step.statuses.map((value) => statusRank(value as WorkflowStatus))
        );
        const done = !blocked && current > stepRank;
        const active =
          !blocked &&
          step.statuses.includes(status as never);
        const Icon = blocked && active ? TriangleAlert : done ? Check : active ? CircleDot : CircleDashed;

        return (
          <li key={step.key} className="flex items-center gap-1">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap",
                done && "border-success/30 bg-success/10 text-success",
                active && "border-chart-2/40 bg-chart-2/10 font-medium text-chart-2",
                !done && !active && "border-border bg-muted text-muted-foreground",
                blocked && active && "border-destructive/40 bg-destructive/10 text-destructive"
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {step.label}
            </span>
            {index < WORKFLOW_STEPS.length - 1 ? (
              <span
                className={cn(
                  "h-px w-3",
                  done ? "bg-success/40" : "bg-border"
                )}
                aria-hidden
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
