"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
import { ToneBadge } from "@/components/osms/status-badge";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Flow §7 — sales places each weighed piece with a customer.
 *
 * The guard here is the same arithmetic the API enforces: every piece placed,
 * and the weight each customer ends up with lands on what they were allocated
 * (within 0.05). "Suggest a split" is a starting point, never an answer — the
 * button fills the boxes and a person still confirms them.
 */

export interface PickItem {
  id: string;
  itemNo: string;
  weight: number;
  unit: string;
  condition: string;
  allocationLineId: string | null;
}

export interface PickCustomer {
  id: string;
  name: string;
  channelCode: string | null;
  soNumber: string | null;
  allocated: number;
}

export interface PickLine {
  id: string;
  receiptNumber: string;
  receivedDate: string;
  poNumber: string;
  productCode: string;
  productName: string;
  unit: string;
  actualQuantity: number;
  pickStatus: string;
  pickedByName: string | null;
  weighedTotal: number;
  items: PickItem[];
  customers: PickCustomer[];
}

const TOLERANCE = 0.05;

export function ItemPickBoard({
  lines,
  canPick,
}: {
  lines: PickLine[];
  canPick: boolean;
}) {
  return (
    <div className="space-y-4">
      {lines.map((line) => (
        <PickCard key={line.id} line={line} canPick={canPick} />
      ))}
    </div>
  );
}

function PickCard({ line, canPick }: { line: PickLine; canPick: boolean }) {
  const router = useRouter();
  const [picks, setPicks] = React.useState<Record<string, string | null>>(() =>
    Object.fromEntries(line.items.map((item) => [item.id, item.allocationLineId]))
  );
  const [remark, setRemark] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const done = line.pickStatus === "picked";

  const assigned = new Map<string, number>();
  for (const item of line.items) {
    const target = picks[item.id];
    if (!target) continue;
    assigned.set(target, round((assigned.get(target) ?? 0) + item.weight));
  }
  const unplaced = line.items.filter((item) => !picks[item.id]);
  const offTarget = line.customers.filter(
    (customer) =>
      Math.abs((assigned.get(customer.id) ?? 0) - customer.allocated) > TOLERANCE
  );
  const balanced = unplaced.length === 0 && offTarget.length === 0;

  /**
   * Fill the boxes: heaviest piece to the customer furthest from their target.
   * It is a suggestion — sales overrides it freely, and nothing is saved until
   * they press Confirm.
   */
  function suggest() {
    const remaining = new Map(
      line.customers.map((customer) => [customer.id, customer.allocated])
    );
    const next: Record<string, string | null> = {};
    const heaviestFirst = [...line.items].sort((a, b) => b.weight - a.weight);
    for (const item of heaviestFirst) {
      let best: string | null = null;
      let bestGap = -Infinity;
      for (const [customerId, left] of remaining) {
        if (left > bestGap) {
          bestGap = left;
          best = customerId;
        }
      }
      next[item.id] = best;
      if (best) remaining.set(best, round((remaining.get(best) ?? 0) - item.weight));
    }
    setPicks(next);
  }

  async function submit() {
    setBusy(true);
    try {
      const response = await fetch("/api/osms/item-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receivingLineId: line.id,
          assignments: line.items.map((item) => ({
            itemId: item.id,
            allocationLineId: picks[item.id] ?? null,
          })),
          remark: remark || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? "The pick could not be saved.");
        return;
      }
      toast.success(
        `${payload.assigned} pieces placed — the warehouse can pack ${line.receiptNumber}.`
      );
      router.refresh();
    } catch {
      toast.error("The pick could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-medium">
              {line.productName}{" "}
              <span className="text-sm text-muted-foreground">
                {line.productCode}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {line.receiptNumber} · {line.poNumber} · received{" "}
              {line.receivedDate} · {line.items.length} pieces weighing{" "}
              {formatNumber(line.weighedTotal, 3)} {line.unit}
            </div>
          </div>
          <ToneBadge tone={done ? "done" : "pending"}>
            {done
              ? `Picked by ${line.pickedByName ?? "sales"}`
              : "Waiting for sales"}
          </ToneBadge>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Piece</TableHead>
                  <TableHead className="w-28 text-right">Weight</TableHead>
                  <TableHead className="w-28">Condition</TableHead>
                  <TableHead>Goes to</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {line.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.itemNo}</TableCell>
                    <TableCell className="tnum text-right">
                      {formatNumber(item.weight, 3)} {item.unit}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-xs",
                        item.condition !== "good" && "text-warning"
                      )}
                    >
                      {item.condition}
                    </TableCell>
                    <TableCell>
                      {done ? (
                        <span className="text-sm">
                          {line.customers.find(
                            (customer) => customer.id === picks[item.id]
                          )?.name ?? "unassigned"}
                        </span>
                      ) : (
                        <Select
                          value={picks[item.id] ?? "none"}
                          onValueChange={(value) =>
                            setPicks((current) => ({
                              ...current,
                              [item.id]: value === "none" ? null : value,
                            }))
                          }
                          disabled={!canPick}
                        >
                          <SelectTrigger
                            aria-label={`Customer for ${item.itemNo}`}
                            className={cn(!picks[item.id] && "border-warning")}
                          >
                            <SelectValue placeholder="Choose a customer" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not placed yet</SelectItem>
                            {line.customers.map((customer) => (
                              <SelectItem key={customer.id} value={customer.id}>
                                {customer.name}
                                {customer.soNumber ? ` · ${customer.soNumber}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3">
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead className="text-right">By weight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {line.customers.map((customer) => {
                    const value = assigned.get(customer.id) ?? 0;
                    const ok =
                      Math.abs(value - customer.allocated) <= TOLERANCE;
                    return (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <div className="text-sm">{customer.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {customer.channelCode ?? "—"}
                            {customer.soNumber ? ` · ${customer.soNumber}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="tnum text-right">
                          {formatNumber(customer.allocated, 3)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "tnum text-right",
                            ok ? "text-success" : "text-warning"
                          )}
                        >
                          {formatNumber(value, 3)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {!done ? (
              <>
                <p
                  className={cn(
                    "text-sm",
                    balanced ? "text-success" : "text-warning"
                  )}
                >
                  {unplaced.length > 0
                    ? `${unplaced.length} piece${unplaced.length === 1 ? "" : "s"} still to place.`
                    : offTarget.length > 0
                      ? `${offTarget[0].name} is off their allocated weight.`
                      : "Every piece placed and every customer on target."}
                </p>
                <Textarea
                  value={remark}
                  onChange={(event) => setRemark(event.target.value)}
                  placeholder="Why this split (optional) — kept on the audit trail"
                  rows={2}
                  disabled={!canPick}
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={suggest} disabled={!canPick}>
                    <Wand2 className="size-4" aria-hidden />
                    Suggest a split
                  </Button>
                  <Button onClick={submit} disabled={!canPick || !balanced || busy}>
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : null}
                    Confirm the pick
                  </Button>
                </div>
                {!canPick ? (
                  <p className="text-xs text-muted-foreground">
                    Only sales may place pieces. The warehouse packs what is
                    chosen here.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
