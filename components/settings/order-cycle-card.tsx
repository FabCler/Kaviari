"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";

export function OrderCycleCard({
  lastOrderDate,
  nextOrderDate,
  reviewPeriodDays,
}: {
  /** ISO strings (or null) at the server/client boundary. */
  lastOrderDate: string | null;
  nextOrderDate: string | null;
  reviewPeriodDays: number;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  async function resetCycle() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastOrderDate: new Date().toISOString() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Reset failed");
      }
      toast.success("Order cycle reset to today");
      setConfirmOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">Order cycle</CardTitle>
        <CardDescription>
          The planner counts {reviewPeriodDays} days from your last order to
          schedule the next one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Last order
            </dt>
            <dd className="tnum mt-1 text-sm font-medium">
              {lastOrderDate ? formatDate(lastOrderDate) : "Not recorded"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Next order due
            </dt>
            <dd className="tnum mt-1 text-sm font-medium">
              {nextOrderDate ? formatDate(nextOrderDate) : "Due now"}
            </dd>
          </div>
        </dl>
      </CardContent>
      <CardFooter>
        <Button variant="outline" onClick={() => setConfirmOpen(true)}>
          <RotateCcw aria-hidden /> Reset cycle to today
        </Button>
      </CardFooter>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">
              Reset order cycle
            </DialogTitle>
            <DialogDescription>
              This records today as the last order date, so the next order will
              be due in {reviewPeriodDays} days. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" onClick={resetCycle} disabled={saving}>
              {saving ? "Resetting…" : "Reset to today"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
