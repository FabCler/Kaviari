"use client";

import { useMemo, useState } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatMoney,
  formatNumber,
  formatUnits,
  formatWeeks,
} from "@/lib/format";
import { PRODUCT_CATEGORIES } from "@/lib/domain";
import { ExplainPopover } from "@/components/planner/explain-popover";

export interface PlannerRowDto {
  productId: string;
  prCode: string;
  name: string;
  category: string;
  unit: string;
  packingPerBox: number | null;
  gramsPerUnit: number | null;
  unitCost: number;
  aduUnitsPerDay: number;
  aduIsOverride: boolean;
  onHandUnits: number;
  onOrderUnits: number;
  weeksOfCover: number | null;
  orderUpToUnits: number;
  suggestedUnits: number;
  /** Team forecast per upcoming month (index 0 = next month), 3 entries. */
  forecastMonths: number[];
  boxes: number | null;
  lineValue: number;
}

const CATEGORY_TABS = ["All", ...PRODUCT_CATEGORIES] as const;

function CoverBadge({ weeks }: { weeks: number | null }) {
  if (weeks == null) {
    return <Badge variant="outline">∞</Badge>;
  }
  const label = formatWeeks(weeks);
  if (weeks < 1) return <Badge variant="destructive">{label}</Badge>;
  if (weeks < 2) return <Badge variant="warning">{label}</Badge>;
  return <Badge variant="seafoam">{label}</Badge>;
}

/** A row is "active" when it needs ordering, holds stock, or has demand. */
function isActive(row: PlannerRowDto): boolean {
  return (
    row.suggestedUnits > 0 || row.onHandUnits > 0 || row.aduUnitsPerDay > 0
  );
}

export function PlannerTable({
  rows,
  currency,
  forecastMonthLabels,
}: {
  rows: PlannerRowDto[];
  currency: string;
  forecastMonthLabels: string[];
}) {
  const [category, setCategory] = useState<string>("Caviar");
  const [showAll, setShowAll] = useState(false);
  const [forecastHorizon, setForecastHorizon] = useState(3);

  const inCategory = useMemo(
    () =>
      category === "All"
        ? rows
        : rows.filter((row) => row.category === category),
    [rows, category]
  );
  const visible = useMemo(
    () => (showAll ? inCategory : inCategory.filter(isActive)),
    [inCategory, showAll]
  );
  const dormantCount = inCategory.length - inCategory.filter(isActive).length;
  const totalSuggestedValue = inCategory.reduce(
    (sum, r) => sum + r.lineValue,
    0
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <div className="max-w-full overflow-x-auto">
          <Tabs value={category} onValueChange={setCategory}>
            <TabsList aria-label="Filter by product category">
              {CATEGORY_TABS.map((tab) => (
                <TabsTrigger key={tab} value={tab} className="px-3">
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={String(forecastHorizon)}
            onValueChange={(value) => setForecastHorizon(Number(value))}
          >
            <SelectTrigger size="sm" aria-label="Forecast horizon">
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
        {dormantCount > 0 ? (
          <div className="flex items-center gap-2">
            <Switch
              id="show-all-products"
              checked={showAll}
              onCheckedChange={setShowAll}
            />
            <Label
              htmlFor="show-all-products"
              className="text-sm text-muted-foreground"
            >
              Show all products ({dormantCount} dormant hidden)
            </Label>
          </div>
        ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">ADU units/day</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="text-right">On order</TableHead>
              <TableHead className="text-center">Cover</TableHead>
              {forecastMonthLabels.slice(0, forecastHorizon).map((label) => (
                <TableHead key={label} className="text-right">
                  Forecast {label}
                </TableHead>
              ))}
              <TableHead className="text-right">Order-up-to S</TableHead>
              <TableHead className="text-right">Suggested</TableHead>
              <TableHead>
                <span className="sr-only">Explain</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8 + forecastHorizon}
                  className="py-10 text-center text-muted-foreground"
                >
                  {inCategory.length === 0
                    ? `No ${category === "All" ? "" : `${category} `}products found.`
                    : "No products with stock, demand or a suggested order. Toggle “Show all products” to see dormant SKUs."}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((row) => (
                <TableRow
                  key={row.productId}
                  className={
                    row.suggestedUnits > 0 ? "bg-gold/[0.04]" : undefined
                  }
                >
                  <TableCell>
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground tnum">
                      {row.prCode}
                      {row.gramsPerUnit ? ` · ${row.gramsPerUnit} g` : ""}
                      {" · "}
                      {formatMoney(row.unitCost, currency)}
                      {row.packingPerBox
                        ? ` · box of ${row.packingPerBox}`
                        : ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tnum">
                    {formatNumber(row.aduUnitsPerDay, 2)}
                    {row.aduIsOverride ? (
                      <Badge variant="gold" className="ml-1.5 align-middle">
                        manual
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tnum">
                    {formatUnits(row.onHandUnits, row.unit)}
                  </TableCell>
                  <TableCell className="text-right tnum">
                    {row.onOrderUnits > 0
                      ? formatUnits(row.onOrderUnits, row.unit)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <CoverBadge weeks={row.weeksOfCover} />
                  </TableCell>
                  {row.forecastMonths
                    .slice(0, forecastHorizon)
                    .map((units, index) => (
                      <TableCell key={index} className="text-right tnum">
                        {units > 0 ? formatUnits(units, row.unit) : "—"}
                      </TableCell>
                    ))}
                  <TableCell className="text-right tnum">
                    {formatNumber(row.orderUpToUnits, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.suggestedUnits > 0 ? (
                      <div>
                        <div className="font-semibold tnum">
                          {formatUnits(row.suggestedUnits, row.unit)}
                          {row.boxes ? (
                            <span>
                              {" "}
                              ({formatNumber(row.boxes, 0)}{" "}
                              {row.boxes === 1 ? "box" : "boxes"})
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs font-normal text-muted-foreground tnum">
                          {formatMoney(row.lineValue, currency)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.suggestedUnits > 0 ? (
                      <ExplainPopover
                        productId={row.productId}
                        productName={row.name}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={6 + forecastHorizon} className="text-right font-medium">
                Total suggested order value
                {category !== "All" ? ` — ${category}` : ""}
              </TableCell>
              <TableCell className="text-right font-semibold tnum">
                {formatMoney(totalSuggestedValue, currency)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
