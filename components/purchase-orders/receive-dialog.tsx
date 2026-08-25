"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatTins } from "@/lib/format";
import type { PoDto } from "@/components/purchase-orders/types";

interface ReceiveLineState {
  prCode: string;
  lineId: string;
  productName: string;
  orderedTins: number;
  receivedTins: string;
  lotNumber: string;
  expiryDate: string; // yyyy-mm-dd
}

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildInitialLines(po: PoDto): ReceiveLineState[] {
  const defaultExpiry = toDateInput(
    new Date(Date.now() + 120 * 86_400_000)
  );
  return po.lines.map((line, index) => ({
    lineId: line.id,
    prCode: line.prCode,
    productName: line.productName,
    orderedTins: line.quantityTins,
    receivedTins: String(line.quantityTins),
    lotNumber: `KV-${po.reference}-${index + 1}`,
    expiryDate: defaultExpiry,
  }));
}

/**
 * Receive-delivery dialog: per PO line, the received quantity, a lot number
 * and an expiry date. Creates stock lots + receipt movements server-side.
 */
export function ReceiveDialog({
  po,
  open,
  onOpenChange,
}: {
  po: PoDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const initial = useMemo(() => buildInitialLines(po), [po]);
  const [lines, setLines] = useState<ReceiveLineState[]>(initial);
  const [pending, setPending] = useState(false);

  function update(index: number, patch: Partial<ReceiveLineState>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
  }

  async function submit() {
    const payload: {
      lineId: string;
      receivedTins: number;
      lotNumber: string;
      expiryDate: string;
    }[] = [];
    for (const line of lines) {
      const received = Number(line.receivedTins);
      if (!Number.isFinite(received) || received < 0) {
        toast.error(`Invalid received quantity for ${line.productName}.`);
        return;
      }
      if (received > 0 && !line.lotNumber.trim()) {
        toast.error(`A lot number is required for ${line.productName}.`);
        return;
      }
      if (received > 0 && !line.expiryDate) {
        toast.error(`An expiry date is required for ${line.productName}.`);
        return;
      }
      payload.push({
        lineId: line.lineId,
        receivedTins: received,
        lotNumber: line.lotNumber.trim() || "-",
        expiryDate: new Date(`${line.expiryDate}T12:00:00`).toISOString(),
      });
    }
    if (payload.every((l) => l.receivedTins === 0)) {
      toast.error("Enter at least one received quantity.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: payload }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "The delivery could not be recorded.");
        return;
      }
      toast.success(`${po.reference} received into stock.`);
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error("The delivery could not be recorded.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receive delivery — {po.reference}</DialogTitle>
          <DialogDescription>
            Each line becomes a stock lot. Adjust quantities for partial
            deliveries; lot numbers and expiry dates come from the tins.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {lines.map((line, index) => (
            <div
              key={line.lineId}
              className="rounded-lg border bg-pearl/50 p-3"
            >
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">
                  <span className="tnum text-muted-foreground">
                    {line.prCode}
                  </span>{" "}
                  · {line.productName}
                </p>
                <p className="text-xs text-muted-foreground tnum">
                  ordered {formatTins(line.orderedTins)}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor={`received-${line.lineId}`}>
                    Received tins
                  </Label>
                  <Input
                    id={`received-${line.lineId}`}
                    type="number"
                    min={0}
                    step={1}
                    inputMode="decimal"
                    className="tnum"
                    value={line.receivedTins}
                    onChange={(e) =>
                      update(index, { receivedTins: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`lot-${line.lineId}`}>Lot number</Label>
                  <Input
                    id={`lot-${line.lineId}`}
                    value={line.lotNumber}
                    onChange={(e) =>
                      update(index, { lotNumber: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`expiry-${line.lineId}`}>Expiry date</Label>
                  <Input
                    id={`expiry-${line.lineId}`}
                    type="date"
                    className="tnum"
                    value={line.expiryDate}
                    onChange={(e) =>
                      update(index, { expiryDate: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button variant="gold" onClick={submit} disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <PackageCheck aria-hidden />
            )}
            Receive into stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
