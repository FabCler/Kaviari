"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ChevronLeft, Minus, Plus, Search, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  CHANNELS,
  CHANNEL_LABELS,
  type Channel,
} from "@/lib/domain";
import { formatGrams, formatNumber, formatUnits } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import type {
  ConsumableProduct,
  RecentMovementRow,
} from "@/components/consume/types";

const OUTBOUND_TYPE_OPTIONS = [
  { value: "consumption", label: "Consumption" },
  { value: "sale", label: "Sale" },
  { value: "waste", label: "Waste" },
  { value: "marketing_sample", label: "Marketing sample" },
] as const;

const TYPE_LABELS: Record<string, string> = {
  consumption: "Consumption",
  sale: "Sale",
  waste: "Waste",
  marketing_sample: "Sample",
};

function channelLabel(channel: string | null): string | null {
  if (!channel) return null;
  return CHANNEL_LABELS[channel as Channel] ?? channel;
}

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

/**
 * "Log consumption" header action: a gold button that opens a bottom sheet
 * with a product picker (plus today's log with undo), then a quantity /
 * channel / type form posting to /api/movements with FEFO allocation.
 */
export function LogConsumption({
  products,
  recent,
  autoOpen = false,
}: {
  products: ConsumableProduct[];
  recent: RecentMovementRow[];
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(autoOpen);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<ConsumableProduct | null>(
    null
  );

  // When opened via /consume?log=1, drop the param so a reload after closing
  // the sheet doesn't reopen it.
  React.useEffect(() => {
    if (autoOpen) {
      window.history.replaceState(null, "", "/consume");
    }
  }, [autoOpen]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setSelected(null);
      setSearch("");
    }
  }

  function handleLogged() {
    handleOpenChange(false);
    router.refresh();
  }

  const query = search.trim().toLowerCase();
  const filtered = query
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.caviarType ?? "").toLowerCase().includes(query)
      )
    : products;

  return (
    <>
      <Button variant="gold" onClick={() => setOpen(true)}>
        <Plus />
        Log consumption
      </Button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-2xl"
          aria-describedby={undefined}
        >
          {selected ? (
            <LogForm
              key={selected.productId}
              product={selected}
              onBack={() => setSelected(null)}
              onLogged={handleLogged}
              onRefresh={() => router.refresh()}
            />
          ) : (
            <ProductPicker
              products={products}
              filtered={filtered}
              search={search}
              onSearchChange={setSearch}
              onSelect={setSelected}
              recent={recent}
              onRefresh={() => router.refresh()}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Step 1: searchable product list plus today's logged movements with undo. */
function ProductPicker({
  products,
  filtered,
  search,
  onSearchChange,
  onSelect,
  recent,
  onRefresh,
}: {
  products: ConsumableProduct[];
  filtered: ConsumableProduct[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (product: ConsumableProduct) => void;
  recent: RecentMovementRow[];
  onRefresh: () => void;
}) {
  const [undoing, setUndoing] = React.useState<string | null>(null);

  async function undoRow(row: RecentMovementRow) {
    setUndoing(row.movementId);
    const result = await undoMovements([row.movementId]);
    setUndoing(null);
    if (result.ok) {
      toast.success(
        `Undid ${formatUnits(row.units, row.unit)} of ${row.productName} — stock restored`
      );
    } else {
      toast.error(result.error ?? "Undo failed");
    }
    onRefresh();
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-6">
      <SheetHeader className="px-0 pt-4 pb-2">
        <SheetTitle className="font-display text-xl">
          Log consumption
        </SheetTitle>
        <SheetDescription>
          Pick a product, then set the quantity and channel.
        </SheetDescription>
      </SheetHeader>

      <div className="relative mb-3">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Label htmlFor="log-product-search" className="sr-only">
          Search products
        </Label>
        <Input
          id="log-product-search"
          type="search"
          placeholder="Search products…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-11 pl-9"
          autoFocus
        />
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Nothing in stock right now. Receive a delivery first, then log
          consumption here.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          No products match &ldquo;{search}&rdquo;.
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {filtered.map((product) => (
            <li key={product.productId}>
              <button
                type="button"
                onClick={() => onSelect(product)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/60 outline-none"
              >
                <div className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {product.shortName}
                  </span>
                  <span className="tnum block text-xs text-muted-foreground">
                    {product.caviarType ? `${product.caviarType} · ` : ""}
                    {product.gramsPerUnit
                      ? `${formatGrams(product.gramsPerUnit)} / ${product.unit.toLowerCase()}`
                      : product.unit}
                  </span>
                </div>
                <Badge variant="secondary" className="tnum shrink-0">
                  {formatUnits(product.onHandUnits, product.unit)}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}

      {recent.length > 0 ? (
        <div className="mt-6">
          <h3 className="mb-1 text-sm font-semibold">Logged today</h3>
          <ul className="divide-y">
            {recent.map((row) => (
              <li
                key={row.movementId}
                className="flex items-center justify-between gap-2 py-2"
              >
                <div className="min-w-0 text-sm">
                  <span className="tnum text-xs text-muted-foreground">
                    {format(new Date(row.date), "HH:mm")}
                  </span>
                  <span className="ml-2 font-medium">{row.productName}</span>
                  <span className="tnum ml-2 text-muted-foreground">
                    {formatNumber(row.units, 2)} {row.unit.toLowerCase()}
                  </span>
                  <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">
                    {TYPE_LABELS[row.type] ?? row.type}
                    {channelLabel(row.channel)
                      ? ` · ${channelLabel(row.channel)}`
                      : ""}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => undoRow(row)}
                  disabled={undoing === row.movementId}
                  aria-label={`Undo ${formatUnits(row.units, row.unit)} of ${row.productName}`}
                >
                  <Undo2 />
                  <span className="hidden sm:inline">Undo</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Step 2: quantity / channel / type form. Keyed by productId upstream. */
function LogForm({
  product,
  onBack,
  onLogged,
  onRefresh,
}: {
  product: ConsumableProduct;
  onBack: () => void;
  onLogged: () => void;
  onRefresh: () => void;
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
                onRefresh();
              });
            },
          },
        }
      );
      onLogged();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-6">
      <div className="pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="-ml-2 text-muted-foreground"
        >
          <ChevronLeft />
          All products
        </Button>
      </div>
      <SheetHeader className="px-0 pt-1 pb-2">
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
