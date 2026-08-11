"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Search, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { formatGrams, formatNumber, formatTins } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogSheet } from "@/components/consume/log-sheet";
import { undoMovements } from "@/components/consume/undo";
import type {
  ConsumableProduct,
  RecentMovementRow,
} from "@/components/consume/types";

const TYPE_LABELS: Record<string, string> = {
  consumption: "Consumption",
  sale: "Sale",
  waste: "Waste",
  marketing_sample: "Sample",
};

export function ConsumeFlow({
  products,
  recent,
}: {
  products: ConsumableProduct[];
  recent: RecentMovementRow[];
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<ConsumableProduct | null>(
    null
  );

  const query = search.trim().toLowerCase();
  const filtered = query
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.grade ?? "").toLowerCase().includes(query)
      )
    : products;

  return (
    <div>
      {/* Search */}
      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Label htmlFor="product-search" className="sr-only">
          Search products
        </Label>
        <Input
          id="product-search"
          type="search"
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 pl-9"
        />
      </div>

      {/* Product picker */}
      {products.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          Nothing in stock right now. Receive a delivery first, then log
          consumption here.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          No products match “{search}”.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((product) => (
            <button
              key={product.productId}
              type="button"
              onClick={() => setSelected(product)}
              className="flex min-h-28 flex-col items-start justify-between rounded-xl border bg-card p-3 text-left shadow-sm transition-all hover:border-gold/60 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/60 outline-none active:scale-[0.98]"
            >
              <div>
                <span className="line-clamp-2 text-sm font-medium leading-snug">
                  {product.shortName}
                </span>
                <span className="tnum mt-0.5 block text-xs text-muted-foreground">
                  {formatGrams(product.tinSizeGrams)} tin
                  {product.grade ? ` · ${product.grade}` : ""}
                </span>
              </div>
              <Badge variant="secondary" className="tnum mt-2">
                {formatTins(product.onHandTins)}
              </Badge>
            </button>
          ))}
        </div>
      )}

      {/* Recent activity */}
      <RecentList recent={recent} />

      <LogSheet
        product={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onLogged={() => {
          setSelected(null);
          setSearch("");
          router.refresh();
        }}
      />
    </div>
  );
}

function RecentList({ recent }: { recent: RecentMovementRow[] }) {
  const router = useRouter();
  const [undoing, setUndoing] = React.useState<string | null>(null);

  if (recent.length === 0) return null;

  async function undoRow(row: RecentMovementRow) {
    setUndoing(row.movementId);
    const result = await undoMovements([row.movementId]);
    setUndoing(null);
    if (result.ok) {
      toast.success(
        `Undid ${formatTins(row.tins)} of ${row.productName} — stock restored`
      );
    } else {
      toast.error(result.error ?? "Undo failed");
    }
    router.refresh();
  }

  return (
    <Card className="mt-8 gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-semibold">Logged today</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <ul className="divide-y">
          {recent.map((row) => (
            <li
              key={row.movementId}
              className="flex items-center justify-between gap-2 py-2"
            >
              <div className="min-w-0 text-sm">
                <span className="tnum text-xs text-muted-foreground">
                  {format(new Date(row.date), "HH:mm")}
                </span>
                <span className="ml-2 font-medium">{row.productName}</span>
                <span className="tnum ml-2 text-muted-foreground">
                  {formatNumber(row.tins, 2)} tins
                </span>
                <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">
                  {TYPE_LABELS[row.type] ?? row.type}
                  {row.channel ? ` · ${row.channel}` : ""}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => undoRow(row)}
                disabled={undoing === row.movementId}
                aria-label={`Undo ${formatTins(row.tins)} of ${row.productName}`}
              >
                <Undo2 />
                <span className="hidden sm:inline">Undo</span>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
