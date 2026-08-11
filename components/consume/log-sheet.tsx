"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { CHANNELS, type Channel } from "@/lib/domain";
import { formatGrams, formatNumber, formatTins } from "@/lib/format";
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

const CHANNEL_LABELS: Record<Channel, string> = {
  restaurant: "Restaurant",
  retail: "Retail",
  event: "Event",
  staff: "Staff",
};

const OUTBOUND_TYPE_OPTIONS = [
  { value: "consumption", label: "Consumption" },
  { value: "sale", label: "Sale" },
  { value: "waste", label: "Waste" },
  { value: "marketing_sample", label: "Marketing sample" },
] as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
  const [mode, setMode] = React.useState<"tins" | "grams">("tins");
  const [tins, setTins] = React.useState(1);
  const [grams, setGrams] = React.useState("");
  const [channel, setChannel] = React.useState<Channel>("restaurant");
  const [type, setType] = React.useState<string>("consumption");
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const gramsNumber = Number(grams);
  const effectiveTins =
    mode === "tins"
      ? tins
      : Number.isFinite(gramsNumber) && gramsNumber > 0
        ? round2(gramsNumber / product.tinSizeGrams)
        : 0;
  const exceedsStock = effectiveTins > product.onHandTins;

  async function submit() {
    if (effectiveTins <= 0) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        productId: product.productId,
        type,
        channel,
      };
      if (mode === "tins") payload.tins = tins;
      else payload.grams = gramsNumber;
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
            `Not enough stock — only ${formatTins(data.availableTins ?? 0)} of ${product.shortName} available`
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
        `Logged ${formatTins(effectiveTins)} of ${product.shortName} (lot ${lotText})`,
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
          {formatGrams(product.tinSizeGrams)} tin ·{" "}
          {formatTins(product.onHandTins)} in stock
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-5">
        {/* Quantity mode toggle */}
        <div
          className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
          role="group"
          aria-label="Quantity unit"
        >
          {(["tins", "grams"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "h-9 rounded-md text-sm font-medium transition-colors",
                mode === m
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m === "tins" ? "Tins" : "Grams"}
            </button>
          ))}
        </div>

        {/* Quantity input */}
        {mode === "tins" ? (
          <div className="flex items-center justify-center gap-5 py-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-14 rounded-full"
              onClick={() => setTins((t) => Math.max(0.5, round2(t - 0.5)))}
              disabled={tins <= 0.5}
              aria-label="Decrease quantity by half a tin"
            >
              <Minus className="size-6" />
            </Button>
            <div className="w-28 text-center">
              <span className="font-display tnum text-5xl font-medium">
                {formatNumber(tins, 1)}
              </span>
              <p className="tnum mt-0.5 text-xs text-muted-foreground">
                {tins === 1 ? "tin" : "tins"} ·{" "}
                {formatGrams(tins * product.tinSizeGrams)}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-14 rounded-full"
              onClick={() => setTins((t) => round2(t + 0.5))}
              aria-label="Increase quantity by half a tin"
            >
              <Plus className="size-6" />
            </Button>
          </div>
        ) : (
          <div>
            <Label htmlFor="grams-input" className="mb-1.5 block text-sm">
              Grams consumed
            </Label>
            <Input
              id="grams-input"
              type="number"
              inputMode="decimal"
              min={1}
              step={1}
              placeholder={`e.g. ${product.tinSizeGrams}`}
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              className="tnum h-12 text-lg"
            />
            <p className="tnum mt-1 text-xs text-muted-foreground">
              {effectiveTins > 0
                ? `≈ ${formatNumber(effectiveTins, 2)} tins`
                : "Enter a quantity in grams"}
            </p>
          </div>
        )}

        {exceedsStock ? (
          <p className="text-sm font-medium text-warning">
            Only {formatTins(product.onHandTins)} in stock — the server will
            reject anything above that.
          </p>
        ) : null}

        {/* Channel */}
        <div>
          <Label className="mb-1.5 block text-sm">Channel</Label>
          <div
            className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1"
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
          disabled={submitting || effectiveTins <= 0}
        >
          {submitting ? "Logging…" : `Log ${formatTins(effectiveTins)}`}
        </Button>
      </div>
    </div>
  );
}
