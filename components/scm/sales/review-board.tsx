"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Switch } from "@/components/ui/switch";
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
import { ChannelBadge } from "@/components/scm/channel-filter";
import { SALES_DECISION_LABELS, SALES_DECISIONS } from "@/lib/scm/domain";
import { formatNumber } from "@/lib/format";

/**
 * §4.1 / §4.2 — the sales decision. A shortfall records which customer takes
 * the cut, by how much, why, and whether they accepted; an over-delivery
 * either goes to a customer or into stock via the allocation screen.
 */

export interface SalesReviewRow {
  id: string;
  channelCode: string | null;
  channelName: string | null;
  soNumber: string;
  soId: string;
  customerName: string;
  poNumber: string | null;
  poId: string | null;
  supplierName: string | null;
  productCode: string;
  productName: string;
  unit: string;
  soQuantity: number;
  originalQuantity: number;
  confirmedQuantity: number;
  diff: number;
  diffPct: number;
  diffStatus: string;
  status: string;
  decision: string | null;
  reason: string | null;
  customerAccepted: boolean | null;
  newSoQuantity: number | null;
  reviewedByName: string | null;
}

export function SalesReviewBoard({
  rows,
  canDecide,
}: {
  rows: SalesReviewRow[];
  canDecide: boolean;
}) {
  const [openId, setOpenId] = React.useState<string | null>(null);

  return (
    <Card>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead>Customer / SO</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">SO qty</TableHead>
                <TableHead className="text-right">PO/Invoice qty</TableHead>
                <TableHead className="text-right">Difference</TableHead>
                <TableHead className="text-right">Diff %</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <React.Fragment key={row.id}>
                  <TableRow>
                    <TableCell>
                      <ChannelBadge code={row.channelCode} name={row.channelName} />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/scm/trace/so/${row.soId}`}
                        className="font-medium hover:text-gold-deep hover:underline"
                      >
                        {row.soNumber}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {row.customerName}
                        {row.poNumber ? ` · ${row.poNumber}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[16rem]">
                      <div className="truncate">{row.productName}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.productCode}
                      </div>
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {formatNumber(row.soQuantity)} {row.unit}
                      {row.originalQuantity !== row.soQuantity ? (
                        <div className="text-xs text-muted-foreground line-through">
                          {formatNumber(row.originalQuantity)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="tnum text-right font-medium">
                      {formatNumber(row.confirmedQuantity)} {row.unit}
                    </TableCell>
                    <TableCell
                      className={
                        row.diff < 0
                          ? "tnum text-right text-destructive"
                          : row.diff > 0
                            ? "tnum text-right text-warning"
                            : "tnum text-right"
                      }
                    >
                      {row.diff > 0 ? "+" : ""}
                      {formatNumber(row.diff)}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {row.diffPct > 0 ? "+" : ""}
                      {formatNumber(row.diffPct, 1)}%
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.decision
                        ? (SALES_DECISION_LABELS[
                            row.decision as keyof typeof SALES_DECISION_LABELS
                          ] ?? row.decision)
                        : "-"}
                      {row.customerAccepted != null ? (
                        <div className="text-xs text-muted-foreground">
                          customer{" "}
                          {row.customerAccepted ? "accepted" : "did not accept"}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <ToneBadge tone={documentTone(row.status)}>
                        {humanize(row.status)}
                      </ToneBadge>
                    </TableCell>
                    <TableCell>
                      {row.status === "completed" ? (
                        <span className="text-xs text-muted-foreground">
                          {row.reviewedByName ?? "done"}
                        </span>
                      ) : canDecide ? (
                        <Button
                          size="sm"
                          variant={openId === row.id ? "secondary" : "outline"}
                          onClick={() =>
                            setOpenId((current) =>
                              current === row.id ? null : row.id
                            )
                          }
                        >
                          {openId === row.id ? "Close" : "Decide"}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                  {openId === row.id ? (
                    <TableRow className="bg-accent/30 hover:bg-accent/30">
                      <TableCell colSpan={10} className="p-0">
                        <DecisionForm row={row} onDone={() => setOpenId(null)} />
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

function DecisionForm({
  row,
  onDone,
}: {
  row: SalesReviewRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const suggested =
    row.diffStatus === "short" ? "reduce_so" : row.diffStatus === "over" ? "warehouse_stock" : "keep_so";
  const [decision, setDecision] = React.useState<string>(row.decision ?? suggested);
  const [newQuantity, setNewQuantity] = React.useState(
    String(row.newSoQuantity ?? row.confirmedQuantity)
  );
  const [accepted, setAccepted] = React.useState(row.customerAccepted ?? false);
  const [reason, setReason] = React.useState(row.reason ?? "");
  const [busy, setBusy] = React.useState(false);

  const needsQuantity =
    decision === "reduce_so" || decision === "increase_customer";

  async function submit() {
    if (!reason.trim()) {
      toast.error("A reason is required.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/scm/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "so",
          id: row.id,
          decision,
          newSoQuantity: needsQuantity ? Number(newQuantity) : undefined,
          customerAccepted: accepted,
          reason: reason.trim(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? "The decision could not be saved.");
        return;
      }
      toast.success(
        payload.remainingReviews > 0
          ? `Saved — ${payload.remainingReviews} review(s) left on this PO.`
          : "Saved — every difference on this PO has been reviewed."
      );
      onDone();
      router.refresh();
    } catch {
      toast.error("The request failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 px-6 py-4">
      <p className="text-sm">
        {row.diffStatus === "short"
          ? `The supplier delivered ${formatNumber(Math.abs(row.diff))} ${row.unit} less than ${row.customerName} ordered. Record what was agreed with the customer.`
          : row.diffStatus === "over"
            ? `The supplier delivered ${formatNumber(row.diff)} ${row.unit} more than ordered. Give it to the customer, or put it into warehouse stock on the allocation screen.`
            : "Quantities match — confirm to close the review."}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor={`decision-${row.id}`}>Decision</Label>
          <Select value={decision} onValueChange={setDecision}>
            <SelectTrigger id={`decision-${row.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SALES_DECISIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {SALES_DECISION_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {needsQuantity ? (
          <div className="space-y-1.5">
            <Label htmlFor={`qty-${row.id}`}>New SO quantity ({row.unit})</Label>
            <Input
              id={`qty-${row.id}`}
              type="number"
              min={0}
              step="0.001"
              value={newQuantity}
              onChange={(event) => setNewQuantity(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Available: {formatNumber(row.confirmedQuantity)} {row.unit}
            </p>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor={`accepted-${row.id}`}>Customer accepted</Label>
          <div className="flex h-9 items-center gap-2">
            <Switch
              id={`accepted-${row.id}`}
              checked={accepted}
              onCheckedChange={setAccepted}
            />
            <span className="text-sm text-muted-foreground">
              {accepted ? "Yes" : "Not yet"}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`reason-${row.id}`}>Reason (required)</Label>
          <Textarea
            id={`reason-${row.id}`}
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What was agreed, and with whom"
          />
        </div>
      </div>

      <Button variant="gold" onClick={submit} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Save the decision
      </Button>
    </div>
  );
}
