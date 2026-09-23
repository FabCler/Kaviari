"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
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
import { Input } from "@/components/ui/input";

/**
 * Inline "Rep: <name> ✎" line under a customer row. Opens a small dialog to
 * assign, change or clear the customer's sales rep; customers imported
 * without one show "Unassigned" until someone fills it in here.
 */
export function RepEditor({
  customerCode,
  customerName,
  repName,
  knownReps,
}: {
  customerCode: string;
  customerName: string;
  repName: string | null;
  /** Existing rep names, offered as datalist suggestions. */
  knownReps: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(repName ?? "");
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/customer-reps", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerCode, repName: value.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "The sales rep could not be saved.");
        return;
      }
      toast.success(
        value.trim()
          ? `${customerName} → ${value.trim()}`
          : `Sales rep cleared for ${customerName}.`
      );
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("The sales rep could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setOpen(next);
          if (next) setValue(repName ?? "");
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className={`inline-flex cursor-pointer items-center gap-1 text-xs hover:text-foreground ${
            repName ? "text-muted-foreground" : "text-warning"
          }`}
          aria-label={`Edit sales rep for ${customerName}`}
        >
          {repName ?? "Unassigned"}
          <Pencil className="size-3 opacity-60" />
        </button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-sm"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Sales rep — {customerName}</DialogTitle>
          <DialogDescription>
            Assign the salesperson responsible for this customer. Leave blank
            and save to clear the assignment.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Salesperson name"
          list="known-reps"
          disabled={busy}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save();
          }}
        />
        <datalist id="known-reps">
          {knownReps.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
