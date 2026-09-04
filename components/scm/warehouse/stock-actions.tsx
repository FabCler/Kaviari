"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * §24 — move stock out. Quantity is never edited directly: a movement always
 * carries a type, an amount and a reason, and the running balance is written
 * to the stock's transaction history.
 */
export function StockActions({
  stockId,
  stockNumber,
  quantity,
  unit,
}: {
  stockId: string;
  stockNumber: string;
  quantity: number;
  unit: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState("out");
  const [amount, setAmount] = React.useState(String(quantity));
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (!reason.trim()) {
      toast.error("A reason is required for every stock movement.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/scm/warehouse-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockId,
          type,
          quantity: Number(amount),
          reason: reason.trim(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? "The movement could not be saved.");
        return;
      }
      toast.success(`${stockNumber}: ${payload.balance} ${unit} left.`);
      setOpen(false);
      setReason("");
      router.refresh();
    } catch {
      toast.error("The request failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Move
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {stockNumber}</DialogTitle>
          <DialogDescription>
            {quantity} {unit} on hand. Every movement is recorded with its
            reason and the balance it leaves behind.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="stock-type">Movement</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="stock-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="out">Out — sold or transferred</SelectItem>
                <SelectItem value="reserve">Reserve for a customer</SelectItem>
                <SelectItem value="release">Release a reservation</SelectItem>
                <SelectItem value="adjust">Adjustment after a count</SelectItem>
                <SelectItem value="write_off">Write off</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stock-amount">Quantity ({unit})</Label>
            <Input
              id="stock-amount"
              type="number"
              min={0}
              step="0.001"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stock-reason">Reason (required)</Label>
            <Input
              id="stock-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Sold to Villa Market, written off after a count…"
            />
          </div>
          <Button variant="gold" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Record the movement
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
