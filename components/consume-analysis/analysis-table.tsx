"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import type { AnalysisRow } from "@/components/consume-analysis/aggregate";

type SortKey =
  | "prCode"
  | "name"
  | "units"
  | "grams"
  | "sharePct"
  | "avgPerWeek"
  | "forecast"
  | "variance";

interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
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
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
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
          active && "text-foreground"
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
  showAll,
  onShowAllChange,
}: {
  rows: AnalysisRow[];
  totals: { units: number; grams: number; forecast: number; variance: number };
  avgPerWeekTotal: number;
  showAll: boolean;
  onShowAllChange: (value: boolean) => void;
}) {
  const [sort, setSort] = useState<SortState>({ key: "units", dir: "desc" });

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
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      const va = a[sort.key];
      const vb = b[sort.key];
      const cmp =
        typeof va === "string" && typeof vb === "string"
          ? va.localeCompare(vb)
          : Number(va) - Number(vb);
      return cmp * factor || a.name.localeCompare(b.name);
    });
  }, [rows, showAll, sort]);

  return (
    <div className="space-y-3">
      {hiddenCount > 0 ? (
        <div className="flex items-center justify-end gap-2">
          <Switch id="show-all-rows" checked={showAll} onCheckedChange={onShowAllChange} />
          <Label htmlFor="show-all-rows" className="text-sm text-muted-foreground">
            Show all products ({hiddenCount} without consumption or forecast hidden)
          </Label>
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead label="Code" sortKey="prCode" sort={sort} onSort={onSort} align="left" />
            <SortableHead label="Description" sortKey="name" sort={sort} onSort={onSort} align="left" />
            <TableHead>Type</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Unit</TableHead>
            <SortableHead label="Consumed" sortKey="units" sort={sort} onSort={onSort} />
            <SortableHead label="Kg ref" sortKey="grams" sort={sort} onSort={onSort} />
            <SortableHead label="Share %" sortKey="sharePct" sort={sort} onSort={onSort} />
            <SortableHead label="Avg/wk" sortKey="avgPerWeek" sort={sort} onSort={onSort} />
            <SortableHead label="Forecast" sortKey="forecast" sort={sort} onSort={onSort} />
            <SortableHead label="Variance" sortKey="variance" sort={sort} onSort={onSort} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
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
                <TableCell className="text-right font-medium tnum">
                  {formatNumber(row.units)}
                </TableCell>
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
            <TableCell className="text-right font-semibold tnum">
              {formatNumber(totals.units)}
            </TableCell>
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
