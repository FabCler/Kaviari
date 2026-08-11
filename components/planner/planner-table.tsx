"use client";

import { useMemo, useState } from "react";
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
import {
  formatGrams,
  formatMoney,
  formatNumber,
} from "@/lib/format";
import { ExplainPopover } from "@/components/planner/explain-popover";

export interface PlannerRowDto {
  productId: string;
  name: string;
  tinSizeGrams: number;
  unitCost: number;
  aduGramsPerDay: number;
  aduIsOverride: boolean;
  onHandTins: number;
  onHandGrams: number;
  onOrderTins: number;
  daysOfCover: number | null;
  orderUpToGrams: number;
  suggestedGrams: number;
  suggestedTins: number;
  lineValue: number;
}

function CoverBadge({ days }: { days: number | null }) {
  if (days == null) {
    return <Badge variant="outline">—</Badge>;
  }
  const label = `${formatNumber(days, 0)} d`;
  if (days < 7) return <Badge variant="destructive">{label}</Badge>;
  if (days < 15) return <Badge variant="warning">{label}</Badge>;
  return <Badge variant="seafoam">{label}</Badge>;
}

/** A row is "active" when it needs ordering, holds stock, or has demand. */
function isActive(row: PlannerRowDto): boolean {
  return row.suggestedTins > 0 || row.onHandTins > 0 || row.aduGramsPerDay > 0;
}

export function PlannerTable({
  rows,
  currency,
}: {
  rows: PlannerRowDto[];
  currency: string;
}) {
  const [showAll, setShowAll] = useState(false);

  const visible = useMemo(
    () => (showAll ? rows : rows.filter(isActive)),
    [rows, showAll]
  );
  const dormantCount = rows.length - rows.filter(isActive).length;
  const totalSuggestedValue = rows.reduce((sum, r) => sum + r.lineValue, 0);

  return (
    <div className="space-y-3">
      {dormantCount > 0 ? (
        <div className="flex items-center justify-end gap-2">
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">ADU g/day</TableHead>
            <TableHead className="text-right">On hand</TableHead>
            <TableHead className="text-right">On order</TableHead>
            <TableHead className="text-center">Cover</TableHead>
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
                colSpan={8}
                className="py-10 text-center text-muted-foreground"
              >
                No products with stock, demand or a suggested order. Toggle
                “Show all products” to see dormant SKUs.
              </TableCell>
            </TableRow>
          ) : (
            visible.map((row) => (
              <TableRow
                key={row.productId}
                className={row.suggestedTins > 0 ? "bg-gold/[0.04]" : undefined}
              >
                <TableCell>
                  <div className="font-medium">{row.name}</div>
                  <div className="text-xs text-muted-foreground tnum">
                    {row.tinSizeGrams} g tin · {formatMoney(row.unitCost, currency)}
                  </div>
                </TableCell>
                <TableCell className="text-right tnum">
                  {formatNumber(row.aduGramsPerDay)}
                  {row.aduIsOverride ? (
                    <Badge variant="gold" className="ml-1.5 align-middle">
                      manual
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tnum">
                  {formatNumber(row.onHandTins)}
                  <span className="text-muted-foreground">
                    {" "}
                    / {formatGrams(row.onHandGrams)}
                  </span>
                </TableCell>
                <TableCell className="text-right tnum">
                  {row.onOrderTins > 0 ? formatNumber(row.onOrderTins) : "—"}
                </TableCell>
                <TableCell className="text-center">
                  <CoverBadge days={row.daysOfCover} />
                </TableCell>
                <TableCell className="text-right tnum">
                  {formatGrams(row.orderUpToGrams)}
                </TableCell>
                <TableCell className="text-right">
                  {row.suggestedTins > 0 ? (
                    <div>
                      <div className="tnum">
                        <span className="text-muted-foreground">
                          {formatGrams(row.suggestedGrams)} →{" "}
                        </span>
                        <span className="font-semibold">
                          {row.suggestedTins}{" "}
                          {row.suggestedTins === 1 ? "tin" : "tins"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground tnum">
                        {formatMoney(row.lineValue, currency)}
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {row.suggestedTins > 0 ? (
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
            <TableCell colSpan={6} className="text-right font-medium">
              Total suggested order value
            </TableCell>
            <TableCell className="text-right font-semibold tnum">
              {formatMoney(totalSuggestedValue, currency)}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
