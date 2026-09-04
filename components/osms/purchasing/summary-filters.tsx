"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WORKFLOW_STATUSES, STATUS_LABEL } from "@/lib/osms/status";

/** §17 — the shared filter bar: supplier, product, status and a date range. */
export function SummaryFilters({
  suppliers,
  products,
}: {
  suppliers: { id: string; name: string }[];
  products: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    router.push(`?${next.toString()}`);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="space-y-1.5">
        <Label htmlFor="filter-supplier">Supplier</Label>
        <Select
          value={params.get("supplier") ?? "all"}
          onValueChange={(value) => update("supplier", value)}
        >
          <SelectTrigger id="filter-supplier">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All suppliers</SelectItem>
            {suppliers.map((supplier) => (
              <SelectItem key={supplier.id} value={supplier.id}>
                {supplier.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-product">Product</Label>
        <Select
          value={params.get("product") ?? "all"}
          onValueChange={(value) => update("product", value)}
        >
          <SelectTrigger id="filter-product">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All products</SelectItem>
            {products.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                {product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-status">Status</Label>
        <Select
          value={params.get("status") ?? "all"}
          onValueChange={(value) => update("status", value)}
        >
          <SelectTrigger id="filter-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {WORKFLOW_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-from">Delivery from</Label>
        <Input
          id="filter-from"
          type="date"
          defaultValue={params.get("from") ?? ""}
          onChange={(event) => update("from", event.target.value)}
        />
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="filter-to">to</Label>
          <Input
            id="filter-to"
            type="date"
            defaultValue={params.get("to") ?? ""}
            onChange={(event) => update("to", event.target.value)}
          />
        </div>
        <Button variant="ghost" onClick={() => router.push("?")}>
          Clear
        </Button>
      </div>
    </div>
  );
}
