"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** §33 / §34 — supplier, product and date-range filters for the reports. */
export function ReportFilters({
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
        <Label htmlFor="report-supplier">Supplier</Label>
        <Select
          value={params.get("supplier") ?? "all"}
          onValueChange={(value) => update("supplier", value)}
        >
          <SelectTrigger id="report-supplier">
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
        <Label htmlFor="report-product">Product</Label>
        <Select
          value={params.get("product") ?? "all"}
          onValueChange={(value) => update("product", value)}
        >
          <SelectTrigger id="report-product">
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
        <Label htmlFor="report-from">Delivery from</Label>
        <Input
          id="report-from"
          type="date"
          defaultValue={params.get("from") ?? ""}
          onChange={(event) => update("from", event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="report-to">to</Label>
        <Input
          id="report-to"
          type="date"
          defaultValue={params.get("to") ?? ""}
          onChange={(event) => update("to", event.target.value)}
        />
      </div>
      <div className="flex items-end">
        <Button variant="ghost" onClick={() => router.push("?")}>
          Clear filters
        </Button>
      </div>
    </div>
  );
}
