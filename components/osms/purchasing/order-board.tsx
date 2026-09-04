"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { StatusBadge } from "@/components/osms/status-badge";
import { ChannelBadge } from "@/components/osms/channel-filter";
import {
  ORDER_ADJUSTMENT_LABELS,
  ORDER_ADJUSTMENT_REASONS,
} from "@/lib/osms/domain";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The order board (§2). Selecting demand lines builds one PO line per
 * product; ordering more than the demand is allowed but the reason field
 * becomes mandatory and the difference is shown while you type.
 */

export interface BoardRow {
  kind: "pr" | "so";
  lineId: string;
  documentNumber: string;
  channelId: string | null;
  channelCode: string | null;
  channelName: string | null;
  productId: string;
  productCode: string;
  productName: string;
  productNameTh: string | null;
  requiredQuantity: number;
  orderedQuantity: number;
  outstandingQuantity: number;
  unit: string;
  purchaseUnit: string | null;
  moq: number | null;
  deliveryDate: string;
  requester: string | null;
  customerName: string | null;
  soNumber: string | null;
  prNumber: string | null;
  supplierId: string | null;
  supplierName: string | null;
  status: string;
}

interface SupplierOption {
  id: string;
  code: string;
  name: string;
  currency: string;
  defaultUnit: string;
  moq: number | null;
}

interface DraftLine {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  required: number;
  quantity: string;
  unitPrice: string;
  deliveryDate: string;
  moq: number | null;
  reason: string;
  note: string;
  prLineIds: string[];
  soLineIds: string[];
}

export function OrderBoard({
  rows,
  suppliers,
  canCreate,
}: {
  rows: BoardRow[];
  suppliers: SupplierOption[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [supplierFilter, setSupplierFilter] = React.useState("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [supplierId, setSupplierId] = React.useState<string>(
    suppliers[0]?.id ?? ""
  );
  const [draft, setDraft] = React.useState<DraftLine[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notes, setNotes] = React.useState("");

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (
        supplierFilter !== "all" &&
        row.supplierId !== supplierFilter
      ) {
        return false;
      }
      if (!needle) return true;
      return [
        row.documentNumber,
        row.productCode,
        row.productName,
        row.productNameTh,
        row.soNumber,
        row.prNumber,
        row.customerName,
        row.requester,
        row.channelCode,
        row.channelName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [rows, search, supplierFilter]);

  function toggle(lineId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) =>
      current.size === filtered.length
        ? new Set()
        : new Set(filtered.map((row) => row.lineId))
    );
  }

  /** One PO line per product: demand for the same product is aggregated. */
  function buildDraft() {
    const picked = rows.filter((row) => selected.has(row.lineId));
    if (picked.length === 0) {
      toast.error("Select at least one demand line.");
      return;
    }
    const byProduct = new Map<string, DraftLine>();
    for (const row of picked) {
      const existing = byProduct.get(row.productId);
      if (existing) {
        existing.required += row.outstandingQuantity;
        existing.quantity = String(round(existing.required));
        if (row.kind === "pr") existing.prLineIds.push(row.lineId);
        else existing.soLineIds.push(row.lineId);
        if (row.deliveryDate < existing.deliveryDate) {
          existing.deliveryDate = row.deliveryDate;
        }
        continue;
      }
      const supplier = suppliers.find((entry) => entry.id === supplierId);
      const moq = row.moq ?? supplier?.moq ?? null;
      // Start at the demand, lifted to the MOQ when there is one — that is
      // the case the "reason for additional quantity" rule exists for.
      const start = moq ? Math.max(row.outstandingQuantity, moq) : row.outstandingQuantity;
      byProduct.set(row.productId, {
        productId: row.productId,
        productCode: row.productCode,
        productName: row.productName,
        unit: row.purchaseUnit ?? row.unit,
        required: row.outstandingQuantity,
        quantity: String(round(start)),
        unitPrice: "0",
        deliveryDate: row.deliveryDate.slice(0, 10),
        moq,
        reason: start > row.outstandingQuantity && moq ? "MOQ" : "",
        note: "",
        prLineIds: row.kind === "pr" ? [row.lineId] : [],
        soLineIds: row.kind === "so" ? [row.lineId] : [],
      });
    }
    setDraft([...byProduct.values()]);
  }

  function updateDraft(index: number, patch: Partial<DraftLine>) {
    setDraft((current) =>
      current
        ? current.map((line, position) =>
            position === index ? { ...line, ...patch } : line
          )
        : current
    );
  }

  async function submit() {
    if (!draft || !supplierId) return;
    const supplier = suppliers.find((entry) => entry.id === supplierId);
    const invalid = draft.find(
      (line) =>
        Number(line.quantity) > line.required && line.required > 0 && !line.reason
    );
    if (invalid) {
      toast.error(
        `${invalid.productCode}: ordering more than the demand needs a reason.`
      );
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/osms/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          currency: supplier?.currency ?? "EUR",
          notes: notes || undefined,
          lines: draft.map((line) => ({
            productId: line.productId,
            prLineIds: line.prLineIds,
            soLineIds: line.soLineIds,
            quantity: Number(line.quantity),
            unit: line.unit,
            unitPrice: Number(line.unitPrice) || 0,
            deliveryDate: line.deliveryDate,
            moq: line.moq,
            adjustmentReason: line.reason || null,
            adjustmentNote: line.note || null,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? "The purchase order could not be created.");
        return;
      }
      toast.success(`${payload.poNumber} issued with ${payload.lineCount} line(s).`);
      setDraft(null);
      setSelected(new Set());
      setNotes("");
      router.refresh();
    } catch {
      toast.error("The request failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search PR, SO, product, customer…"
            className="pl-9"
            aria-label="Search the demand board"
          />
        </div>
        <div className="w-56">
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger aria-label="Filter by default supplier">
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
        {canCreate ? (
          <Button onClick={buildDraft} disabled={selected.size === 0}>
            Plan a purchase order ({selected.size})
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select every line"
                      checked={
                        filtered.length > 0 && selected.size === filtered.length
                      }
                      onChange={toggleAll}
                      className="size-4 accent-[var(--gold)]"
                    />
                  </TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Required</TableHead>
                  <TableHead className="text-right">On PO</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">MOQ</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow
                    key={row.lineId}
                    className={cn(selected.has(row.lineId) && "bg-accent/40")}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.documentNumber} ${row.productCode}`}
                        checked={selected.has(row.lineId)}
                        onChange={() => toggle(row.lineId)}
                        className="size-4 accent-[var(--gold)]"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{row.documentNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.kind === "pr" ? "Purchase request" : "Sales order"}
                        {row.requester ? ` · ${row.requester}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ChannelBadge code={row.channelCode} name={row.channelName} />
                    </TableCell>
                    <TableCell className="max-w-[18rem]">
                      <div className="truncate">{row.productName}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.productCode}
                        {row.productNameTh ? ` · ${row.productNameTh}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.customerName ?? "-"}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {formatNumber(row.requiredQuantity)} {row.unit}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {formatNumber(row.orderedQuantity)}
                    </TableCell>
                    <TableCell className="tnum text-right font-medium text-warning">
                      {formatNumber(row.outstandingQuantity)}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {row.moq ? formatNumber(row.moq) : "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(new Date(row.deliveryDate))}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {draft ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New purchase order</CardTitle>
            <p className="text-sm text-muted-foreground">
              Ordering more than the demand requires a reason — it is stored on
              the line, the audit trail and the supplier summary.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="po-supplier">Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger id="po-supplier">
                    <SelectValue placeholder="Choose a supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.code} · {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="po-notes">Remark</Label>
                <Input
                  id="po-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional note for this order"
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Required</TableHead>
                    <TableHead className="w-28">Order qty</TableHead>
                    <TableHead className="w-24">Unit</TableHead>
                    <TableHead className="w-28">Unit price</TableHead>
                    <TableHead className="w-36">Delivery</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead className="w-48">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draft.map((line, index) => {
                    const quantity = Number(line.quantity) || 0;
                    const difference = round(quantity - line.required);
                    const needsReason = difference > 0 && line.required > 0;
                    return (
                      <TableRow key={line.productId}>
                        <TableCell className="max-w-[16rem]">
                          <div className="truncate">{line.productName}</div>
                          <div className="text-xs text-muted-foreground">
                            {line.productCode}
                            {line.moq ? ` · MOQ ${formatNumber(line.moq)}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="tnum text-right">
                          {formatNumber(line.required)}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.quantity}
                            onChange={(event) =>
                              updateDraft(index, { quantity: event.target.value })
                            }
                            aria-label={`Order quantity for ${line.productCode}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.unit}
                            onChange={(event) =>
                              updateDraft(index, { unit: event.target.value })
                            }
                            aria-label={`Purchase unit for ${line.productCode}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(event) =>
                              updateDraft(index, { unitPrice: event.target.value })
                            }
                            aria-label={`Unit price for ${line.productCode}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={line.deliveryDate}
                            onChange={(event) =>
                              updateDraft(index, {
                                deliveryDate: event.target.value,
                              })
                            }
                            aria-label={`Delivery date for ${line.productCode}`}
                          />
                        </TableCell>
                        <TableCell
                          className={cn(
                            "tnum text-right",
                            difference > 0 && "text-warning",
                            difference < 0 && "text-destructive"
                          )}
                        >
                          {difference > 0 ? "+" : ""}
                          {formatNumber(difference)}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={line.reason || "none"}
                            onValueChange={(value) =>
                              updateDraft(index, {
                                reason: value === "none" ? "" : value,
                              })
                            }
                          >
                            <SelectTrigger
                              aria-label={`Reason for ${line.productCode}`}
                              className={cn(
                                needsReason && !line.reason && "border-destructive"
                              )}
                            >
                              <SelectValue placeholder="Reason" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No adjustment</SelectItem>
                              {ORDER_ADJUSTMENT_REASONS.map((reason) => (
                                <SelectItem key={reason} value={reason}>
                                  {ORDER_ADJUSTMENT_LABELS[reason]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {needsReason && !line.reason ? (
                            <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                              <TriangleAlert className="size-3" aria-hidden />
                              Required
                            </p>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex gap-2">
              <Button variant="gold" onClick={submit} disabled={busy || !supplierId}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Issue the purchase order
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
