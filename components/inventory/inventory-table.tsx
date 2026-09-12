"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { CAVIAR_TYPES, PRODUCT_CATEGORIES } from "@/lib/domain";
import { formatUnits } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
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
import type { InventoryRow } from "@/components/inventory/types";

const ALL = "all";

/**
 * Sortable columns. Text columns start ascending; numeric columns start
 * descending (largest first). "forecast0/1/2" are the per-month columns;
 * cover treats ∞ (no demand) as larger than any finite value.
 */
type SortKey =
  | "prCode"
  | "name"
  | "onHand"
  | "onOrder"
  | "consumed"
  | "cover"
  | "forecast0"
  | "forecast1"
  | "forecast2";

type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

const TEXT_SORT_KEYS: SortKey[] = ["prCode", "name"];

function sortValue(row: InventoryRow, key: SortKey): string | number {
  switch (key) {
    case "prCode":
      return row.prCode;
    case "name":
      return row.name;
    case "onHand":
      return row.onHandUnits;
    case "onOrder":
      return row.onOrderUnits;
    case "consumed":
      return row.consumed30dUnits;
    case "cover":
      return row.weeksOfCover ?? Number.POSITIVE_INFINITY;
    case "forecast0":
    case "forecast1":
    case "forecast2":
      return row.forecastMonths[Number(key.slice(-1))] ?? 0;
  }
}

function sortRows(rows: InventoryRow[], sort: SortState): InventoryRow[] {
  if (!sort) return rows;
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    const cmp =
      typeof va === "string" || typeof vb === "string"
        ? String(va).localeCompare(String(vb), undefined, { numeric: true })
        : va - vb;
    return cmp !== 0 ? factor * cmp : a.name.localeCompare(b.name);
  });
}

function isDormant(row: InventoryRow): boolean {
  return (
    row.onHandUnits <= 0 && row.aduUnitsPerDay <= 0 && row.onOrderUnits <= 0
  );
}

export function InventoryTable({
  rows,
  forecastMonthLabels,
}: {
  rows: InventoryRow[];
  forecastMonthLabels: string[];
}) {
  const [category, setCategory] = React.useState<string>(ALL);
  const [forecastHorizon, setForecastHorizon] = React.useState(1);
  const [caviarType, setCaviarType] = React.useState<string>(ALL);
  const [showDormant, setShowDormant] = React.useState(false);
  const [sort, setSort] = React.useState<SortState>(null);

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

  const filtered = rows.filter((row) => {
    if (category !== ALL && row.category !== category) return false;
    if (typeFilterEnabled && caviarType !== ALL && row.caviarType !== caviarType)
      return false;
    return true;
  });
  const activeRows = filtered.filter((row) => !isDormant(row));
  const dormantRows = filtered.filter(isDormant);
  // Sorting spans the whole visible list (dormant rows included when shown).
  const visibleRows = sortRows(
    showDormant ? [...activeRows, ...dormantRows] : activeRows,
    sort
  );

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
        {dormantRows.length > 0 ? (
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
              Show dormant ({dormantRows.length})
            </Label>
          </div>
        ) : null}
      </div>

      <ProductsTable
        rows={visibleRows}
        forecastHorizon={forecastHorizon}
        forecastMonthLabels={forecastMonthLabels}
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
  sort,
  onToggleSort,
}: {
  rows: InventoryRow[];
  forecastHorizon: number;
  forecastMonthLabels: string[];
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
              label="Consumed (30 d)"
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
              <TableCell className="max-w-72 whitespace-normal">
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
                {row.consumed30dUnits > 0 ? (
                  formatUnits(row.consumed30dUnits, row.unit)
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
