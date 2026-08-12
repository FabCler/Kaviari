"use client";

import * as React from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDate,
  formatGrams,
  formatMoney,
  formatTins,
  shortProductName,
} from "@/lib/format";
import type {
  PriceListPreviewRow,
  SalesPreviewRow,
  StockTakePreviewRow,
  UnmatchedRow,
} from "@/lib/import/types";

export function NoticesAlert({ notices }: { notices: string[] }) {
  if (notices.length === 0) return null;
  return (
    <Alert variant="gold">
      <Info />
      <AlertTitle>Notes from the analysis</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {notices.map((notice, i) => (
            <li key={i}>{notice}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

export function UnmatchedAlert({ unmatched }: { unmatched: UnmatchedRow[] }) {
  if (unmatched.length === 0) return null;
  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>
        {unmatched.length} row{unmatched.length === 1 ? "" : "s"} could not be
        matched and will NOT be imported
      </AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {unmatched.slice(0, 12).map((row, i) => (
            <li key={i}>
              <span className="font-medium">{row.label}</span> — {row.reason}
            </li>
          ))}
          {unmatched.length > 12 ? (
            <li>…and {unmatched.length - 12} more.</li>
          ) : null}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------- price list

function priceDiffPercent(oldCost: number, newCost: number): string {
  if (oldCost <= 0) return "—";
  const pct = ((newCost - oldCost) / oldCost) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export function PriceListPreview({
  rows,
  currency,
}: {
  rows: PriceListPreviewRow[];
  currency: string;
}) {
  const [showUnchanged, setShowUnchanged] = React.useState(false);
  const newRows = rows.filter((r) => r.change === "new");
  const changed = rows.filter((r) => r.change === "price_change");
  const unchanged = rows.filter((r) => r.change === "unchanged");

  return (
    <div className="space-y-6">
      {newRows.length > 0 ? (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
            New products <Badge variant="gold">{newRows.length}</Badge>
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="text-right">Tin</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {newRows.map((row, i) => (
                <TableRow key={`new-${i}`}>
                  <TableCell className="font-medium">
                    {shortProductName(row.name)}
                    {row.caviarType ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {row.caviarType}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.prCode ?? "auto"}
                  </TableCell>
                  <TableCell className="text-right tnum">
                    {formatGrams(row.gramsPerUnit ?? 0)}
                  </TableCell>
                  <TableCell className="text-right tnum">
                    {formatMoney(row.unitCost, currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {changed.length > 0 ? (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
            Price changes <Badge variant="warning">{changed.length}</Badge>
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Old</TableHead>
                <TableHead className="text-right">New</TableHead>
                <TableHead className="text-right">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {changed.map((row, i) => {
                const up = row.oldUnitCost != null && row.unitCost > row.oldUnitCost;
                return (
                  <TableRow key={`chg-${i}`}>
                    <TableCell className="font-medium">
                      {shortProductName(row.matchedProductName ?? row.name)}
                      <span className="ml-2 text-xs text-muted-foreground tnum">
                        {formatGrams(row.gramsPerUnit ?? 0)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tnum text-muted-foreground">
                      {row.oldUnitCost != null
                        ? formatMoney(row.oldUnitCost, currency)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tnum font-medium">
                      {formatMoney(row.unitCost, currency)}
                    </TableCell>
                    <TableCell
                      className={`text-right tnum ${up ? "text-destructive" : "text-success"}`}
                    >
                      {row.oldUnitCost != null
                        ? priceDiffPercent(row.oldUnitCost, row.unitCost)
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {unchanged.length > 0 ? (
        <section>
          <button
            type="button"
            onClick={() => setShowUnchanged((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            aria-expanded={showUnchanged}
          >
            {showUnchanged ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
            Unchanged <Badge variant="secondary">{unchanged.length}</Badge>
          </button>
          {showUnchanged ? (
            <div className="mt-2">
              <Table>
                <TableBody>
                  {unchanged.map((row, i) => (
                    <TableRow key={`same-${i}`}>
                      <TableCell>
                        {shortProductName(row.matchedProductName ?? row.name)}
                        <span className="ml-2 text-xs text-muted-foreground tnum">
                          {formatGrams(row.gramsPerUnit ?? 0)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tnum text-muted-foreground">
                        {formatMoney(row.unitCost, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- stock take

export function StockTakePreview({ rows }: { rows: StockTakePreviewRow[] }) {
  const adjustments = rows.filter((r) => r.deltaTins !== 0).length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {adjustments === 0
          ? "Every counted product matches the system — nothing to adjust."
          : `${adjustments} product${adjustments === 1 ? "" : "s"} will receive adjustment movements; the rest match the system.`}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Counted</TableHead>
            <TableHead className="text-right">System</TableHead>
            <TableHead className="text-right">Delta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.productId}>
              <TableCell className="font-medium">
                {shortProductName(row.productName)}
                <span className="ml-2 text-xs text-muted-foreground tnum">
                  {formatGrams(row.gramsPerUnit ?? 0)}
                </span>
              </TableCell>
              <TableCell className="text-right tnum">
                {formatTins(row.countedTins)}
              </TableCell>
              <TableCell className="text-right tnum text-muted-foreground">
                {formatTins(row.systemTins)}
              </TableCell>
              <TableCell className="text-right">
                {row.deltaTins === 0 ? (
                  <Badge variant="secondary">match</Badge>
                ) : row.deltaTins > 0 ? (
                  <Badge variant="success">+{row.deltaTins}</Badge>
                ) : (
                  <Badge variant="destructive">{row.deltaTins}</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// -------------------------------------------------------------- sales export

export function SalesPreview({ rows }: { rows: SalesPreviewRow[] }) {
  const totals = new Map<
    string,
    { name: string; tins: number; grams: number }
  >();
  for (const row of rows) {
    const entry = totals.get(row.productId) ?? {
      name: row.productName,
      tins: 0,
      grams: 0,
    };
    entry.tins += row.tins;
    entry.grams += row.tins * (row.gramsPerUnit ?? 0);
    totals.set(row.productId, entry);
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-medium">Totals per product</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Tins</TableHead>
              <TableHead className="text-right">Grams</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...totals.values()].map((entry) => (
              <TableRow key={entry.name}>
                <TableCell className="font-medium">
                  {shortProductName(entry.name)}
                </TableCell>
                <TableCell className="text-right tnum">
                  {formatTins(entry.tins)}
                </TableCell>
                <TableCell className="text-right tnum">
                  {formatGrams(entry.grams)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">
          Movements to record ({rows.length})
        </h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Tins</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead className="hidden sm:table-cell">Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                <TableCell className="whitespace-nowrap tnum">
                  {formatDate(row.date)}
                </TableCell>
                <TableCell className="font-medium">
                  {shortProductName(row.productName)}
                </TableCell>
                <TableCell className="text-right tnum">
                  {formatTins(row.tins)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{row.channel}</Badge>
                </TableCell>
                <TableCell className="hidden max-w-48 truncate text-muted-foreground sm:table-cell">
                  {row.note ?? ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
