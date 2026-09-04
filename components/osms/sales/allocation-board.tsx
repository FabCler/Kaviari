"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToneBadge, documentTone, humanize } from "@/components/osms/status-badge";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * §6 — the allocation editor. The running total is always on screen: the
 * "Complete" button only unlocks when UNALLOCATED reaches zero, which is the
 * same rule the receiving gate enforces server-side.
 */

interface DemandInfo {
  soLineId: string;
  soNumber: string;
  customerId: string;
  customerName: string;
  channelCode: string | null;
  quantity: number;
}

interface AllocationLineState {
  key: string;
  target: "customer" | "warehouse";
  customerId: string | null;
  soLineId: string | null;
  quantity: string;
  storageLocation: string;
  reason: string;
  responsibleDept: string;
}

export interface AllocationRow {
  poLineId: string;
  poId: string;
  poNumber: string;
  supplierName: string;
  productCode: string;
  productName: string;
  unit: string;
  weightControlled: boolean;
  orderedQuantity: number;
  actualQuantity: number;
  openSalesReviews: number;
  openShortage: { id: string; caseNumber: string } | null;
  demands: DemandInfo[];
  allocation: {
    id: string;
    allocationNumber: string;
    status: string;
    unallocatedQuantity: number;
    lines: {
      target: "customer" | "warehouse";
      customerId: string | null;
      soLineId: string | null;
      quantity: number;
      storageLocation: string | null;
      reason: string | null;
      responsibleDept: string | null;
    }[];
  } | null;
}

export function AllocationBoard({
  rows,
  customers,
  defaultStorageLocation,
  canAllocate,
}: {
  rows: AllocationRow[];
  customers: { id: string; code: string; name: string }[];
  defaultStorageLocation: string;
  canAllocate: boolean;
}) {
  const [openId, setOpenId] = React.useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Actual received</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="text-right">Unallocated</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const allocated = (row.allocation?.lines ?? []).reduce(
                    (sum, line) => sum + line.quantity,
                    0
                  );
                  const unallocated =
                    row.allocation?.unallocatedQuantity ?? row.actualQuantity;
                  return (
                    <React.Fragment key={row.poLineId}>
                      <TableRow>
                        <TableCell>
                          <Link
                            href={`/osms/trace/po/${row.poId}`}
                            className="font-medium hover:text-gold-deep hover:underline"
                          >
                            {row.poNumber}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {row.supplierName}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[16rem]">
                          <div className="truncate">{row.productName}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.productCode}
                            {row.weightControlled ? " · weighed per piece" : ""}
                          </div>
                        </TableCell>
                        <TableCell className="tnum text-right">
                          {formatNumber(row.orderedQuantity)} {row.unit}
                        </TableCell>
                        <TableCell className="tnum text-right font-medium">
                          {formatNumber(row.actualQuantity)} {row.unit}
                        </TableCell>
                        <TableCell className="tnum text-right">
                          {formatNumber(allocated)}
                        </TableCell>
                        <TableCell
                          className={
                            unallocated > 0
                              ? "tnum text-right font-medium text-destructive"
                              : "tnum text-right text-success"
                          }
                        >
                          {formatNumber(unallocated)}
                        </TableCell>
                        <TableCell>
                          <ToneBadge
                            tone={documentTone(row.allocation?.status ?? "draft")}
                          >
                            {row.allocation
                              ? humanize(row.allocation.status)
                              : "Not started"}
                          </ToneBadge>
                          {row.openShortage ? (
                            <Link
                              href={`/osms/sales/shortage/${row.openShortage.id}`}
                              className="mt-0.5 flex items-center gap-1 text-xs text-destructive hover:underline"
                            >
                              <TriangleAlert className="size-3" aria-hidden />
                              {row.openShortage.caseNumber} awaiting approval
                            </Link>
                          ) : row.openSalesReviews > 0 ? (
                            <div className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
                              <TriangleAlert className="size-3" aria-hidden />
                              {row.openSalesReviews} sales review(s) open
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {canAllocate ? (
                            <Button
                              size="sm"
                              variant={openId === row.poLineId ? "secondary" : "outline"}
                              onClick={() =>
                                setOpenId((current) =>
                                  current === row.poLineId ? null : row.poLineId
                                )
                              }
                              disabled={
                                row.openSalesReviews > 0 || row.openShortage != null
                              }
                            >
                              {openId === row.poLineId ? "Close" : "Allocate"}
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                      {openId === row.poLineId ? (
                        <TableRow className="bg-accent/30 hover:bg-accent/30">
                          <TableCell colSpan={8} className="p-0">
                            <AllocationEditor
                              row={row}
                              customers={customers}
                              defaultStorageLocation={defaultStorageLocation}
                              onDone={() => setOpenId(null)}
                            />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AllocationEditor({
  row,
  customers,
  defaultStorageLocation,
  onDone,
}: {
  row: AllocationRow;
  customers: { id: string; code: string; name: string }[];
  defaultStorageLocation: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"save" | "complete" | null>(null);
  const [lines, setLines] = React.useState<AllocationLineState[]>(() => {
    if (row.allocation && row.allocation.lines.length > 0) {
      return row.allocation.lines.map((line, index) => ({
        key: `existing-${index}`,
        target: line.target,
        customerId: line.customerId,
        soLineId: line.soLineId,
        quantity: String(line.quantity),
        storageLocation: line.storageLocation ?? "",
        reason: line.reason ?? "",
        responsibleDept: line.responsibleDept ?? "",
      }));
    }
    // Open with the customer orders this line was bought for.
    return row.demands.map((demand, index) => ({
      key: `demand-${index}`,
      target: "customer" as const,
      customerId: demand.customerId,
      soLineId: demand.soLineId,
      quantity: String(demand.quantity),
      storageLocation: "",
      reason: "",
      responsibleDept: "",
    }));
  });

  const allocated = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0),
    0
  );
  const unallocated = round(row.actualQuantity - allocated);
  const balanced = Math.abs(unallocated) < 0.0001;

  function update(key: string, patch: Partial<AllocationLineState>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line))
    );
  }

  function addLine(target: "customer" | "warehouse") {
    setLines((current) => [
      ...current,
      {
        key: `new-${Date.now()}-${current.length}`,
        target,
        customerId: target === "customer" ? (customers[0]?.id ?? null) : null,
        soLineId: null,
        quantity: String(Math.max(0, unallocated)),
        storageLocation: target === "warehouse" ? defaultStorageLocation : "",
        reason: "",
        responsibleDept: target === "warehouse" ? "warehouse" : "",
      },
    ]);
  }

  async function submit(complete: boolean) {
    setBusy(complete ? "complete" : "save");
    try {
      const response = await fetch("/api/osms/allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poLineId: row.poLineId,
          complete,
          lines: lines.map((line) => ({
            target: line.target,
            customerId: line.target === "customer" ? line.customerId : null,
            soLineId: line.target === "customer" ? line.soLineId : null,
            quantity: Number(line.quantity),
            storageLocation: line.storageLocation || null,
            reason: line.reason || null,
            responsibleDept: line.responsibleDept || null,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? "The allocation could not be saved.");
        return;
      }
      toast.success(
        complete
          ? `${payload.allocationNumber} completed — the warehouse can receive.`
          : `${payload.allocationNumber} saved as draft.`
      );
      if (complete) onDone();
      router.refresh();
    } catch {
      toast.error("The request failed — try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 px-6 py-4">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span>
          Actual received:{" "}
          <span className="tnum font-medium">
            {formatNumber(row.actualQuantity)} {row.unit}
          </span>
        </span>
        <span>
          Allocated:{" "}
          <span className="tnum font-medium">{formatNumber(allocated)}</span>
        </span>
        <span
          className={cn(
            "rounded-md px-2 py-1 font-medium",
            balanced
              ? "bg-success/10 text-success"
              : "bg-destructive/10 text-destructive"
          )}
        >
          {balanced
            ? "Fully allocated"
            : `UNALLOCATED QUANTITY: ${formatNumber(unallocated)} ${row.unit}`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Target</TableHead>
              <TableHead className="w-64">Customer / SO</TableHead>
              <TableHead className="w-32">Quantity</TableHead>
              <TableHead className="w-44">Storage location</TableHead>
              <TableHead className="w-56">Reason</TableHead>
              <TableHead className="w-40">Responsible</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.key}>
                <TableCell>
                  <Select
                    value={line.target}
                    onValueChange={(value) =>
                      update(line.key, {
                        target: value as "customer" | "warehouse",
                        customerId:
                          value === "warehouse" ? null : (customers[0]?.id ?? null),
                        soLineId: value === "warehouse" ? null : line.soLineId,
                        storageLocation:
                          value === "warehouse"
                            ? line.storageLocation || defaultStorageLocation
                            : "",
                        responsibleDept:
                          value === "warehouse"
                            ? line.responsibleDept || "warehouse"
                            : "",
                      })
                    }
                  >
                    <SelectTrigger aria-label="Allocation target">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="warehouse">Warehouse stock</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {line.target === "customer" ? (
                    <Select
                      value={line.soLineId ?? line.customerId ?? ""}
                      onValueChange={(value) => {
                        const demand = row.demands.find(
                          (entry) => entry.soLineId === value
                        );
                        if (demand) {
                          update(line.key, {
                            soLineId: demand.soLineId,
                            customerId: demand.customerId,
                          });
                        } else {
                          update(line.key, { soLineId: null, customerId: value });
                        }
                      }}
                    >
                      <SelectTrigger aria-label="Customer">
                        <SelectValue placeholder="Choose" />
                      </SelectTrigger>
                      <SelectContent>
                        {row.demands.map((demand) => (
                          <SelectItem key={demand.soLineId} value={demand.soLineId}>
                            {demand.channelCode ? `${demand.channelCode} · ` : ""}
                            {demand.customerName} · {demand.soNumber}
                          </SelectItem>
                        ))}
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name} (no SO)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Leftover into stock
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step="0.001"
                    value={line.quantity}
                    onChange={(event) =>
                      update(line.key, { quantity: event.target.value })
                    }
                    aria-label="Allocated quantity"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={line.storageLocation}
                    disabled={line.target === "customer"}
                    onChange={(event) =>
                      update(line.key, { storageLocation: event.target.value })
                    }
                    placeholder={line.target === "warehouse" ? "Required" : "-"}
                    aria-label="Storage location"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={line.reason}
                    onChange={(event) =>
                      update(line.key, { reason: event.target.value })
                    }
                    placeholder={
                      line.target === "warehouse" ? "Required for stock" : "Optional"
                    }
                    aria-label="Reason"
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={line.responsibleDept || "none"}
                    onValueChange={(value) =>
                      update(line.key, {
                        responsibleDept: value === "none" ? "" : value,
                      })
                    }
                    disabled={line.target === "customer"}
                  >
                    <SelectTrigger aria-label="Responsible department">
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-</SelectItem>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="purchasing">Purchasing</SelectItem>
                      <SelectItem value="warehouse">Warehouse</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove this allocation line"
                    onClick={() =>
                      setLines((current) =>
                        current.filter((entry) => entry.key !== line.key)
                      )
                    }
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => addLine("customer")}>
          <Plus className="size-4" aria-hidden />
          Customer line
        </Button>
        <Button size="sm" variant="outline" onClick={() => addLine("warehouse")}>
          <Plus className="size-4" aria-hidden />
          Warehouse stock
        </Button>
        <Button
          variant="secondary"
          onClick={() => submit(false)}
          disabled={busy !== null}
        >
          {busy === "save" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          Save draft
        </Button>
        <Button
          variant="gold"
          onClick={() => submit(true)}
          disabled={busy !== null || !balanced}
        >
          {busy === "complete" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          Complete the allocation
        </Button>
      </div>

      {row.weightControlled ? (
        <p className="text-xs text-muted-foreground">
          This product is weighed piece by piece. Allocate the total weight
          here, then assign each individual item to its customer on the
          receiving screen.
        </p>
      ) : null}
    </div>
  );
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
