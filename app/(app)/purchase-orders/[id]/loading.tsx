import { Skeleton } from "@/components/ui/skeleton";

export default function PurchaseOrderDetailLoading() {
  return (
    <div>
      <div className="mb-6 lg:mb-8">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        <div className="gold-rule mt-4 opacity-60" />
      </div>
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
