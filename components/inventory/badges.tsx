import { formatWeeks } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

/** Weeks-of-cover badge: destructive under 1 week, warning under 2, "∞" when
 *  there is no measurable demand. */
export function CoverBadge({ weeks }: { weeks: number | null }) {
  if (weeks == null) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        ∞
      </Badge>
    );
  }
  const label = formatWeeks(weeks);
  if (weeks < 1) {
    return (
      <Badge variant="destructive" className="tnum">
        {label}
      </Badge>
    );
  }
  if (weeks < 2) {
    return (
      <Badge variant="warning" className="tnum">
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="tnum">
      {label}
    </Badge>
  );
}

export function DaysLeftBadge({ days }: { days: number }) {
  if (days < 0) return <Badge variant="destructive">expired</Badge>;
  if (days <= 14) {
    return (
      <Badge variant="warning" className="tnum">
        {days}d left
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="tnum">
      {days}d left
    </Badge>
  );
}
