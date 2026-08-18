"use client";

import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatGrams, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  AnalysisRow,
  Bucket,
  TableColumn,
} from "@/components/consume-analysis/aggregate";

/**
 * Sort key: a static row field, or "c<i>" / "p<i>" for the i-th consumed /
 * N-1 column (aligned with tableColumns).
 */
type SortKey = string;

interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

const BUCKET_KEY_RE = /^([cp])(\d+)$/;

function rowValue(row: AnalysisRow, key: SortKey): string | number {
  const m = BUCKET_KEY_RE.exec(key);
  if (m) {
    const index = Number(m[2]);
    return (m[1] === "c" ? row.bucketUnits[index] : row.prevBucketUnits[index]) ?? 0;
  }
  const value = row[key as keyof AnalysisRow];
  return typeof value === "string" || typeof value === "number" ? value : 0;
}

function VarianceBadge({ row }: { row: AnalysisRow }) {
  if (row.forecast <= 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (row.variance > 0) return <Badge variant="warning">Over</Badge>;
  if (row.variance < 0) return <Badge variant="seafoam">Under</Badge>;
  return <Badge variant="outline">On target</Badge>;
}

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  align = "right",
  muted = false,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
  muted?: boolean;
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.dir === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <TableHead
      className={align === "right" ? "text-right" : undefined}
      aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 rounded-sm outline-none",
          active && "text-foreground",
          muted && !active && "opacity-80"
        )}
      >
        {label}
        <Icon className="size-3" aria-hidden />
      </button>
    </TableHead>
  );
}

export function AnalysisTable({
  rows,
  totals,
  avgPerWeekTotal,
  tableColumns,
  compareN1,
  buckets,
  tableBuckets,
  onTableBucketsChange,
  showAll,
  onShowAllChange,
}: {
  rows: AnalysisRow[];
  totals: {
    units: number;
    grams: number;
    forecast: number;
    variance: number;
    bucketUnits: number[];
    prevBucketUnits: number[];
  };
  avgPerWeekTotal: number;
  /** Consumed columns: the whole period, or one per selected bucket. */
  tableColumns: TableColumn[];
  /** Show the N-1 column(s) next to each consumed column. */
  compareN1: boolean;
  /** Buckets of the current granularity, for the table-period selector. */
  buckets: Bucket[];
  /** Selected bucket keys (empty = whole period). */
  tableBuckets: string[];
  onTableBucketsChange: (value: string[]) => void;
  showAll: boolean;
  onShowAllChange: (value: boolean) => void;
}) {
  const [sort, setSort] = useState<SortState>({ key: "units", dir: "desc" });

  // A stale bucket sort key (column deselected, granularity switched, N-1
  // turned off) silently falls back to the default total sort.
  const effectiveSort = useMemo<SortState>(() => {
    const bucketSort = BUCKET_KEY_RE.exec(sort.key);
    const valid =
      !bucketSort ||
      (Number(bucketSort[2]) < tableColumns.length &&
        (bucketSort[1] === "c" || compareN1));
    return valid ? sort : { key: "units", dir: "desc" };
  }, [sort, tableColumns.length, compareN1]);

  const onSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "prCode" || key === "name" ? "asc" : "desc" }
    );
  };

  const hiddenCount = rows.filter((r) => r.units === 0 && r.forecast === 0).length;

  const visible = useMemo(() => {
    const base = showAll ? rows : rows.filter((r) => r.units !== 0 || r.forecast !== 0);
    const factor = effectiveSort.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      const va = rowValue(a, effectiveSort.key);
      const vb = rowValue(b, effectiveSort.key);
      const cmp =
        typeof va === "string" && typeof vb === "string"
          ? va.localeCompare(vb)
          : Number(va) - Number(vb);
      return cmp * factor || a.name.localeCompare(b.name);
    });
  }, [rows, showAll, effectiveSort]);

  const multi = tableColumns.length > 1;
  const selectedBuckets = buckets.filter((b) => tableBuckets.includes(b.key));
  const triggerLabel =
    selectedBuckets.length === 0
      ? "Whole period"
      : selectedBuckets.length === 1
        ? selectedBuckets[0].longLabel
        : `${selectedBuckets.length} periods`;

  const toggleBucket = (key: string) => {
    onTableBucketsChange(
      tableBuckets.includes(key)
        ? tableBuckets.filter((k) => k !== key)
        : [...tableBuckets, key]
    );
  };

  // 5 identity columns + consumed (+ N-1) per period + optional selection
  // total + Kg / Share / Avg / Forecast / Variance.
  const columnCount =
    5 + tableColumns.length * (compareN1 ? 2 : 1) + (multi ? 1 : 0) + 5;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <Label
            htmlFor="table-period"
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            Table period
          </Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                id="table-period"
                variant="outline"
                size="sm"
                className="min-w-44 justify-between font-normal"
              >
                {triggerLabel}
                <ChevronDown className="size-4 opacity-50" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
              <DropdownMenuItem
                onSelect={() => onTableBucketsChange([])}
                className={cn(selectedBuckets.length === 0 && "font-medium")}
              >
                Whole period
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {buckets.map((b) => (
                <DropdownMenuCheckboxItem
                  key={b.key}
                  checked={tableBuckets.includes(b.key)}
                  onCheckedChange={() => toggleBucket(b.key)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {b.longLabel}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {multi ? (
            <span className="text-xs text-muted-foreground">
              One consumed column per selected period — Share %, Avg/wk, Forecast
              and Variance cover the selected periods combined.
            </span>
          ) : null}
        </div>
        {hiddenCount > 0 ? (
          <div className="flex items-center gap-2">
            <Switch id="show-all-rows" checked={showAll} onCheckedChange={onShowAllChange} />
            <Label htmlFor="show-all-rows" className="text-sm text-muted-foreground">
              Show all products ({hiddenCount} without consumption or forecast hidden)
            </Label>
          </div>
        ) : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead label="Code" sortKey="prCode" sort={effectiveSort} onSort={onSort} align="left" />
            <SortableHead label="Description" sortKey="name" sort={effectiveSort} onSort={onSort} align="left" />
            <TableHead>Type</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Unit</TableHead>
            {tableColumns.map((col, c) => (
              <Fragment key={col.key}>
                <SortableHead
                  label={`Consumed — ${col.label}`}
                  sortKey={multi ? `c${c}` : "units"}
                  sort={effectiveSort}
                  onSort={onSort}
                />
                {compareN1 ? (
                  <SortableHead
                    label={`N-1 — ${col.prevLabel}`}
                    sortKey={`p${c}`}
                    sort={effectiveSort}
                    onSort={onSort}
                    muted
                  />
                ) : null}
              </Fragment>
            ))}
            {multi ? (
              <SortableHead
                label="Total — selection"
                sortKey="units"
                sort={effectiveSort}
                onSort={onSort}
              />
            ) : null}
            <SortableHead label="Kg ref" sortKey="grams" sort={effectiveSort} onSort={onSort} />
            <SortableHead label="Share %" sortKey="sharePct" sort={effectiveSort} onSort={onSort} />
            <SortableHead label="Avg/wk" sortKey="avgPerWeek" sort={effectiveSort} onSort={onSort} />
            <SortableHead label="Forecast" sortKey="forecast" sort={effectiveSort} onSort={onSort} />
            <SortableHead label="Variance" sortKey="variance" sort={effectiveSort} onSort={onSort} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="py-10 text-center text-muted-foreground">
                No products match the current filters
                {hiddenCount > 0 ? " — toggle “Show all products” to see dormant SKUs." : "."}
              </TableCell>
            </TableRow>
          ) : (
            visible.map((row) => (
              <TableRow key={row.productId}>
                <TableCell className="text-xs text-muted-foreground tnum">
                  {row.prCode}
                </TableCell>
                <TableCell className="max-w-64 truncate font-medium" title={row.name}>
                  {row.name}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.caviarType ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{row.category}</TableCell>
                <TableCell className="text-muted-foreground">{row.unit}</TableCell>
                {tableColumns.map((col, c) => (
                  <Fragment key={col.key}>
                    <TableCell className="text-right font-medium tnum">
                      {formatNumber(row.bucketUnits[c] ?? 0)}
                    </TableCell>
                    {compareN1 ? (
                      <TableCell className="text-right text-muted-foreground tnum">
                        {formatNumber(row.prevBucketUnits[c] ?? 0)}
                      </TableCell>
                    ) : null}
                  </Fragment>
                ))}
                {multi ? (
                  <TableCell className="text-right font-semibold tnum">
                    {formatNumber(row.units)}
                  </TableCell>
                ) : null}
                <TableCell className="text-right text-muted-foreground tnum">
                  {row.grams > 0 ? formatGrams(row.grams) : "—"}
                </TableCell>
                <TableCell className="text-right tnum">
                  {row.sharePct > 0 ? `${formatNumber(row.sharePct)}%` : "—"}
                </TableCell>
                <TableCell className="text-right tnum">
                  {formatNumber(row.avgPerWeek)}
                </TableCell>
                <TableCell className="text-right tnum">
                  {row.forecast > 0 ? formatNumber(row.forecast) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <span className="inline-flex items-center gap-2">
                    <span className="tnum">
                      {row.forecast > 0
                        ? `${row.variance > 0 ? "+" : ""}${formatNumber(row.variance)}`
                        : "—"}
                    </span>
                    <VarianceBadge row={row} />
                  </span>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={5} className="text-right font-medium">
              Total
            </TableCell>
            {tableColumns.map((col, c) => (
              <Fragment key={col.key}>
                <TableCell className="text-right font-semibold tnum">
                  {formatNumber(totals.bucketUnits[c] ?? 0)}
                </TableCell>
                {compareN1 ? (
                  <TableCell className="text-right text-muted-foreground tnum">
                    {formatNumber(totals.prevBucketUnits[c] ?? 0)}
                  </TableCell>
                ) : null}
              </Fragment>
            ))}
            {multi ? (
              <TableCell className="text-right font-semibold tnum">
                {formatNumber(totals.units)}
              </TableCell>
            ) : null}
            <TableCell className="text-right tnum">
              {totals.grams > 0 ? formatGrams(totals.grams) : "—"}
            </TableCell>
            <TableCell className="text-right tnum">
              {totals.units > 0 ? "100%" : "—"}
            </TableCell>
            <TableCell className="text-right tnum">
              {formatNumber(avgPerWeekTotal)}
            </TableCell>
            <TableCell className="text-right tnum">
              {totals.forecast > 0 ? formatNumber(totals.forecast) : "—"}
            </TableCell>
            <TableCell className="text-right tnum">
              {totals.forecast > 0
                ? `${totals.variance > 0 ? "+" : ""}${formatNumber(totals.variance)}`
                : "—"}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
