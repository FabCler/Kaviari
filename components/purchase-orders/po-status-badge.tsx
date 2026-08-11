import { Badge } from "@/components/ui/badge";
import type { PoStatus } from "@/lib/domain";

const STATUS_VARIANTS: Record<
  PoStatus,
  "secondary" | "gold" | "seafoam" | "success" | "outline"
> = {
  draft: "secondary",
  sent: "gold",
  confirmed: "seafoam",
  received: "success",
  cancelled: "outline",
};

export function PoStatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANTS[status as PoStatus] ?? "outline";
  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
  );
}
