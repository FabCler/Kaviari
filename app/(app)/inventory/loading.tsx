import { Skeleton } from "@/components/ui/skeleton";

export default function InventoryLoading() {
  return (
    <div>
      <div className="mb-6 lg:mb-8">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <Skeleton className="mb-4 h-9 w-72" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
