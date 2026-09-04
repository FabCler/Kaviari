import { CircleCheck, CircleX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GateResult } from "@/lib/osms/gate";

/**
 * The six receiving checks (§7.1), rendered as the warehouse sees them:
 * READY TO RECEIVE, or BLOCKED with the exact step that is holding it up.
 */
export function GateChecklist({
  gate,
  className,
}: {
  gate: GateResult;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "rounded-md border px-3 py-2 text-sm font-medium",
          gate.ready
            ? "border-success/30 bg-success/10 text-success"
            : "border-destructive/30 bg-destructive/10 text-destructive"
        )}
      >
        {gate.ready ? "READY TO RECEIVE" : "BLOCKED"}
        {!gate.ready && gate.blockedReason ? (
          <p className="mt-0.5 text-xs font-normal">{gate.blockedReason}</p>
        ) : null}
      </div>
      <ol className="space-y-1.5">
        {gate.checks.map((check, index) => (
          <li key={check.id} className="flex items-start gap-2 text-sm">
            {check.ok ? (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            ) : (
              <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            )}
            <span className="min-w-0">
              <span className="font-medium">
                Check {index + 1} · {check.label}
              </span>
              <span className="block text-xs text-muted-foreground">
                {check.detail}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
