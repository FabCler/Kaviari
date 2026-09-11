"use client";

import * as React from "react";
import { CAVIAR_TYPES } from "@/lib/domain";
import { formatNumber } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CustomersChart,
  type CustomersChartRow,
} from "@/components/customers/customers-chart";
import type { CustomerSaleEntry } from "@/components/customers/types";

const ALL = "all";
const OTHER_TYPE = "other";
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type Grouping = "customer" | "product";

/** Stable identity for a product line ("(blank)" rows have no PR code). */
function productKey(entry: CustomerSaleEntry): string {
  return entry.prCode ?? `name:${entry.productName}`;
}

interface GroupRow {
  key: string;
  code: string;
  name: string;
  months: number[]; // per-month quantity for the selected year
  total: number;
  /** Previous year, same months as the selected year has data for. */
  prevTotal: number;
}

function DeltaText({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  if (previous <= 0) {
    return current > 0 ? (
      <span className="text-xs font-medium text-emerald-700">new</span>
    ) : (
      <span className="text-muted-foreground">-</span>
    );
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span className="text-muted-foreground">=</span>;
  return (
    <span
      className={`text-xs font-medium ${
        pct > 0 ? "text-emerald-700" : "text-destructive"
      }`}
    >
      {pct > 0 ? "+" : "−"}
      {Math.abs(pct)}%
    </span>
  );
}

export function CustomersView({
  entries,
  years,
}: {
  entries: CustomerSaleEntry[];
  /** Years present in the data, ascending. */
  years: number[];
}) {
  const latestYear = years[years.length - 1] ?? new Date().getUTCFullYear();
  const [year, setYear] = React.useState(latestYear);
  const [compareN1, setCompareN1] = React.useState(true);
  const [customer, setCustomer] = React.useState<string>(ALL);
  const [caviarType, setCaviarType] = React.useState<string>(ALL);
  const [product, setProduct] = React.useState<string>(ALL);
  const [grouping, setGrouping] = React.useState<Grouping>("customer");

  const customerOptions = React.useMemo(() => {
    const byCode = new Map<string, string>();
    for (const entry of entries) byCode.set(entry.customerCode, entry.customerName);
    return [...byCode.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const typeOptions = React.useMemo(() => {
    const present = new Set(
      entries.map((e) => e.caviarType).filter((t): t is string => t != null)
    );
    return {
      types: CAVIAR_TYPES.filter((t) => present.has(t)),
      hasOther: entries.some((e) => e.caviarType == null),
    };
  }, [entries]);

  const productOptions = React.useMemo(() => {
    const byKey = new Map<string, string>();
    for (const entry of entries) byKey.set(productKey(entry), entry.productName);
    return [...byKey.entries()]
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const filtered = React.useMemo(
    () =>
      entries.filter((entry) => {
        if (customer !== ALL && entry.customerCode !== customer) return false;
        if (caviarType === OTHER_TYPE) {
          if (entry.caviarType != null) return false;
        } else if (caviarType !== ALL && entry.caviarType !== caviarType) {
          return false;
        }
        if (product !== ALL && productKey(entry) !== product) return false;
        return true;
      }),
    [entries, customer, caviarType, product]
  );

  const current = filtered.filter((e) => e.year === year);
  const previous = filtered.filter((e) => e.year === year - 1);
  const prevYearAvailable = years.includes(year - 1);
  const compare = compareN1 && prevYearAvailable;

  // Compare like with like: the previous year is cut to the months the
  // selected year has data for (e.g. Jan–Sep while the year is running).
  const maxDataMonth = current.length
    ? Math.max(...current.map((e) => e.month))
    : 12;
  const previousSame = previous.filter((e) => e.month <= maxDataMonth);
  const sameperiodLabel =
    maxDataMonth === 12
      ? String(year - 1)
      : `${year - 1} Jan–${MONTH_LABELS[maxDataMonth - 1]}`;

  const chartData: CustomersChartRow[] = MONTH_LABELS.map((label, index) => ({
    label,
    current: current
      .filter((e) => e.month === index + 1)
      .reduce((sum, e) => sum + e.quantity, 0),
    prev: previous
      .filter((e) => e.month === index + 1)
      .reduce((sum, e) => sum + e.quantity, 0),
  }));

  const currentTotal = current.reduce((sum, e) => sum + e.quantity, 0);
  const previousSameTotal = previousSame.reduce((sum, e) => sum + e.quantity, 0);

  const topBy = (keyOf: (e: CustomerSaleEntry) => string, labelOf: (e: CustomerSaleEntry) => string) => {
    const totals = new Map<string, { label: string; total: number }>();
    for (const entry of current) {
      const key = keyOf(entry);
      const existing = totals.get(key) ?? { label: labelOf(entry), total: 0 };
      existing.total += entry.quantity;
      totals.set(key, existing);
    }
    let best: { label: string; total: number } | null = null;
    for (const value of totals.values()) {
      if (!best || value.total > best.total) best = value;
    }
    return { best, count: totals.size };
  };
  const customerStats = topBy((e) => e.customerCode, (e) => e.customerName);
  const productStats = topBy(productKey, (e) => e.productName);

  const groupRows = React.useMemo<GroupRow[]>(() => {
    const byKey = new Map<string, GroupRow>();
    const rowFor = (entry: CustomerSaleEntry): GroupRow => {
      const key =
        grouping === "customer" ? entry.customerCode : productKey(entry);
      let row = byKey.get(key);
      if (!row) {
        row = {
          key,
          code:
            grouping === "customer"
              ? entry.customerCode
              : (entry.prCode ?? "—"),
          name:
            grouping === "customer" ? entry.customerName : entry.productName,
          months: Array.from({ length: 12 }, () => 0),
          total: 0,
          prevTotal: 0,
        };
        byKey.set(key, row);
      }
      return row;
    };
    for (const entry of current) {
      const row = rowFor(entry);
      row.months[entry.month - 1] += entry.quantity;
      row.total += entry.quantity;
    }
    for (const entry of previousSame) {
      rowFor(entry).prevTotal += entry.quantity;
    }
    return [...byKey.values()].sort(
      (a, b) => b.total - a.total || b.prevTotal - a.prevTotal
    );
  }, [current, previousSame, grouping]);

  const visibleMonths = MONTH_LABELS.slice(0, maxDataMonth);
  const columnCount = 2 + visibleMonths.length + 1 + (compare ? 2 : 0);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="sales-year" className="sr-only">
            Year
          </Label>
          <Select
            value={String(year)}
            onValueChange={(value) => setYear(Number(value))}
          >
            <SelectTrigger id="sales-year" size="sm" aria-label="Year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...years].reverse().map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label htmlFor="sales-customer" className="sr-only">
            Customer
          </Label>
          <Select value={customer} onValueChange={setCustomer}>
            <SelectTrigger
              id="sales-customer"
              size="sm"
              aria-label="Customer"
              className="max-w-56"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All customers</SelectItem>
              {customerOptions.map((option) => (
                <SelectItem key={option.code} value={option.code}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label htmlFor="sales-type" className="sr-only">
            Caviar type
          </Label>
          <Select value={caviarType} onValueChange={setCaviarType}>
            <SelectTrigger id="sales-type" size="sm" aria-label="Caviar type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All caviar types</SelectItem>
              {typeOptions.types.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
              {typeOptions.hasOther ? (
                <SelectItem value={OTHER_TYPE}>Other products</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
          <Label htmlFor="sales-product" className="sr-only">
            Product
          </Label>
          <Select value={product} onValueChange={setProduct}>
            <SelectTrigger
              id="sales-product"
              size="sm"
              aria-label="Product"
              className="max-w-64"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All products</SelectItem>
              {productOptions.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="compare-n1"
            checked={compare}
            onCheckedChange={setCompareN1}
            disabled={!prevYearAvailable}
          />
          <Label htmlFor="compare-n1" className="text-sm text-muted-foreground">
            Compare N-1
          </Label>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="h-full gap-2 py-4">
          <CardContent className="px-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Total {year}
            </p>
            <p className="font-display tnum mt-1.5 text-2xl font-medium lg:text-3xl">
              {formatNumber(currentTotal)}
            </p>
            <p className="tnum mt-1 text-xs text-muted-foreground">
              units, Jan–{MONTH_LABELS[maxDataMonth - 1]}
            </p>
          </CardContent>
        </Card>
        <Card className="h-full gap-2 py-4">
          <CardContent className="px-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Vs {sameperiodLabel}
            </p>
            <p className="font-display tnum mt-1.5 text-2xl font-medium lg:text-3xl">
              {prevYearAvailable ? (
                <DeltaText current={currentTotal} previous={previousSameTotal} />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
            <p className="tnum mt-1 text-xs text-muted-foreground">
              {prevYearAvailable
                ? `${formatNumber(previousSameTotal)} units then`
                : "no previous year in the file"}
            </p>
          </CardContent>
        </Card>
        <Card className="h-full gap-2 py-4">
          <CardContent className="px-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Customers
            </p>
            <p className="font-display tnum mt-1.5 text-2xl font-medium lg:text-3xl">
              {customerStats.count}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {customerStats.best
                ? `top: ${customerStats.best.label} (${formatNumber(customerStats.best.total)})`
                : "none in this selection"}
            </p>
          </CardContent>
        </Card>
        <Card className="h-full gap-2 py-4">
          <CardContent className="px-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Top product
            </p>
            <p
              className="mt-1.5 truncate font-display text-lg font-medium lg:text-xl"
              title={productStats.best?.label}
            >
              {productStats.best?.label ?? "—"}
            </p>
            <p className="tnum mt-1 text-xs text-muted-foreground">
              {productStats.best
                ? `${formatNumber(productStats.best.total)} units in ${year}`
                : "none in this selection"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly chart */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-2 px-1 text-sm font-medium text-foreground">
          Monthly quantities — {year}
        </h2>
        <CustomersChart
          data={chartData}
          compareN1={compare}
          yearLabel={String(year)}
          prevYearLabel={`${year - 1} (N-1)`}
        />
      </div>

      {/* Pivot table */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-foreground">
            Quantities by month — {year}
          </h2>
          <Select
            value={grouping}
            onValueChange={(value) => setGrouping(value as Grouping)}
          >
            <SelectTrigger size="sm" aria-label="Group rows by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="customer">By customer</SelectItem>
              <SelectItem value="product">By product</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {groupRows.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            No data for this selection — adjust the filters or upload a new
            file.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>
                    {grouping === "customer" ? "Customer" : "Product"}
                  </TableHead>
                  {visibleMonths.map((label) => (
                    <TableHead key={label} className="text-right">
                      {label}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total {year}</TableHead>
                  {compare ? (
                    <>
                      <TableHead className="text-right">
                        {sameperiodLabel}
                      </TableHead>
                      <TableHead className="text-right">Δ</TableHead>
                    </>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupRows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="tnum text-muted-foreground">
                      {row.code}
                    </TableCell>
                    <TableCell className="max-w-72 whitespace-normal font-medium">
                      {row.name}
                    </TableCell>
                    {visibleMonths.map((label, index) => (
                      <TableCell key={label} className="tnum text-right">
                        {row.months[index] > 0 ? (
                          formatNumber(row.months[index])
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="tnum text-right font-medium">
                      {row.total > 0 ? (
                        formatNumber(row.total)
                      ) : (
                        <span className="font-normal text-muted-foreground">
                          -
                        </span>
                      )}
                    </TableCell>
                    {compare ? (
                      <>
                        <TableCell className="tnum text-right text-muted-foreground">
                          {row.prevTotal > 0 ? formatNumber(row.prevTotal) : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <DeltaText
                            current={row.total}
                            previous={row.prevTotal}
                          />
                        </TableCell>
                      </>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2}>Total</TableCell>
                  {visibleMonths.map((label, index) => (
                    <TableCell key={label} className="tnum text-right">
                      {formatNumber(chartData[index].current)}
                    </TableCell>
                  ))}
                  <TableCell className="tnum text-right">
                    {formatNumber(currentTotal)}
                  </TableCell>
                  {compare ? (
                    <>
                      <TableCell className="tnum text-right text-muted-foreground">
                        {formatNumber(previousSameTotal)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DeltaText
                          current={currentTotal}
                          previous={previousSameTotal}
                        />
                      </TableCell>
                    </>
                  ) : null}
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          {columnCount >= 12
            ? "Scroll sideways to see every month on smaller screens. "
            : ""}
          N-1 totals cover the same months as the selected year (Jan–
          {MONTH_LABELS[maxDataMonth - 1]}).
        </p>
      </div>
    </div>
  );
}
