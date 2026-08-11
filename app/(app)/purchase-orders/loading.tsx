import { Skeleton } from "@/components/ui/skeleton";

export default function PurchaseOrdersLoading() {
  return (
    <div>
      <div className="mb-6 lg:mb-8">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        <div className="gold-rule mt-4 opacity-60" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
