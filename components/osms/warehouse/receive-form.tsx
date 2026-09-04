"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Scale, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
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
 * §7 / §6.2 — record what arrived. Weight-controlled products (fish, crab,
 * shrimp) are captured piece by piece: each item carries its own weight and
 * the customer it goes to, and the total weight becomes the actual quantity.
 */

interface WeighedItem {
  key: string;
  itemNo: string;
  weight: string;
  condition: "good" | "damaged" | "rejected";
}

interface LineState {
  poLineId: string;
  productCode: string;
  productName: string;
  unit: string;
  weightControlled: boolean;
  lotRequired: boolean;
  expiryRequired: boolean;
  expectedQuantity: number;
  alreadyReceived: number;
  actualQuantity: string;
  lotNumber: string;
  expiryDate: string;
  storageLocation: string;
  remark: string;
  items: WeighedItem[];
  allocationLines: { id: string; label: string; quantity: number }[];
}

export function ReceiveForm({
  poId,
  poNumber,
  lines: input,
  defaultStorageLocation,
}: {
  poId: string;
  poNumber: string;
  defaultStorageLocation: string;
  lines: {
    poLineId: string;
    productCode: string;
    productName: string;
    unit: string;
    weightControlled: boolean;
    lotRequired: boolean;
    expiryRequired: boolean;
    expectedQuantity: number;
    alreadyReceived: number;
    allocationLines: { id: string; label: string; quantity: number }[];
  }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [receivedDate, setReceivedDate] = React.useState(
    new Date().toISOString().slice(0, 10)
  );
  const [lines, setLines] = React.useState<LineState[]>(
    input.map((line) => ({
      ...line,
      // A second delivery opens with what is still outstanding, not the whole
      // line (§23).
      actualQuantity: String(
        Math.max(0, round(line.expectedQuantity - line.alreadyReceived))
      ),
      lotNumber: "",
      expiryDate: "",
      storageLocation: defaultStorageLocation,
      remark: "",
      items: [],
    }))
  );

  function update(poLineId: string, patch: Partial<LineState>) {
    setLines((current) =>
      current.map((line) =>
        line.poLineId === poLineId ? { ...line, ...patch } : line
      )
    );
  }

  function addItems(poLineId: string, count: number) {
    setLines((current) =>
      current.map((line) => {
        if (line.poLineId !== poLineId) return line;
        const start = line.items.length;
        const items = [...line.items];
        for (let index = 0; index < count; index++) {
          const number = start + index + 1;
          items.push({
            key: `item-${poLineId}-${number}-${Date.now()}`,
            itemNo: `${line.productCode}-${String(number).padStart(2, "0")}`,
            weight: "",
            condition: "good",
          });
        }
        return { ...line, items };
      })
    );
  }

  function updateItem(poLineId: string, key: string, patch: Partial<WeighedItem>) {
    setLines((current) =>
      current.map((line) =>
        line.poLineId === poLineId
          ? {
              ...line,
              items: line.items.map((item) =>
                item.key === key ? { ...item, ...patch } : item
              ),
            }
          : line
      )
    );
  }

  async function submit(complete: boolean) {
    setBusy(true);
    try {
      const response = await fetch("/api/osms/receiving", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poId,
          receivedDate,
          notes: notes || undefined,
          complete,
          lines: lines.map((line) => ({
            poLineId: line.poLineId,
            actualQuantity: line.weightControlled
              ? totalWeight(line)
              : Number(line.actualQuantity),
            lotNumber: line.lotNumber || null,
            expiryDate: line.expiryDate || null,
            storageLocation: line.storageLocation || null,
            remark: line.remark || null,
            items: line.weightControlled
              ? line.items.map((item) => ({
                  itemNo: item.itemNo,
                  weight: Number(item.weight),
                  storageLocation: line.storageLocation || null,
                  lotNumber: line.lotNumber || null,
                  expiryDate: line.expiryDate || null,
                  condition: item.condition,
                }))
              : undefined,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? "The goods could not be received.");
        return;
      }
      toast.success(`${payload.receiptNumber} recorded against ${poNumber}.`);
      router.push(`/osms/warehouse/receiving/${payload.id}`);
      router.refresh();
    } catch {
      toast.error("The request failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Goods receipt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="received-date">Received on</Label>
              <Input
                id="received-date"
                type="date"
                value={receivedDate}
                onChange={(event) => setReceivedDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="receiving-notes">Notes</Label>
              <Input
                id="receiving-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          {lines.map((line) => {
            const actual = line.weightControlled
              ? totalWeight(line)
              : Number(line.actualQuantity) || 0;
            const difference = round(actual - line.expectedQuantity);
            return (
              <div
                key={line.poLineId}
                className="space-y-3 rounded-md border border-border p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <div className="font-medium">{line.productName}</div>
                    <div className="text-xs text-muted-foreground">
                      {line.productCode} · confirmed{" "}
                      {formatNumber(line.expectedQuantity)} {line.unit}
                      {line.alreadyReceived > 0 ? (
                        <span className="text-warning">
                          {" "}
                          · {formatNumber(line.alreadyReceived)} already received
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "tnum text-sm",
                      difference === 0
                        ? "text-success"
                        : difference > 0
                          ? "text-warning"
                          : "text-destructive"
                    )}
                  >
                    {difference > 0 ? "+" : ""}
                    {formatNumber(difference)} {line.unit} vs expected
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor={`qty-${line.poLineId}`}>
                      Actual quantity ({line.unit})
                    </Label>
                    <Input
                      id={`qty-${line.poLineId}`}
                      type="number"
                      min={0}
                      step="0.001"
                      value={
                        line.weightControlled
                          ? String(actual)
                          : line.actualQuantity
                      }
                      disabled={line.weightControlled}
                      onChange={(event) =>
                        update(line.poLineId, {
                          actualQuantity: event.target.value,
                        })
                      }
                    />
                    {line.weightControlled ? (
                      <p className="text-xs text-muted-foreground">
                        Calculated from the weighed items below.
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`lot-${line.poLineId}`}>
                      Lot / batch{line.lotRequired ? " (required)" : ""}
                    </Label>
                    <Input
                      id={`lot-${line.poLineId}`}
                      className={cn(
                        line.lotRequired && !line.lotNumber && "border-destructive"
                      )}
                      value={line.lotNumber}
                      onChange={(event) =>
                        update(line.poLineId, { lotNumber: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`expiry-${line.poLineId}`}>
                      Expiry (DLC){line.expiryRequired ? " (required)" : ""}
                    </Label>
                    <Input
                      id={`expiry-${line.poLineId}`}
                      type="date"
                      className={cn(
                        line.expiryRequired &&
                          !line.expiryDate &&
                          "border-destructive"
                      )}
                      value={line.expiryDate}
                      onChange={(event) =>
                        update(line.poLineId, { expiryDate: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`location-${line.poLineId}`}>
                      Storage location
                    </Label>
                    <Input
                      id={`location-${line.poLineId}`}
                      value={line.storageLocation}
                      onChange={(event) =>
                        update(line.poLineId, {
                          storageLocation: event.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                {line.weightControlled ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Scale className="size-4 text-muted-foreground" aria-hidden />
                      <span className="text-sm font-medium">
                        Individual items ({line.items.length})
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addItems(line.poLineId, 1)}
                      >
                        <Plus className="size-4" aria-hidden />
                        Add one
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addItems(line.poLineId, 10)}
                      >
                        <Plus className="size-4" aria-hidden />
                        Add ten
                      </Button>
                    </div>

                    {line.items.length > 0 ? (
                      <div className="overflow-x-auto rounded-md border border-border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-40">Item no.</TableHead>
                              <TableHead className="w-32">Weight (KG)</TableHead>
                              <TableHead className="w-32">Condition</TableHead>
                              <TableHead className="w-10" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {line.items.map((item) => (
                              <TableRow key={item.key}>
                                <TableCell>
                                  <Input
                                    value={item.itemNo}
                                    onChange={(event) =>
                                      updateItem(line.poLineId, item.key, {
                                        itemNo: event.target.value,
                                      })
                                    }
                                    aria-label="Item number"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min={0}
                                    step="0.001"
                                    value={item.weight}
                                    onChange={(event) =>
                                      updateItem(line.poLineId, item.key, {
                                        weight: event.target.value,
                                      })
                                    }
                                    aria-label="Weight"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={item.condition}
                                    onValueChange={(value) =>
                                      updateItem(line.poLineId, item.key, {
                                        condition: value as WeighedItem["condition"],
                                      })
                                    }
                                  >
                                    <SelectTrigger aria-label="Condition on arrival">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="good">Good</SelectItem>
                                      <SelectItem value="damaged">Damaged</SelectItem>
                                      <SelectItem value="rejected">Rejected</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label="Remove this item"
                                    onClick={() =>
                                      update(line.poLineId, {
                                        items: line.items.filter(
                                          (entry) => entry.key !== item.key
                                        ),
                                      })
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
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Add one row per piece and weigh it — the total becomes
                        the received quantity.
                      </p>
                    )}

                    <AssignmentSummary line={line} />
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor={`remark-${line.poLineId}`}>Remark</Label>
                  <Textarea
                    id={`remark-${line.poLineId}`}
                    rows={2}
                    value={line.remark}
                    onChange={(event) =>
                      update(line.poLineId, { remark: event.target.value })
                    }
                    placeholder="Condition on arrival, damage, temperature…"
                  />
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => submit(false)} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Record the receipt
            </Button>
            <Button variant="gold" onClick={() => submit(true)} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Receive and complete
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Flow §6.2 — the warehouse's job on a weighed line is to account for the
 * weight, not to decide who gets which piece. So this reports the pieces and
 * their total against the line, and says plainly where the line goes next.
 */
function AssignmentSummary({ line }: { line: LineState }) {
  const weighed = totalWeight(line);
  const recorded = Number(line.actualQuantity) || 0;
  const balanced = Math.abs(weighed - recorded) <= 0.05;

  return (
    <div className="space-y-1 text-xs">
      <div className={balanced ? "text-success" : "text-warning"}>
        {line.items.length} piece{line.items.length === 1 ? "" : "s"} weighing{" "}
        {formatNumber(weighed)} in total
        {balanced ? " ✓" : ` (the line records ${formatNumber(recorded)})`}
      </div>
      <div className="text-muted-foreground">
        Sales chooses which piece goes to which customer once this receipt is
        saved.
      </div>
    </div>
  );
}

function totalWeight(line: LineState): number {
  return round(
    line.items.reduce((sum, item) => sum + (Number(item.weight) || 0), 0)
  );
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
