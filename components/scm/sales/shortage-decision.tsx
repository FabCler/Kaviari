"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChannelBadge } from "@/components/scm/channel-filter";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * §20 / §45 — the approval form.
 *
 * The proposal is offered behind a button rather than pre-filled, because a
 * form that opens with numbers already in it invites a reflex "approve". The
 * approver has to either accept the proposal deliberately or type their own,
 * and the total must land exactly on what arrived before Approve unlocks.
 */

interface DecisionLine {
  id: string;
  channelCode: string;
  channelName: string;
  customerName: string;
  soNumber: string;
  requestedQuantity: number;
  approvedQuantity: number | null;
  proposedQuantity: number;
  priority: number;
  reason: string | null;
}

export function ShortageDecision({
  caseId,
  caseNumber,
  unit,
  actualQuantity,
  lines,
  decided,
  canApprove,
  decisionNote,
  approvedByName,
  approvedAt,
}: {
  caseId: string;
  caseNumber: string;
  unit: string;
  actualQuantity: number;
  lines: DecisionLine[];
  decided: boolean;
  canApprove: boolean;
  decisionNote: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      lines.map((line) => [
        line.id,
        line.approvedQuantity != null ? String(line.approvedQuantity) : "",
      ])
    )
  );
  const [reasons, setReasons] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((line) => [line.id, line.reason ?? ""]))
  );
  const [note, setNote] = React.useState(decisionNote ?? "");
  const [busy, setBusy] = React.useState<"approve" | "reject" | null>(null);

  const assigned = lines.reduce(
    (sum, line) => sum + (Number(values[line.id]) || 0),
    0
  );
  const remaining = round(actualQuantity - assigned);
  const balanced = Math.abs(remaining) < 0.0001;
  const everyLineDecided = lines.every(
    (line) => values[line.id] !== "" && values[line.id] != null
  );
  const overPromised = lines.find(
    (line) => (Number(values[line.id]) || 0) > line.requestedQuantity + 0.0001
  );

  function applyProposal() {
    setValues(
      Object.fromEntries(
        lines.map((line) => [line.id, String(line.proposedQuantity)])
      )
    );
    toast.info(
      "Proposal filled in from the channel priorities — adjust it before approving."
    );
  }

  async function submit(action: "approve" | "reject") {
    if (action === "reject" && !note.trim()) {
      toast.error("Say why the split is rejected.");
      return;
    }
    setBusy(action);
    try {
      const response = await fetch("/api/scm/shortage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          action,
          decisionNote: note || undefined,
          lines: lines.map((line) => ({
            id: line.id,
            approvedQuantity: Number(values[line.id]) || 0,
            priority: line.priority,
            reason: reasons[line.id] || null,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? "The decision could not be saved.");
        return;
      }
      toast.success(
        action === "approve"
          ? `${caseNumber} approved — the customer orders have been updated.`
          : `${caseNumber} rejected.`
      );
      router.refresh();
    } catch {
      toast.error("The request failed — try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Allocation across channels</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Channels are listed in priority order. Approving writes these
            quantities to the customer orders and records who decided.
          </p>
        </div>
        {!decided && canApprove ? (
          <Button variant="outline" size="sm" onClick={applyProposal}>
            <Wand2 className="size-4" aria-hidden />
            Fill in the proposal
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 px-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Priority</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Customer / SO</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Proposed</TableHead>
                <TableHead className="w-32">Approved</TableHead>
                <TableHead className="text-right">Reduction</TableHead>
                <TableHead className="w-56">Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                const approved = Number(values[line.id]) || 0;
                const reduction = round(line.requestedQuantity - approved);
                const filled = values[line.id] !== "";
                return (
                  <TableRow key={line.id}>
                    <TableCell className="tnum">{line.priority}</TableCell>
                    <TableCell>
                      <ChannelBadge code={line.channelCode} name={line.channelName} />
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{line.customerName}</div>
                      <div className="text-xs text-muted-foreground">
                        {line.soNumber}
                      </div>
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {formatNumber(line.requestedQuantity)} {unit}
                    </TableCell>
                    <TableCell className="tnum text-right text-muted-foreground">
                      {formatNumber(line.proposedQuantity)}
                    </TableCell>
                    <TableCell>
                      {decided || !canApprove ? (
                        <span className="tnum font-medium">
                          {line.approvedQuantity == null
                            ? "—"
                            : formatNumber(line.approvedQuantity)}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          min={0}
                          step="0.001"
                          value={values[line.id] ?? ""}
                          placeholder="—"
                          onChange={(event) =>
                            setValues((current) => ({
                              ...current,
                              [line.id]: event.target.value,
                            }))
                          }
                          aria-label={`Approved quantity for ${line.channelCode} ${line.customerName}`}
                          className={cn(
                            !filled && "border-destructive",
                            approved > line.requestedQuantity && "border-destructive"
                          )}
                        />
                      )}
                    </TableCell>
                    <TableCell
                      className={
                        reduction > 0
                          ? "tnum text-right text-destructive"
                          : "tnum text-right"
                      }
                    >
                      {filled ? (reduction > 0 ? `−${formatNumber(reduction)}` : "0") : "—"}
                    </TableCell>
                    <TableCell>
                      {decided || !canApprove ? (
                        <span className="text-xs text-muted-foreground">
                          {line.reason ?? "—"}
                        </span>
                      ) : (
                        <Input
                          value={reasons[line.id] ?? ""}
                          placeholder="Why this channel"
                          onChange={(event) =>
                            setReasons((current) => ({
                              ...current,
                              [line.id]: event.target.value,
                            }))
                          }
                          aria-label={`Reason for ${line.channelCode}`}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="border-t-2 border-gold/40 font-medium">
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="tnum text-right">
                  {formatNumber(
                    lines.reduce((sum, line) => sum + line.requestedQuantity, 0)
                  )}
                </TableCell>
                <TableCell />
                <TableCell className="tnum">
                  {formatNumber(assigned)} / {formatNumber(actualQuantity)}
                </TableCell>
                <TableCell colSpan={2}>
                  <span
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium",
                      balanced
                        ? "bg-success/10 text-success"
                        : "bg-destructive/10 text-destructive"
                    )}
                  >
                    {balanced
                      ? "Adds up to what arrived"
                      : remaining > 0
                        ? `${formatNumber(remaining)} ${unit} still unassigned`
                        : `Over-assigned by ${formatNumber(Math.abs(remaining))} ${unit}`}
                  </span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div className="space-y-3 px-6">
          {decided ? (
            <p className="text-sm">
              {approvedByName
                ? `Decided by ${approvedByName}${approvedAt ? ` on ${approvedAt}` : ""}.`
                : "This case has been decided."}
              {decisionNote ? ` — ${decisionNote}` : ""}
            </p>
          ) : !canApprove ? (
            <p className="text-sm text-muted-foreground">
              Only management or a sales manager who sees every channel can
              decide a cross-channel shortage. You can see the proposal but not
              approve it.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="shortage-note">Decision note</Label>
                <Textarea
                  id="shortage-note"
                  rows={2}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="What was agreed, and with whom"
                />
              </div>
              {overPromised ? (
                <p className="text-xs text-destructive">
                  {overPromised.customerName} cannot be given more than the{" "}
                  {formatNumber(overPromised.requestedQuantity)} {unit} they
                  ordered.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="gold"
                  onClick={() => submit("approve")}
                  disabled={
                    busy !== null ||
                    !balanced ||
                    !everyLineDecided ||
                    Boolean(overPromised)
                  }
                >
                  {busy === "approve" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  Approve this split
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => submit("reject")}
                  disabled={busy !== null}
                >
                  {busy === "reject" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  Reject
                </Button>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
