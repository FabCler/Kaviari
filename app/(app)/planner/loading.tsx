import { Skeleton } from "@/components/ui/skeleton";

export default function PlannerLoading() {
  return (
    <div>
      <div className="mb-6 lg:mb-8">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        <div className="gold-rule mt-4 opacity-60" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
