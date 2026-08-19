"use client";

import * as React from "react";
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
  const [forecastHorizon, setForecastHorizon] = React.useState(3);
  const [caviarType, setCaviarType] = React.useState<string>(ALL);
  const [showDormant, setShowDormant] = React.useState(false);

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
  const visibleRows = showDormant
    ? [...activeRows, ...dormantRows]
    : activeRows;

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
      />
    </div>
  );
}

function ProductsTable({
  rows,
  forecastHorizon,
  forecastMonthLabels,
}: {
  rows: InventoryRow[];
  forecastHorizon: number;
  forecastMonthLabels: string[];
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
            <TableHead>Code</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead className="text-right">Stock on hand</TableHead>
            <TableHead className="text-right">On order</TableHead>
            <TableHead className="text-right">Consumed (30 d)</TableHead>
            {forecastMonthLabels.slice(0, forecastHorizon).map((label) => (
              <TableHead key={label} className="text-right">
                Forecast {label}
              </TableHead>
            ))}
            <TableHead className="text-right">Cover</TableHead>
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
