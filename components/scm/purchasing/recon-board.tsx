"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToneBadge, documentTone, humanize } from "@/components/scm/status-badge";
import {
  PRICE_VARIANCE_LABELS,
  PRICE_VARIANCE_REASONS,
  QUANTITY_VARIANCE_LABELS,
  QUANTITY_VARIANCE_REASONS,
} from "@/lib/scm/domain";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * §3.1 / §3.2 — the reconciliation queue. Confirming a line with a
 * difference is impossible without a reason: the button stays disabled and
 * the API refuses it too.
 */

export interface ReconRow {
  id: string;
  poId: string;
  poNumber: string;
  supplierName: string;
  invoiceNumber: string | null;
  productCode: string;
  productName: string;
  unit: string;
  poQuantity: number;
  invoiceQuantity: number | null;
  qtyDiff: number | null;
  qtyDiffPct: number | null;
  poUnitPrice: number;
  invoiceUnitPrice: number | null;
  priceDiff: number | null;
  priceDiffPct: number | null;
  qtyStatus: string;
  priceStatus: string;
  status: string;
  correctedQuantity: number | null;
  quantityReason: string | null;
  priceReason: string | null;
  remark: string | null;
  reviewedByName: string | null;
  currency: string;
}

export function ReconBoard({
  rows,
  canApprove,
}: {
  rows: ReconRow[];
  canApprove: boolean;
}) {
  const [openId, setOpenId] = React.useState<string | null>(null);

  return (
    <Card>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO / Invoice</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">PO qty</TableHead>
                <TableHead className="text-right">Invoice qty</TableHead>
                <TableHead className="text-right">Qty diff</TableHead>
                <TableHead className="text-right">Qty diff %</TableHead>
                <TableHead className="text-right">PO price</TableHead>
                <TableHead className="text-right">Invoice price</TableHead>
                <TableHead className="text-right">Price diff</TableHead>
                <TableHead className="text-right">Price diff %</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <React.Fragment key={row.id}>
                  <TableRow>
                    <TableCell>
                      <Link
                        href={`/scm/trace/po/${row.poId}`}
                        className="font-medium hover:text-gold-deep hover:underline"
                      >
                        {row.poNumber}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {row.invoiceNumber ?? "no invoice"} · {row.supplierName}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[15rem]">
                      <div className="truncate">{row.productName}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.productCode}
                      </div>
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {formatNumber(row.poQuantity)}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {row.invoiceQuantity == null
                        ? "-"
                        : formatNumber(row.invoiceQuantity)}
                    </TableCell>
                    <TableCell className={diffClass(row.qtyDiff)}>
                      {signed(row.qtyDiff)}
                    </TableCell>
                    <TableCell className={diffClass(row.qtyDiffPct)}>
                      {row.qtyDiffPct == null
                        ? "-"
                        : `${row.qtyDiffPct > 0 ? "+" : ""}${formatNumber(row.qtyDiffPct, 1)}%`}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {formatNumber(row.poUnitPrice, 2)}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {row.invoiceUnitPrice == null
                        ? "-"
                        : formatNumber(row.invoiceUnitPrice, 2)}
                    </TableCell>
                    <TableCell className={diffClass(row.priceDiff)}>
                      {signed(row.priceDiff, 2)}
                    </TableCell>
                    <TableCell className={diffClass(row.priceDiffPct)}>
                      {row.priceDiffPct == null
                        ? "-"
                        : `${row.priceDiffPct > 0 ? "+" : ""}${formatNumber(row.priceDiffPct, 1)}%`}
                    </TableCell>
                    <TableCell>
                      <ToneBadge tone={documentTone(row.status)}>
                        {humanize(row.status)}
                      </ToneBadge>
                      {row.correctedQuantity != null ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          confirmed {formatNumber(row.correctedQuantity)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {row.status === "approved" ? (
                        <span className="text-xs text-muted-foreground">
                          {row.reviewedByName ?? "approved"}
                        </span>
                      ) : canApprove ? (
                        <Button
                          size="sm"
                          variant={openId === row.id ? "secondary" : "outline"}
                          onClick={() =>
                            setOpenId((current) =>
                              current === row.id ? null : row.id
                            )
                          }
                        >
                          {openId === row.id ? "Close" : "Review"}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                  {openId === row.id ? (
                    <TableRow className="bg-accent/30 hover:bg-accent/30">
                      <TableCell colSpan={12} className="p-0">
                        <ReviewForm row={row} onDone={() => setOpenId(null)} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewForm({ row, onDone }: { row: ReconRow; onDone: () => void }) {
  const router = useRouter();
  const [corrected, setCorrected] = React.useState(
    String(row.correctedQuantity ?? row.invoiceQuantity ?? row.poQuantity)
  );
  const [quantityReason, setQuantityReason] = React.useState(
    row.quantityReason ?? ""
  );
  const [priceReason, setPriceReason] = React.useState(row.priceReason ?? "");
  const [remark, setRemark] = React.useState(row.remark ?? "");
  const [busy, setBusy] = React.useState<string | null>(null);

  const quantityDiffers = row.qtyStatus !== "match";
  const priceDiffers = row.priceStatus === "higher" || row.priceStatus === "lower";
  const blocked =
    (quantityDiffers && !quantityReason) || (priceDiffers && !priceReason);

  async function submit(action: "approve" | "reject" | "hold") {
    setBusy(action);
    try {
      const response = await fetch("/api/scm/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "po_invoice",
          id: row.id,
          action,
          correctedQuantity: Number(corrected),
          quantityReason: quantityReason || null,
          priceReason: priceReason || null,
          remark: remark || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? "The decision could not be saved.");
        return;
      }
      if (action === "approve") {
        toast.success(
          `Confirmed at ${payload.correctedQuantity}${
            payload.salesReviewsCreated
              ? ` — ${payload.salesReviewsCreated} sales review(s) created.`
              : "."
          }`
        );
      } else {
        toast.success(`Line ${action === "reject" ? "rejected" : "held"}.`);
      }
      onDone();
      router.refresh();
    } catch {
      toast.error("The request failed — try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 px-6 py-4">
      <p className="text-sm">
        Confirm the quantity that actually arrived. From here on, the corrected
        quantity — not the ordered quantity — drives the sales review,
        allocation and receiving.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor={`corrected-${row.id}`}>
            Corrected quantity ({row.unit})
          </Label>
          <Input
            id={`corrected-${row.id}`}
            type="number"
            min={0}
            step="0.001"
            value={corrected}
            onChange={(event) => setCorrected(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`qty-reason-${row.id}`}>
            Quantity reason {quantityDiffers ? "(required)" : ""}
          </Label>
          <Select
            value={quantityReason || "none"}
            onValueChange={(value) =>
              setQuantityReason(value === "none" ? "" : value)
            }
          >
            <SelectTrigger
              id={`qty-reason-${row.id}`}
              className={cn(quantityDiffers && !quantityReason && "border-destructive")}
            >
              <SelectValue placeholder="Reason" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No reason</SelectItem>
              {QUANTITY_VARIANCE_REASONS.map((reason) => (
                <SelectItem key={reason} value={reason}>
                  {QUANTITY_VARIANCE_LABELS[reason]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`price-reason-${row.id}`}>
            Price reason {priceDiffers ? "(required)" : ""}
          </Label>
          <Select
            value={priceReason || "none"}
            onValueChange={(value) => setPriceReason(value === "none" ? "" : value)}
          >
            <SelectTrigger
              id={`price-reason-${row.id}`}
              className={cn(priceDiffers && !priceReason && "border-destructive")}
            >
              <SelectValue placeholder="Reason" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No reason</SelectItem>
              {PRICE_VARIANCE_REASONS.map((reason) => (
                <SelectItem key={reason} value={reason}>
                  {PRICE_VARIANCE_LABELS[reason]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`remark-${row.id}`}>Remark</Label>
          <Textarea
            id={`remark-${row.id}`}
            rows={2}
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
            placeholder="Optional note"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="gold"
          onClick={() => submit("approve")}
          disabled={busy !== null || blocked}
        >
          {busy === "approve" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          Confirm the corrected quantity
        </Button>
        <Button
          variant="outline"
          onClick={() => submit("hold")}
          disabled={busy !== null}
        >
          Keep under review
        </Button>
        <Button
          variant="destructive"
          onClick={() => submit("reject")}
          disabled={busy !== null}
        >
          Reject
        </Button>
      </div>
      {blocked ? (
        <p className="text-xs text-destructive">
          A difference was found — pick a reason before confirming.
        </p>
      ) : null}
    </div>
  );
}

function signed(value: number | null, decimals = 1): string {
  if (value == null) return "-";
  return `${value > 0 ? "+" : ""}${formatNumber(value, decimals)}`;
}

function diffClass(value: number | null): string {
  if (value == null || value === 0) return "tnum text-right";
  return value > 0 ? "tnum text-right text-warning" : "tnum text-right text-destructive";
}
