"use client";

import * as React from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import {
  formatDate,
  formatGrams,
  formatMoney,
  formatNumber,
  formatTins,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProductDetailSheet } from "@/components/inventory/product-detail-sheet";
import { CoverBadge, DaysLeftBadge } from "@/components/inventory/badges";
import type { ExpiringLotRow, InventoryRow } from "@/components/inventory/types";

type View = "caviar" | "other" | "all" | "expiring";

function isDormant(row: InventoryRow): boolean {
  return row.onHandTins <= 0 && row.aduGramsPerDay <= 0 && row.onOrderTins <= 0;
}

export function InventoryTable({
  rows,
  expiring,
  currency,
  expiryAlertDays,
  initialView,
}: {
  rows: InventoryRow[];
  expiring: ExpiringLotRow[];
  currency: string;
  expiryAlertDays: number;
  initialView: View;
}) {
  const [view, setView] = React.useState<View>(initialView);
  const [showDormant, setShowDormant] = React.useState(false);
  const [selected, setSelected] = React.useState<InventoryRow | null>(null);

  const categoryFiltered = rows.filter((row) =>
    view === "all" ? true : row.category === view
  );
  const activeRows = categoryFiltered.filter((row) => !isDormant(row));
  const dormantRows = categoryFiltered.filter(isDormant);
  const visibleRows = showDormant
    ? [...activeRows, ...dormantRows]
    : activeRows;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList>
            <TabsTrigger value="caviar">Caviar</TabsTrigger>
            <TabsTrigger value="other">Other</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="expiring">
              Expiring
              {expiring.length > 0 ? (
                <Badge variant="warning" className="tnum ml-1.5 px-1.5">
                  {expiring.length}
                </Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {view !== "expiring" && dormantRows.length > 0 ? (
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

      {view === "expiring" ? (
        <ExpiringLotsTable expiring={expiring} expiryAlertDays={expiryAlertDays} />
      ) : (
        <ProductsTable
          rows={visibleRows}
          currency={currency}
          onSelect={setSelected}
        />
      )}

      <ProductDetailSheet
        row={selected}
        currency={currency}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}

function ProductsTable({
  rows,
  currency,
  onSelect,
}: {
  rows: InventoryRow[];
  currency: string;
  onSelect: (row: InventoryRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
        No products in this view. Receive a delivery or switch category tabs.
      </div>
    );
  }
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Tin</TableHead>
            <TableHead className="text-right">On hand</TableHead>
            <TableHead className="text-right">On order</TableHead>
            <TableHead className="text-right">ADU</TableHead>
            <TableHead className="text-right">Cover</TableHead>
            <TableHead className="text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.productId}
              className="cursor-pointer"
              onClick={() => onSelect(row)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(row);
                }
              }}
              aria-label={`Open details for ${row.shortName}`}
            >
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{row.shortName}</span>
                  {row.grade ? (
                    <Badge variant="gold" className="hidden sm:inline-flex">
                      {row.grade}
                    </Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="tnum text-right text-muted-foreground">
                {formatGrams(row.tinSizeGrams)}
              </TableCell>
              <TableCell className="tnum text-right">
                <span className="font-medium">{formatTins(row.onHandTins)}</span>
                <span className="ml-1 hidden text-xs text-muted-foreground md:inline">
                  {formatGrams(row.onHandGrams)}
                </span>
              </TableCell>
              <TableCell className="tnum text-right text-muted-foreground">
                {row.onOrderTins > 0 ? formatTins(row.onOrderTins) : "—"}
              </TableCell>
              <TableCell className="tnum text-right text-muted-foreground">
                {row.aduGramsPerDay > 0
                  ? `${formatNumber(row.aduGramsPerDay, 1)} g/d`
                  : "—"}
                {row.aduIsOverride ? (
                  <span className="ml-1 text-xs text-gold-deep">(manual)</span>
                ) : null}
              </TableCell>
              <TableCell className="text-right">
                <CoverBadge days={row.daysOfCover} />
              </TableCell>
              <TableCell className="tnum text-right">
                {formatMoney(row.stockValue, currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ExpiringLotsTable({
  expiring,
  expiryAlertDays,
}: {
  expiring: ExpiringLotRow[];
  expiryAlertDays: number;
}) {
  if (expiring.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
        Nothing expires within {expiryAlertDays} days. The cellar is fresh.
      </div>
    );
  }
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Lot</TableHead>
            <TableHead className="text-right">Remaining</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expiring.map((lot) => (
            <TableRow key={lot.lotId}>
              <TableCell className="font-medium">{lot.productName}</TableCell>
              <TableCell className="tnum text-muted-foreground">
                {lot.lotNumber}
              </TableCell>
              <TableCell className="tnum text-right">
                {formatTins(lot.quantityTins)}
                <span className="ml-1 hidden text-xs text-muted-foreground md:inline">
                  {formatGrams(lot.quantityTins * lot.tinSizeGrams)}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="tnum hidden sm:inline">
                    {formatDate(lot.expiryDate)}
                  </span>
                  <DaysLeftBadge days={lot.daysLeft} />
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/marketing?promoteLot=${lot.lotId}`}>
                    <Megaphone className="text-gold-deep" />
                    <span className="hidden sm:inline">Push to marketing</span>
                    <span className="sm:hidden">Promote</span>
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
