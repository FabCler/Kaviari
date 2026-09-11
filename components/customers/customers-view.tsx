"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CAVIAR_TYPES } from "@/lib/domain";
import { formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
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
  ALL,
  buildCustomerAnalysis,
  matchesCaviarTypes,
  MONTH_LABELS,
  OTHER_TYPE,
  productKey,
  samePeriodLabel,
  type CustomerFilters,
  type GroupRow,
} from "@/components/customers/aggregate";
import {
  CustomersChart,
  type CustomersChartRow,
} from "@/components/customers/customers-chart";
import { MultiSelect } from "@/components/customers/multi-select";
import type { CustomerSaleEntry } from "@/components/customers/types";

type Grouping = CustomerFilters["grouping"];

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
  const [customers, setCustomers] = React.useState<string[]>([]);
  const [caviarTypes, setCaviarTypes] = React.useState<string[]>([]);
  const [product, setProduct] = React.useState<string>(ALL);
  const [grouping, setGrouping] = React.useState<Grouping>("customer");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [exporting, setExporting] = React.useState(false);

  const customerOptions = React.useMemo(() => {
    const byCode = new Map<string, string>();
    for (const entry of entries)
      byCode.set(entry.customerCode, entry.customerName);
    return [...byCode.entries()]
      .map(([code, name]) => ({ value: code, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [entries]);

  const typeOptions = React.useMemo(() => {
    const present = new Set(
      entries.map((e) => e.caviarType).filter((t): t is string => t != null)
    );
    const options: { value: string; label: string }[] = CAVIAR_TYPES.filter(
      (t) => present.has(t)
    ).map((t) => ({ value: t, label: t }));
    if (entries.some((e) => e.caviarType == null)) {
      options.push({ value: OTHER_TYPE, label: "Other products" });
    }
    return options;
  }, [entries]);

  // Product options follow the selected caviar types, so picking a type
  // narrows the product list to matching tins.
  const productOptions = React.useMemo(() => {
    const byKey = new Map<string, string>();
    for (const entry of entries) {
      if (!matchesCaviarTypes(entry, caviarTypes)) continue;
      byKey.set(productKey(entry), entry.productName);
    }
    return [...byKey.entries()]
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, caviarTypes]);

  // A product that fell out of the narrowed list silently means "all".
  const effectiveProduct =
    product !== ALL && productOptions.some((o) => o.key === product)
      ? product
      : ALL;

  const prevYearAvailable = years.includes(year - 1);
  const compare = compareN1 && prevYearAvailable;

  const filters: CustomerFilters = React.useMemo(
    () => ({
      year,
      customers,
      caviarTypes,
      product: effectiveProduct,
      grouping,
      compareN1: compare,
    }),
    [year, customers, caviarTypes, effectiveProduct, grouping, compare]
  );

  const analysis = React.useMemo(
    () => buildCustomerAnalysis(entries, filters),
    [entries, filters]
  );

  const {
    maxDataMonth,
    monthTotals,
    currentTotal,
    previousSameTotal,
    groupRows,
  } = analysis;
  const sameperiodLabel = samePeriodLabel(year, maxDataMonth);
  const chartData: CustomersChartRow[] = monthTotals;

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  async function downloadExcel() {
    setExporting(true);
    try {
      const res = await fetch("/api/exports/customer-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? "The export failed — please try again.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `customers_top90_${new Date().toISOString().slice(0, 10)}.xlsx`;
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

  const visibleMonths = MONTH_LABELS.slice(0, maxDataMonth);

  const renderQuantityCells = (row: {
    months: number[];
    total: number;
    prevTotal: number;
  }) => (
    <>
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
          <span className="font-normal text-muted-foreground">-</span>
        )}
      </TableCell>
      {compare ? (
        <>
          <TableCell className="tnum text-right text-muted-foreground">
            {row.prevTotal > 0 ? formatNumber(row.prevTotal) : "-"}
          </TableCell>
          <TableCell className="text-right">
            <DeltaText current={row.total} previous={row.prevTotal} />
          </TableCell>
        </>
      ) : null}
    </>
  );

  const renderGroupRow = (row: GroupRow) => {
    const isExpanded = expanded.has(row.key);
    return (
      <React.Fragment key={row.key}>
        <TableRow
          className="cursor-pointer"
          onClick={() => toggleExpanded(row.key)}
          aria-expanded={isExpanded}
        >
          <TableCell className="tnum text-muted-foreground">
            {row.code}
          </TableCell>
          <TableCell className="max-w-72 whitespace-normal font-medium">
            <span className="inline-flex items-center gap-1.5">
              {isExpanded ? (
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              {row.name}
            </span>
          </TableCell>
          {renderQuantityCells(row)}
        </TableRow>
        {isExpanded
          ? row.details.map((detail) => (
              <TableRow key={`${row.key}:${detail.key}`} className="bg-muted/30">
                <TableCell className="tnum text-xs text-muted-foreground">
                  {detail.code}
                </TableCell>
                <TableCell className="max-w-72 pl-9 whitespace-normal text-sm text-muted-foreground">
                  {detail.name}
                </TableCell>
                {renderQuantityCells(detail)}
              </TableRow>
            ))
          : null}
      </React.Fragment>
    );
  };

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
          <MultiSelect
            options={customerOptions}
            selected={customers}
            onChange={setCustomers}
            allLabel="All customers"
            searchPlaceholder="Search customers…"
            ariaLabel="Customers"
          />
          <MultiSelect
            options={typeOptions}
            selected={caviarTypes}
            onChange={setCaviarTypes}
            allLabel="All caviar types"
            searchPlaceholder="Search types…"
            ariaLabel="Caviar types"
            className="max-w-48"
          />
          <Label htmlFor="sales-product" className="sr-only">
            Product
          </Label>
          <Select value={effectiveProduct} onValueChange={setProduct}>
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
                <DeltaText
                  current={currentTotal}
                  previous={previousSameTotal}
                />
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
              {analysis.customerCount}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {analysis.topCustomer
                ? `top: ${analysis.topCustomer.label} (${formatNumber(analysis.topCustomer.total)})`
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
              title={analysis.topProduct?.label}
            >
              {analysis.topProduct?.label ?? "—"}
            </p>
            <p className="tnum mt-1 text-xs text-muted-foreground">
              {analysis.topProduct
                ? `${formatNumber(analysis.topProduct.total)} units in ${year}`
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
          <div className="flex flex-wrap items-center gap-2">
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
            <Button
              variant="outline"
              size="sm"
              onClick={downloadExcel}
              disabled={exporting || groupRows.length === 0}
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
              <TableBody>{groupRows.map(renderGroupRow)}</TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2}>Total</TableCell>
                  {visibleMonths.map((label, index) => (
                    <TableCell key={label} className="tnum text-right">
                      {formatNumber(monthTotals[index].current)}
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
          Click a {grouping === "customer" ? "customer" : "product"} row to
          see its{" "}
          {grouping === "customer" ? "caviars and products" : "customers"}.
          N-1 totals cover the same months as the selected year (Jan–
          {MONTH_LABELS[maxDataMonth - 1]}).
        </p>
      </div>
    </div>
  );
}
