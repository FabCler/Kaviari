"use client";

import { ClipboardList, Receipt, Tags } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImportMode } from "@/lib/import/types";

export const MODE_META: Record<
  ImportMode,
  { label: string; description: string; icon: React.ComponentType<{ className?: string }> }
> = {
  price_list: {
    label: "Supplier price list",
    description:
      "Update catalog prices and add new products from a supplier price list.",
    icon: Tags,
  },
  stock_take: {
    label: "Inventory count / stock take",
    description:
      "Reconcile a physical count against system stock — differences become adjustment movements.",
    icon: ClipboardList,
  },
  sales_export: {
    label: "Sales / consumption export",
    description:
      "Log sold or consumed tins from a POS or till export, allocated to lots first-expired-first-out.",
    icon: Receipt,
  },
};

const MODE_ORDER: ImportMode[] = ["price_list", "stock_take", "sales_export"];

export function ModeCards({
  selected,
  onSelect,
  disabled,
}: {
  selected: ImportMode;
  onSelect: (mode: ImportMode) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Import mode"
      className="grid gap-3 sm:grid-cols-3"
    >
      {MODE_ORDER.map((mode) => {
        const meta = MODE_META[mode];
        const Icon = meta.icon;
        const active = selected === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onSelect(mode)}
            className={cn(
              "rounded-xl border bg-card p-4 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-gold ring-1 ring-gold/60 shadow-sm"
                : "border-border hover:border-gold/50",
              disabled && "opacity-60"
            )}
          >
            <div
              className={cn(
                "mb-3 flex size-9 items-center justify-center rounded-lg",
                active ? "bg-gold/15 text-gold-deep" : "bg-muted text-muted-foreground"
              )}
            >
              <Icon className="size-4.5" />
            </div>
            <div className="text-sm font-medium text-foreground">
              {meta.label}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {meta.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
