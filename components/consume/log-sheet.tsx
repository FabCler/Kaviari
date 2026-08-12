"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { CHANNELS, CHANNEL_LABELS, type Channel } from "@/lib/domain";
import { formatGrams, formatNumber, formatUnits } from "@/lib/format";
import { cn } from "@/lib/utils";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { undoMovements } from "@/components/consume/undo";
import type { ConsumableProduct } from "@/components/consume/types";

const OUTBOUND_TYPE_OPTIONS = [
  { value: "consumption", label: "Consumption" },
  { value: "sale", label: "Sale" },
  { value: "waste", label: "Waste" },
  { value: "marketing_sample", label: "Marketing sample" },
] as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Singular unit word for the stepper ("tin", "pc", "kg", "pk"). */
function unitWord(unit: string, quantity: number): string {
  switch (unit) {
    case "Tin":
      return quantity === 1 ? "tin" : "tins";
    default:
      return unit.toLowerCase();
  }
}

interface PostResponse {
  movements: { id: string }[];
  allocatedLots: { lotNumber: string; tins: number }[];
}

export function LogSheet({
  product,
  onOpenChange,
  onLogged,
}: {
  product: ConsumableProduct | null;
  onOpenChange: (open: boolean) => void;
  onLogged: () => void;
}) {
  return (
    <Sheet open={product != null} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-2xl"
        aria-describedby={undefined}
      >
        {product ? (
          <LogForm
            key={product.productId}
            product={product}
            onLogged={onLogged}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** Keyed by productId so the form resets whenever a new product is picked. */
function LogForm({
  product,
  onLogged,
  onClose,
}: {
  product: ConsumableProduct;
  onLogged: () => void;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = React.useState(1);
  const [channel, setChannel] = React.useState<Channel>("food_service");
  const [type, setType] = React.useState<string>("consumption");
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const exceedsStock = quantity > product.onHandUnits;

  async function submit() {
    if (quantity <= 0) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        productId: product.productId,
        type,
        channel,
        tins: quantity,
      };
      if (note.trim()) payload.note = note.trim();

      const res = await fetch("/api/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          availableTins?: number;
        };
        if (res.status === 409) {
          toast.error(
            `Not enough stock — only ${formatUnits(data.availableTins ?? 0, product.unit)} of ${product.shortName} available`
          );
        } else {
          toast.error(data.error ?? "Could not log the movement");
        }
        return;
      }
      const data = (await res.json()) as PostResponse;
      const ids = data.movements.map((m) => m.id);
      const lotText = data.allocatedLots.map((l) => l.lotNumber).join(", ");
      toast.success(
        `Logged ${formatUnits(quantity, product.unit)} of ${product.shortName} (lot ${lotText})`,
        {
          duration: 8000,
          action: {
            label: "Undo",
            onClick: () => {
              void undoMovements(ids).then((result) => {
                if (result.ok) {
                  toast.success("Undone — stock restored");
                } else {
                  toast.error(result.error ?? "Undo failed");
                }
                onLogged();
              });
            },
          },
        }
      );
      onLogged();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-6">
      <SheetHeader className="px-0 pt-4 pb-2">
        <SheetTitle className="font-display text-xl">
          {product.shortName}
        </SheetTitle>
        <SheetDescription className="tnum">
          {product.caviarType ? `${product.caviarType} · ` : ""}
          {product.gramsPerUnit
            ? `${formatGrams(product.gramsPerUnit)} / ${product.unit.toLowerCase()} · `
            : ""}
          {formatUnits(product.onHandUnits, product.unit)} in stock
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-5">
        {/* Quantity stepper (always in the product's stock unit) */}
        <div className="flex items-center justify-center gap-5 py-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-14 rounded-full"
            onClick={() => setQuantity((q) => Math.max(0.5, round2(q - 0.5)))}
            disabled={quantity <= 0.5}
            aria-label="Decrease quantity by half a unit"
          >
            <Minus className="size-6" />
          </Button>
          <div className="w-28 text-center">
            <span className="font-display tnum text-5xl font-medium">
              {formatNumber(quantity, 1)}
            </span>
            <p className="tnum mt-0.5 text-xs text-muted-foreground">
              {unitWord(product.unit, quantity)}
            </p>
            {product.gramsPerUnit ? (
              <p className="tnum mt-0.5 text-xs text-muted-foreground">
                = {formatGrams(quantity * product.gramsPerUnit)}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-14 rounded-full"
            onClick={() => setQuantity((q) => round2(q + 0.5))}
            aria-label="Increase quantity by half a unit"
          >
            <Plus className="size-6" />
          </Button>
        </div>

        {exceedsStock ? (
          <p className="text-sm font-medium text-warning">
            Only {formatUnits(product.onHandUnits, product.unit)} in stock —
            the server will reject anything above that.
          </p>
        ) : null}

        {/* Channel */}
        <div>
          <Label className="mb-1.5 block text-sm">Channel</Label>
          <div
            className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
            role="group"
            aria-label="Channel"
          >
            {CHANNELS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={channel === c}
                onClick={() => setChannel(c)}
                className={cn(
                  "h-9 rounded-md text-xs font-medium transition-colors sm:text-sm",
                  channel === c
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {CHANNEL_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        {/* Movement type + note */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="movement-type" className="mb-1.5 block text-sm">
              Type
            </Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="movement-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTBOUND_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="movement-note" className="mb-1.5 block text-sm">
              Note (optional)
            </Label>
            <Input
              id="movement-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. table 12 tasting"
              maxLength={500}
            />
          </div>
        </div>

        <Button
          type="button"
          variant="gold"
          size="lg"
          className="h-12 w-full text-base"
          onClick={submit}
          disabled={submitting || quantity <= 0}
        >
          {submitting
            ? "Logging…"
            : `Log ${formatUnits(quantity, product.unit)}`}
        </Button>
      </div>
    </div>
  );
}
