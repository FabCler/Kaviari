import { Skeleton } from "@/components/ui/skeleton";

export default function ImportLoading() {
  return (
    <div>
      <div className="mb-6 lg:mb-8">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        <div className="gold-rule mt-4 opacity-60" />
      </div>
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-11 w-40 rounded-lg" />
      </div>
    </div>
  );
}
