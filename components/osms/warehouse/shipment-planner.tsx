"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Shipments are built per customer — one shipment can only carry lines that
 * belong to the same customer, which is also what the API enforces.
 */

export interface ShippableLine {
  id: string;
  customerId: string;
  customerName: string;
  deliveryLocation: string | null;
  soNumber: string | null;
  poNumber: string | null;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  itemCount: number;
  allocationNumber: string;
}

export function ShipmentPlanner({ lines }: { lines: ShippableLine[] }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [shipDate, setShipDate] = React.useState(
    new Date().toISOString().slice(0, 10)
  );
  const [busy, setBusy] = React.useState(false);

  const byCustomer = React.useMemo(() => {
    const groups = new Map<string, ShippableLine[]>();
    for (const line of lines) {
      const list = groups.get(line.customerId) ?? [];
      list.push(line);
      groups.set(line.customerId, list);
    }
    return [...groups.entries()];
  }, [lines]);

  const selectedCustomers = new Set(
    lines.filter((line) => selected.has(line.id)).map((line) => line.customerId)
  );
  const mixedCustomers = selectedCustomers.size > 1;

  async function ship() {
    const picked = lines.filter((line) => selected.has(line.id));
    if (picked.length === 0) return;
    setBusy(true);
    try {
      const response = await fetch("/api/osms/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: picked[0].customerId,
          shipDate,
          deliveryLocation: picked[0].deliveryLocation ?? undefined,
          allocationLineIds: picked.map((line) => line.id),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? "The shipment could not be created.");
        return;
      }
      toast.success(`${payload.shipmentNumber} shipped.`);
      setSelected(new Set());
      router.refresh();
    } catch {
      toast.error("The request failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (lines.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nothing is ready to ship — allocations must be completed and the goods
          received first.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-end justify-between gap-3">
        <div>
          <CardTitle className="text-base">Ready to ship</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Select the lines for one customer, then create the shipment.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="ship-date">Ship date</Label>
            <Input
              id="ship-date"
              type="date"
              value={shipDate}
              onChange={(event) => setShipDate(event.target.value)}
              className="w-40"
            />
          </div>
          <Button
            variant="gold"
            onClick={ship}
            disabled={busy || selected.size === 0 || mixedCustomers}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Truck className="size-4" aria-hidden />
            )}
            Ship {selected.size} line{selected.size === 1 ? "" : "s"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {mixedCustomers ? (
          <p className="px-6 pb-2 text-sm text-destructive">
            One shipment goes to one customer — deselect the other customer&apos;s
            lines.
          </p>
        ) : null}
        {byCustomer.map(([customerId, customerLines]) => (
          <div key={customerId} className="mb-4">
            <div className="px-6 pb-1 text-sm font-medium">
              {customerLines[0].customerName}
              {customerLines[0].deliveryLocation ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {customerLines[0].deliveryLocation}
                </span>
              ) : null}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Product</TableHead>
                  <TableHead>SO / PO</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead>Allocation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerLines.map((line) => (
                  <TableRow
                    key={line.id}
                    className={cn(selected.has(line.id) && "bg-accent/40")}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${line.productCode} for ${line.customerName}`}
                        checked={selected.has(line.id)}
                        onChange={() =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (next.has(line.id)) next.delete(line.id);
                            else next.add(line.id);
                            return next;
                          })
                        }
                        className="size-4 accent-[var(--gold)]"
                      />
                    </TableCell>
                    <TableCell className="max-w-[18rem]">
                      <div className="truncate">{line.productName}</div>
                      <div className="text-xs text-muted-foreground">
                        {line.productCode}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {line.soNumber ?? "-"}
                      {line.poNumber ? (
                        <div className="text-xs text-muted-foreground">
                          {line.poNumber}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {formatNumber(line.quantity)} {line.unit}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {line.itemCount > 0 ? line.itemCount : "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {line.allocationNumber}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
