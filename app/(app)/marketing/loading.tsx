import { Skeleton } from "@/components/ui/skeleton";

export default function MarketingLoading() {
  return (
    <div>
      <div className="mb-6 lg:mb-8">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-8 w-36" />
      </div>
      <Skeleton className="h-[28rem] rounded-lg" />
    </div>
  );
}
