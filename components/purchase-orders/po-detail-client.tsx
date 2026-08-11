"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  PackageCheck,
  Plus,
  Save,
  Send,
  ThumbsUp,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDate,
  formatGrams,
  formatMoney,
  formatNumber,
} from "@/lib/format";
import { ReceiveDialog } from "@/components/purchase-orders/receive-dialog";
import type {
  PoDto,
  ProductOptionDto,
} from "@/components/purchase-orders/types";

interface EditableLine {
  productId: string;
  productName: string;
  tinSizeGrams: number;
  quantityTins: string;
  unitCost: string;
}

function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

export function PoDetailClient({
  po,
  products,
  currency,
  autoOpenReceive,
}: {
  po: PoDto;
  products: ProductOptionDto[];
  currency: string;
  autoOpenReceive: boolean;
}) {
  const router = useRouter();
  const isDraft = po.status === "draft";
  const canReceive = po.status === "sent" || po.status === "confirmed";

  const [pending, setPending] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(
    autoOpenReceive && canReceive
  );
  const [notes, setNotes] = useState(po.notes ?? "");
  const [expectedDelivery, setExpectedDelivery] = useState(
    toDateInput(po.expectedDeliveryDate)
  );
  const [lines, setLines] = useState<EditableLine[]>(
    po.lines.map((line) => ({
      productId: line.productId,
      productName: line.productName,
      tinSizeGrams: line.tinSizeGrams,
      quantityTins: String(line.quantityTins),
      unitCost: String(line.unitCost),
    }))
  );
  const [addProductId, setAddProductId] = useState("");

  const availableProducts = useMemo(
    () =>
      products.filter((p) => !lines.some((line) => line.productId === p.id)),
    [products, lines]
  );

  const totals = useMemo(() => {
    let tins = 0;
    let grams = 0;
    let value = 0;
    for (const line of lines) {
      const qty = Number(line.quantityTins) || 0;
      const cost = Number(line.unitCost) || 0;
      tins += qty;
      grams += qty * line.tinSizeGrams;
      value += qty * cost;
    }
    return { tins, grams, value };
  }, [lines]);

  function updateLine(index: number, patch: Partial<EditableLine>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function addLine() {
    const product = products.find((p) => p.id === addProductId);
    if (!product) return;
    setLines((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        tinSizeGrams: product.tinSizeGrams,
        quantityTins: "1",
        unitCost: String(product.unitCost),
      },
    ]);
    setAddProductId("");
  }

  async function patch(body: Record<string, unknown>, success: string) {
    setPending(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "The change could not be saved.");
        return false;
      }
      toast.success(success);
      router.refresh();
      return true;
    } catch {
      toast.error("The change could not be saved.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function saveDraft() {
    const payloadLines: {
      productId: string;
      quantityTins: number;
      unitCost: number;
    }[] = [];
    for (const line of lines) {
      const qty = Number(line.quantityTins);
      const cost = Number(line.unitCost);
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error(`Quantity for ${line.productName} must be greater than 0.`);
        return;
      }
      if (!Number.isFinite(cost) || cost < 0) {
        toast.error(`Unit cost for ${line.productName} is invalid.`);
        return;
      }
      payloadLines.push({
        productId: line.productId,
        quantityTins: qty,
        unitCost: cost,
      });
    }
    await patch(
      {
        notes,
        expectedDeliveryDate: new Date(
          `${expectedDelivery}T12:00:00`
        ).toISOString(),
        lines: payloadLines,
      },
      "Draft saved."
    );
  }

  async function transition(
    action: "send" | "confirm" | "cancel",
    success: string
  ) {
    if (
      action === "cancel" &&
      !window.confirm(`Cancel ${po.reference}? Its lines will no longer count as pipeline stock.`)
    ) {
      return;
    }
    await patch({ action }, success);
  }

  async function deleteDraft() {
    if (!window.confirm(`Delete draft ${po.reference}? This cannot be undone.`)) {
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "The draft could not be deleted.");
        return;
      }
      toast.success("Draft deleted.");
      router.push("/purchase-orders");
      router.refresh();
    } catch {
      toast.error("The draft could not be deleted.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        {isDraft ? (
          <>
            <Button variant="outline" onClick={saveDraft} disabled={pending}>
              <Save aria-hidden /> Save draft
            </Button>
            <Button
              variant="gold"
              onClick={() =>
                transition(
                  "send",
                  "Order marked as sent — the review cycle restarts today."
                )
              }
              disabled={pending || lines.length === 0}
            >
              <Send aria-hidden /> Mark as sent
            </Button>
            <Button
              variant="destructive"
              onClick={deleteDraft}
              disabled={pending}
            >
              <Trash2 aria-hidden /> Delete draft
            </Button>
          </>
        ) : null}
        {po.status === "sent" ? (
          <>
            <Button
              variant="gold"
              onClick={() => transition("confirm", "Order confirmed by Kaviari.")}
              disabled={pending}
            >
              <ThumbsUp aria-hidden /> Confirm
            </Button>
            <Button
              variant="outline"
              onClick={() => transition("cancel", "Order cancelled.")}
              disabled={pending}
            >
              <XCircle aria-hidden /> Cancel order
            </Button>
          </>
        ) : null}
        {po.status === "confirmed" ? (
          <>
            <Button
              variant="gold"
              onClick={() => setReceiveOpen(true)}
              disabled={pending}
            >
              <PackageCheck aria-hidden /> Receive delivery…
            </Button>
            <Button
              variant="outline"
              onClick={() => transition("cancel", "Order cancelled.")}
              disabled={pending}
            >
              <XCircle aria-hidden /> Cancel order
            </Button>
          </>
        ) : null}
        {pending ? (
          <Loader2
            className="size-4 animate-spin text-muted-foreground"
            aria-hidden
          />
        ) : null}
      </div>

      {/* Order details */}
      <Card>
        <CardHeader>
          <CardTitle>Order details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Ordered
              </p>
              <p className="mt-1 tnum">{formatDate(po.orderDate)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Expected delivery
              </p>
              {isDraft ? (
                <div className="mt-1">
                  <Label htmlFor="expected-delivery" className="sr-only">
                    Expected delivery date
                  </Label>
                  <Input
                    id="expected-delivery"
                    type="date"
                    className="tnum sm:max-w-44"
                    value={expectedDelivery}
                    onChange={(e) => setExpectedDelivery(e.target.value)}
                  />
                </div>
              ) : (
                <p className="mt-1 tnum">{formatDate(po.expectedDeliveryDate)}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Received
              </p>
              <p className="mt-1 tnum">
                {po.receivedDate ? (
                  formatDate(po.receivedDate)
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <Label
              htmlFor="po-notes"
              className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            >
              Notes
            </Label>
            {isDraft ? (
              <Textarea
                id="po-notes"
                className="mt-1"
                rows={2}
                placeholder="Delivery instructions, references…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            ) : (
              <p className="mt-1 text-sm whitespace-pre-line">
                {po.notes || (
                  <span className="text-muted-foreground">No notes</span>
                )}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card className="py-4">
        <CardHeader className="py-0">
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-4">
          {lines.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No lines yet — add a product below.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty (tins)</TableHead>
                  <TableHead className="text-right">Unit cost</TableHead>
                  <TableHead className="text-right">Line total</TableHead>
                  {isDraft ? (
                    <TableHead>
                      <span className="sr-only">Remove</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, index) => {
                  const qty = Number(line.quantityTins) || 0;
                  const cost = Number(line.unitCost) || 0;
                  return (
                    <TableRow key={line.productId}>
                      <TableCell>
                        <div className="font-medium">{line.productName}</div>
                        <div className="text-xs text-muted-foreground tnum">
                          {line.tinSizeGrams} g tin
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {isDraft ? (
                          <Input
                            aria-label={`Quantity for ${line.productName}`}
                            type="number"
                            min={0}
                            step={1}
                            inputMode="decimal"
                            className="ml-auto w-20 text-right tnum"
                            value={line.quantityTins}
                            onChange={(e) =>
                              updateLine(index, {
                                quantityTins: e.target.value,
                              })
                            }
                          />
                        ) : (
                          <span className="tnum">{formatNumber(qty)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isDraft ? (
                          <Input
                            aria-label={`Unit cost for ${line.productName}`}
                            type="number"
                            min={0}
                            step="0.01"
                            inputMode="decimal"
                            className="ml-auto w-24 text-right tnum"
                            value={line.unitCost}
                            onChange={(e) =>
                              updateLine(index, { unitCost: e.target.value })
                            }
                          />
                        ) : (
                          <span className="tnum">
                            {formatMoney(cost, currency)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tnum">
                        {formatMoney(qty * cost, currency)}
                      </TableCell>
                      {isDraft ? (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${line.productName}`}
                            onClick={() => removeLine(index)}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-medium">
                    Total — {formatNumber(totals.tins)}{" "}
                    {totals.tins === 1 ? "tin" : "tins"} ·{" "}
                    <span className="tnum">{formatGrams(totals.grams)}</span>
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-right font-semibold tnum">
                    {formatMoney(totals.value, currency)}
                  </TableCell>
                  {isDraft ? <TableCell /> : null}
                </TableRow>
              </TableFooter>
            </Table>
          )}

          {isDraft ? (
            <div className="mt-4 flex flex-wrap items-end gap-2 px-2 sm:px-0">
              <div className="min-w-0 grow sm:max-w-sm">
                <Label htmlFor="add-product" className="mb-1 block text-xs">
                  Add product
                </Label>
                <Select value={addProductId} onValueChange={setAddProductId}>
                  <SelectTrigger id="add-product" className="w-full">
                    <SelectValue placeholder="Choose a product…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProducts.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} ({product.tinSizeGrams} g)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                onClick={addLine}
                disabled={!addProductId}
              >
                <Plus aria-hidden /> Add line
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canReceive ? (
        <ReceiveDialog
          po={po}
          open={receiveOpen}
          onOpenChange={setReceiveOpen}
        />
      ) : null}
    </div>
  );
}
