"use client";

import * as React from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { CAVIAR_TYPES, PRODUCT_CATEGORIES } from "@/lib/domain";
import { formatDate, formatUnits } from "@/lib/format";
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

type View = "products" | "expiring";

const ALL = "all";

function isDormant(row: InventoryRow): boolean {
  return (
    row.onHandUnits <= 0 && row.aduUnitsPerDay <= 0 && row.onOrderUnits <= 0
  );
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
  const [category, setCategory] = React.useState<string>(ALL);
  const [caviarType, setCaviarType] = React.useState<string>(ALL);
  const [showDormant, setShowDormant] = React.useState(false);
  const [selected, setSelected] = React.useState<InventoryRow | null>(null);

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
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="products">Products</TabsTrigger>
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
          {view === "products" ? (
            <>
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
            </>
          ) : null}
        </div>
        {view === "products" && dormantRows.length > 0 ? (
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
        <ProductsTable rows={visibleRows} onSelect={setSelected} />
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
  onSelect,
}: {
  rows: InventoryRow[];
  onSelect: (row: InventoryRow) => void;
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
            <TableHead className="text-right">Cover</TableHead>
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
                {formatUnits(row.onHandUnits, row.unit)}
              </TableCell>
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
    <div className="overflow-x-auto rounded-xl border bg-card">
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
                {formatUnits(lot.quantityTins, lot.unit)}
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
