import { Skeleton } from "@/components/ui/skeleton";

export default function ConsumeLoading() {
  return (
    <div>
      <div className="mb-6 lg:mb-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Skeleton className="h-9 w-72" />
            <Skeleton className="mt-2 h-4 w-96 max-w-full" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="gold-rule mt-4 opacity-60" />
      </div>
      <div className="space-y-6">
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  );
}
