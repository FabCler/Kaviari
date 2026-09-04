import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Compact metric tile used across the dashboards. `tone` colours the number
 * only — the card itself stays neutral so a wall of them stays readable.
 */
export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
  href,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warning" | "danger" | "success";
  href?: string;
  className?: string;
}) {
  const body = (
    <CardContent className="px-4 py-3.5">
      <div className="text-[0.68rem] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={cn(
          "tnum mt-1 text-2xl font-medium",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-destructive",
          tone === "success" && "text-success"
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </CardContent>
  );

  const card = (
    <Card
      className={cn(
        "gap-0 py-0",
        href && "transition-colors hover:border-gold/60",
        className
      )}
    >
      {body}
    </Card>
  );

  return href ? (
    <Link href={href} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}
