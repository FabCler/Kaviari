"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CHANNEL_LABELS, type Channel } from "@/lib/domain";
import {
  formatDate,
  formatGrams,
  formatMoney,
  formatNumber,
  formatUnits,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { DaysLeftBadge } from "@/components/inventory/badges";
import type { InventoryRow } from "@/components/inventory/types";

interface LotDto {
  id: string;
  lotNumber: string;
  quantityTins: number;
  receivedTins: number;
  receivedDate: string;
  expiryDate: string;
  status: string;
}

interface MovementDto {
  id: string;
  type: string;
  quantityTins: number;
  gramsEquivalent: number;
  date: string;
  channel: string | null;
  note: string | null;
  lot: { lotNumber: string } | null;
}

interface ProductDetailDto {
  lots: LotDto[];
  movements: MovementDto[];
}

const MOVEMENT_LABELS: Record<string, string> = {
  receipt: "Receipt",
  consumption: "Consumption",
  sale: "Sale",
  waste: "Waste",
  adjustment: "Adjustment",
  marketing_sample: "Marketing sample",
};

function channelLabel(channel: string | null): string | null {
  if (!channel) return null;
  return CHANNEL_LABELS[channel as Channel] ?? channel;
}

/** Short unit word for movement quantities ("tins", "pc", "kg", "pk"). */
function unitWord(unit: string): string {
  switch (unit) {
    case "Tin":
      return "tins";
    case "PC":
      return "pc";
    case "KG":
      return "kg";
    case "PK":
      return "pk";
    default:
      return unit.toLowerCase();
  }
}

function daysLeft(expiryIso: string): number {
  return Math.ceil((new Date(expiryIso).getTime() - Date.now()) / 86_400_000);
}

export function ProductDetailSheet({
  row,
  currency,
  onOpenChange,
}: {
  row: InventoryRow | null;
  currency: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={row != null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
        aria-describedby={undefined}
      >
        {row ? (
          <ProductDetail
            key={row.productId}
            row={row}
            currency={currency}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** Keyed by productId so all local state resets when a new row is picked. */
function ProductDetail({
  row,
  currency,
  onClose,
}: {
  row: InventoryRow;
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = React.useState<ProductDetailDto | null>(null);
  const [aduInput, setAduInput] = React.useState(
    row.aduOverrideUnitsPerDay != null ? String(row.aduOverrideUnitsPerDay) : ""
  );
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/products/${row.productId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load product detail");
        return (await res.json()) as ProductDetailDto;
      })
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load product details");
      });
    return () => {
      cancelled = true;
    };
  }, [row.productId]);

  const loading = detail == null;
  const lots = detail?.lots ?? [];
  const movements = detail?.movements ?? [];

  async function saveAduOverride() {
    const trimmed = aduInput.trim();
    let value: number | null = null;
    if (trimmed !== "") {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error("ADU override must be a number of units per day (0 or more)");
        return;
      }
      value = parsed;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${row.productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aduOverrideUnitsPerDay: value }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Failed to save ADU override");
        return;
      }
      toast.success(
        value == null
          ? "ADU override cleared — back to automatic"
          : `ADU override set to ${formatNumber(value, 2)} units/day`
      );
      router.refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SheetHeader className="pb-0">
        <SheetTitle className="font-display text-xl">{row.shortName}</SheetTitle>
        <SheetDescription>
          {row.prCode} · {row.category}
          {row.caviarType ? ` · ${row.caviarType}` : ""}
          {row.gramsPerUnit
            ? ` · ${formatGrams(row.gramsPerUnit)}/${row.unit.toLowerCase()}`
            : ""}
        </SheetDescription>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <Badge variant="secondary" className="tnum">
            {formatUnits(row.onHandUnits, row.unit)} on hand
          </Badge>
          {row.onOrderUnits > 0 ? (
            <Badge variant="seafoam" className="tnum">
              {formatUnits(row.onOrderUnits, row.unit)} on order
            </Badge>
          ) : null}
          <Badge variant="outline" className="tnum">
            {formatMoney(row.stockValue, currency)}
          </Badge>
        </div>
      </SheetHeader>

      <div className="space-y-6 px-4 pb-6">
        <Separator />

        {/* Lots */}
        <section aria-label="In-stock lots">
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            Lots in stock
          </h3>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
            </div>
          ) : lots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lots in stock.</p>
          ) : (
            <ul className="space-y-2">
              {lots.map((lot) => (
                <li
                  key={lot.id}
                  className="rounded-lg border bg-pearl/50 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="tnum text-sm font-medium">
                      {lot.lotNumber}
                    </span>
                    <DaysLeftBadge days={daysLeft(lot.expiryDate)} />
                  </div>
                  <p className="tnum mt-0.5 text-xs text-muted-foreground">
                    {formatUnits(lot.quantityTins, row.unit)} of{" "}
                    {formatUnits(lot.receivedTins, row.unit)} left · received{" "}
                    {formatDate(lot.receivedDate)} · expires{" "}
                    {formatDate(lot.expiryDate)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ADU override */}
        <section aria-label="ADU override">
          <h3 className="mb-1 text-sm font-semibold text-foreground">
            ADU override
          </h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Current usage:{" "}
            <span className="tnum">
              {formatNumber(row.aduUnitsPerDay, 2)} units/day
            </span>
            {row.aduIsOverride ? " (manual override)" : " (automatic)"}
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="adu-override" className="mb-1.5 block text-xs">
                Units per day (empty = automatic)
              </Label>
              <Input
                id="adu-override"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.1}
                placeholder="automatic"
                value={aduInput}
                onChange={(e) => setAduInput(e.target.value)}
              />
            </div>
            <Button onClick={saveAduOverride} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </section>

        {/* Recent movements */}
        <section aria-label="Recent movements">
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            Recent movements
          </h3>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 rounded-lg" />
              <Skeleton className="h-8 rounded-lg" />
              <Skeleton className="h-8 rounded-lg" />
            </div>
          ) : movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No movements recorded yet.
            </p>
          ) : (
            <ul className="divide-y">
              {movements.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium">
                      {MOVEMENT_LABELS[m.type] ?? m.type}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatDate(m.date)}
                      {channelLabel(m.channel)
                        ? ` · ${channelLabel(m.channel)}`
                        : ""}
                      {m.lot ? ` · ${m.lot.lotNumber}` : ""}
                    </span>
                  </div>
                  <span
                    className={`tnum shrink-0 font-medium ${
                      m.quantityTins < 0 ? "text-foreground" : "text-success"
                    }`}
                  >
                    {m.quantityTins > 0 ? "+" : ""}
                    {formatNumber(m.quantityTins, 2)} {unitWord(row.unit)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
