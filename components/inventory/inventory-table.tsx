"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Download,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { CAVIAR_TYPES, PRODUCT_CATEGORIES } from "@/lib/domain";
import { formatUnits } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CoverBadge } from "@/components/inventory/badges";
import {
  ALL,
  applyInventoryView,
  isDormant,
  TEXT_SORT_KEYS,
  type InventoryView,
  type SortKey,
  type SortState,
} from "@/components/inventory/lib";
import type { InventoryRow } from "@/components/inventory/types";

// Filtering, dormant split and sorting live in components/inventory/lib.ts,
// shared with the Excel export so the workbook mirrors the on-screen view.

export function InventoryTable({
  rows,
  forecastMonthLabels,
  consumedMonthLabels,
}: {
  rows: InventoryRow[];
  forecastMonthLabels: string[];
  consumedMonthLabels: { current: string; previous: string };
}) {
  const [category, setCategory] = React.useState<string>(ALL);
  const [forecastHorizon, setForecastHorizon] = React.useState(1);
  const [caviarType, setCaviarType] = React.useState<string>(ALL);
  const [showDormant, setShowDormant] = React.useState(false);
  const [sort, setSort] = React.useState<SortState>(null);
  const [exporting, setExporting] = React.useState(false);

  const toggleSort = (key: SortKey) => {
    setSort((current) => {
      const first = TEXT_SORT_KEYS.includes(key) ? "asc" : "desc";
      if (current?.key !== key) return { key, dir: first };
      // Second click flips; third returns to the default order.
      return current.dir === first
        ? { key, dir: first === "asc" ? "desc" : "asc" }
        : null;
    });
  };

  // Caviar type only applies when the category filter can contain caviar.
  const typeFilterEnabled = category === ALL || category === "Caviar";

  const view: InventoryView = {
    category,
    caviarType: typeFilterEnabled ? caviarType : ALL,
    forecastHorizon,
    showDormant,
    sort,
  };
  const visibleRows = applyInventoryView(rows, view);
  const dormantCount = rows.filter(
    (row) =>
      (category === ALL || row.category === category) &&
      (!typeFilterEnabled ||
        caviarType === ALL ||
        row.caviarType === caviarType) &&
      isDormant(row)
  ).length;

  async function downloadExcel() {
    setExporting(true);
    try {
      const res = await fetch("/api/exports/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(view),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? "The export failed — please try again.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `inventory_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The export failed — please try again."
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="category-filter" className="sr-only">
            Filter by category
          </Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger
              id="category-filter"
              size="sm"
              aria-label="Filter by category"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {PRODUCT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label htmlFor="caviar-type-filter" className="sr-only">
            Filter by caviar type
          </Label>
          <Select
            value={typeFilterEnabled ? caviarType : ALL}
            onValueChange={setCaviarType}
            disabled={!typeFilterEnabled}
          >
            <SelectTrigger
              id="caviar-type-filter"
              size="sm"
              aria-label="Filter by caviar type"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All caviar types</SelectItem>
              {CAVIAR_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label htmlFor="forecast-horizon" className="sr-only">
            Forecast horizon
          </Label>
          <Select
            value={String(forecastHorizon)}
            onValueChange={(value) => setForecastHorizon(Number(value))}
          >
            <SelectTrigger
              id="forecast-horizon"
              size="sm"
              aria-label="Forecast horizon"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Forecast: {n} month{n > 1 ? "s" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {dormantCount > 0 ? (
            <div className="flex items-center gap-2">
              <Switch
                id="show-dormant"
                checked={showDormant}
                onCheckedChange={setShowDormant}
              />
              <Label
                htmlFor="show-dormant"
                className="text-sm text-muted-foreground"
              >
                Show dormant ({dormantCount})
              </Label>
            </div>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={downloadExcel}
            disabled={exporting || visibleRows.length === 0}
          >
            {exporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Export Excel
          </Button>
        </div>
      </div>

      <ProductsTable
        rows={visibleRows}
        forecastHorizon={forecastHorizon}
        forecastMonthLabels={forecastMonthLabels}
        consumedMonthLabels={consumedMonthLabels}
        sort={sort}
        onToggleSort={toggleSort}
      />
    </div>
  );
}

function SortableHead({
  label,
  sortKey,
  sort,
  onToggleSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onToggleSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort?.key === sortKey;
  const dir = active ? sort.dir : undefined;
  return (
    <TableHead
      className={align === "right" ? "text-right" : undefined}
      aria-sort={
        active ? (dir === "asc" ? "ascending" : "descending") : undefined
      }
    >
      <button
        type="button"
        onClick={() => onToggleSort(sortKey)}
        className={`inline-flex cursor-pointer items-center gap-1 uppercase hover:text-foreground ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-foreground" : ""}`}
      >
        {label}
        {dir === "asc" ? (
          <ArrowUp className="size-3.5" />
        ) : dir === "desc" ? (
          <ArrowDown className="size-3.5" />
        ) : (
          <ChevronsUpDown className="size-3 opacity-50" />
        )}
      </button>
    </TableHead>
  );
}

function ProductsTable({
  rows,
  forecastHorizon,
  forecastMonthLabels,
  consumedMonthLabels,
  sort,
  onToggleSort,
}: {
  rows: InventoryRow[];
  forecastHorizon: number;
  forecastMonthLabels: string[];
  consumedMonthLabels: { current: string; previous: string };
  sort: SortState;
  onToggleSort: (key: SortKey) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
        No products match these filters. Adjust the category or type, or
        receive a delivery.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead
              label="Code"
              sortKey="prCode"
              sort={sort}
              onToggleSort={onToggleSort}
            />
            <SortableHead
              label="Product"
              sortKey="name"
              sort={sort}
              onToggleSort={onToggleSort}
            />
            <TableHead>Type</TableHead>
            <TableHead>Unit</TableHead>
            <SortableHead
              label="Stock on hand"
              sortKey="onHand"
              sort={sort}
              onToggleSort={onToggleSort}
              align="right"
            />
            <SortableHead
              label="On order"
              sortKey="onOrder"
              sort={sort}
              onToggleSort={onToggleSort}
              align="right"
            />
            <SortableHead
              label={`Consumed ${consumedMonthLabels.previous}`}
              sortKey="consumedPrev"
              sort={sort}
              onToggleSort={onToggleSort}
              align="right"
            />
            <SortableHead
              label={`Consumed ${consumedMonthLabels.current}`}
              sortKey="consumed"
              sort={sort}
              onToggleSort={onToggleSort}
              align="right"
            />
            {forecastMonthLabels.slice(0, forecastHorizon).map((label, index) => (
              <SortableHead
                key={label}
                label={`Forecast ${label}`}
                sortKey={`forecast${index}` as SortKey}
                sort={sort}
                onToggleSort={onToggleSort}
                align="right"
              />
            ))}
            <SortableHead
              label="Cover"
              sortKey="cover"
              sort={sort}
              onToggleSort={onToggleSort}
              align="right"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.productId}>
              <TableCell className="tnum text-muted-foreground">
                {row.prCode}
              </TableCell>
              <TableCell>
                <span className="font-medium">{row.name}</span>
              </TableCell>
              <TableCell>
                {row.caviarType ? (
                  <Badge variant="gold">{row.caviarType}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {row.unit}
              </TableCell>
              <TableCell className="tnum text-right font-medium">
                {row.onHandUnits > 0 ? (
                  formatUnits(row.onHandUnits, row.unit)
                ) : (
                  <span className="font-normal text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="tnum text-right">
                {row.onOrderUnits > 0 ? (
                  formatUnits(row.onOrderUnits, row.unit)
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="tnum text-right">
                {row.consumedPrevMonthUnits > 0 ? (
                  formatUnits(row.consumedPrevMonthUnits, row.unit)
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="tnum text-right">
                {row.consumedThisMonthUnits > 0 ? (
                  formatUnits(row.consumedThisMonthUnits, row.unit)
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              {row.forecastMonths
                .slice(0, forecastHorizon)
                .map((units, index) => (
                  <TableCell key={index} className="tnum text-right">
                    {units > 0 ? (
                      formatUnits(units, row.unit)
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                ))}
              <TableCell className="text-right">
                <CoverBadge weeks={row.weeksOfCover} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
