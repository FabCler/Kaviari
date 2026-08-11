import { Skeleton } from "@/components/ui/skeleton";

export default function AssistantLoading() {
  return (
    <div>
      <div className="mb-6 lg:mb-8">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-[28rem] rounded-lg" />
    </div>
  );
}
