"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** What deleting means for this order right now, shown in the confirmation. */
function consequence(status: string): string {
  if (status === "sent" || status === "confirmed") {
    return "Its lines will no longer count as pipeline stock in the planner.";
  }
  return "Only the order record disappears — stock is never touched by purchase orders.";
}

/**
 * Delete a purchase order (any status) after an explicit confirmation.
 * Rendered as a trash icon in the orders list and as a labelled button on
 * the order page (`asIcon` picks the form).
 */
export function DeletePoButton({
  poId,
  reference,
  status,
  asIcon = false,
  redirectToList = false,
}: {
  poId: string;
  reference: string;
  status: string;
  asIcon?: boolean;
  redirectToList?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "The order could not be deleted.");
        return;
      }
      toast.success(`Order ${reference} deleted.`);
      setOpen(false);
      if (redirectToList) router.push("/purchase-orders");
      router.refresh();
    } catch {
      toast.error("The order could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild>
        {asIcon ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete order ${reference}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        ) : (
          <Button variant="destructive">
            <Trash2 aria-hidden /> Delete order
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete order {reference}?</DialogTitle>
          <DialogDescription>
            {consequence(status)} This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>
              Keep the order
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={remove} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
