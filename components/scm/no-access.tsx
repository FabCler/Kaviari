import { Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

/** Shown when a signed-in user has no supply-chain department yet (§10). */
export function NoAccess({
  what = "the supply-chain module",
}: {
  what?: string;
}) {
  return (
    <div>
      <PageHeader
        title="No access yet"
        description="Your account is not assigned to a supply-chain department."
      />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Lock className="size-9 text-muted-foreground/60" aria-hidden />
          <p className="max-w-md text-sm text-muted-foreground">
            You are signed in, but your account has no department, so you cannot
            open {what}. Ask the system administrator to set your department to
            Purchasing, Sales, Warehouse or Management in{" "}
            <span className="font-medium">Settings → Users</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
