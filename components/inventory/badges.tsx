import { formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export function CoverBadge({ days }: { days: number | null }) {
  if (days == null) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        —
      </Badge>
    );
  }
  const label = `${formatNumber(days, 0)}d`;
  if (days < 7) {
    return (
      <Badge variant="destructive" className="tnum">
        {label}
      </Badge>
    );
  }
  if (days < 15) {
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
