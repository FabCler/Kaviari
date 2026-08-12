"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileDown,
  Loader2,
  PackageCheck,
  Paperclip,
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
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { ReceiveDialog } from "@/components/purchase-orders/receive-dialog";
import type {
  PoDto,
  ProductOptionDto,
} from "@/components/purchase-orders/types";

interface EditableLine {
  productId: string;
  productName: string;
  prCode: string;
  unit: string;
  packingPerBox: number | null;
  quantityTins: string;
  unitCost: string;
}

/** Statuses whose header and lines can still be corrected. */
const EDITABLE_STATUSES = ["draft", "sent", "confirmed"] as const;

function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

function lineBoxes(qty: number, packingPerBox: number | null): number | null {
  if (!packingPerBox || packingPerBox <= 0 || qty <= 0) return null;
  return Math.ceil(qty / packingPerBox);
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
  const editable = (EDITABLE_STATUSES as readonly string[]).includes(po.status);
  const canReceive = po.status === "sent" || po.status === "confirmed";

  const [pending, setPending] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(autoOpenReceive && canReceive);
  const [reference, setReference] = useState(po.reference);
  const [status, setStatus] = useState(po.status);
  const [orderDate, setOrderDate] = useState(toDateInput(po.orderDate));
  const [expectedDelivery, setExpectedDelivery] = useState(
    toDateInput(po.expectedDeliveryDate)
  );
  const [notes, setNotes] = useState(po.notes ?? "");
  const [lines, setLines] = useState<EditableLine[]>(
    po.lines.map((line) => ({
      productId: line.productId,
      productName: line.productName,
      prCode: line.prCode,
      unit: line.unit,
      packingPerBox: line.packingPerBox,
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
    let units = 0;
    let boxes = 0;
    let anyBoxes = false;
    for (const line of lines) {
      const qty = Number(line.quantityTins) || 0;
      units += qty;
      const b = lineBoxes(qty, line.packingPerBox);
      if (b != null) {
        boxes += b;
        anyBoxes = true;
      }
    }
    return { units, boxes: anyBoxes ? boxes : null };
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
        prCode: product.prCode,
        unit: product.unit,
        packingPerBox: product.packingPerBox,
        quantityTins: product.packingPerBox
          ? String(product.packingPerBox)
          : "1",
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

  async function saveChanges() {
    if (!reference.trim()) {
      toast.error("The reference cannot be empty.");
      return;
    }
    if (!orderDate) {
      toast.error("The order date is required.");
      return;
    }
    if (!expectedDelivery) {
      toast.error("The expected delivery date is required.");
      return;
    }
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
    if (status !== "draft" && payloadLines.length === 0) {
      toast.error("An order that has been sent needs at least one line.");
      return;
    }
    await patch(
      {
        edit: {
          reference: reference.trim(),
          status,
          orderDate: new Date(`${orderDate}T12:00:00`).toISOString(),
          expectedDeliveryDate: new Date(
            `${expectedDelivery}T12:00:00`
          ).toISOString(),
          notes,
          lines: payloadLines,
        },
      },
      "Changes saved."
    );
  }

  async function transition(
    action: "send" | "confirm" | "cancel",
    success: string
  ) {
    if (
      action === "cancel" &&
      !window.confirm(
        `Cancel ${po.reference}? Its lines will no longer count as pipeline stock.`
      )
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

  const fieldLabelClass =
    "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        {editable ? (
          <Button variant="outline" onClick={saveChanges} disabled={pending}>
            <Save aria-hidden /> Save changes
          </Button>
        ) : null}
        {isDraft ? (
          <>
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
        <Button variant="outline" asChild>
          <a
            href={`/api/purchase-orders/${po.id}/export`}
            download
            aria-label={`Download ${po.reference} as an Excel file`}
          >
            <FileDown aria-hidden /> Download Excel
          </a>
        </Button>
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
          <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1">
            Order details
            {po.uploadedFileName ? (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <Paperclip className="size-3.5" aria-hidden />
                {po.uploadedFileName}
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label htmlFor="po-reference" className={fieldLabelClass}>
                Reference
              </Label>
              {editable ? (
                <Input
                  id="po-reference"
                  className="mt-1 tnum"
                  value={reference}
                  maxLength={60}
                  onChange={(e) => setReference(e.target.value)}
                />
              ) : (
                <p className="mt-1 tnum">{po.reference}</p>
              )}
            </div>
            <div>
              <Label htmlFor="po-status" className={fieldLabelClass}>
                Status
              </Label>
              {editable ? (
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="po-status" className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <p className="mt-1 capitalize">{po.status}</p>
              )}
            </div>
            <div>
              <Label htmlFor="po-order-date" className={fieldLabelClass}>
                Ordered
              </Label>
              {editable ? (
                <Input
                  id="po-order-date"
                  type="date"
                  className="mt-1 tnum"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              ) : (
                <p className="mt-1 tnum">{formatDate(po.orderDate)}</p>
              )}
            </div>
            <div>
              <Label htmlFor="po-expected-delivery" className={fieldLabelClass}>
                Expected delivery
              </Label>
              {editable ? (
                <Input
                  id="po-expected-delivery"
                  type="date"
                  className="mt-1 tnum"
                  value={expectedDelivery}
                  onChange={(e) => setExpectedDelivery(e.target.value)}
                />
              ) : (
                <p className="mt-1 tnum">{formatDate(po.expectedDeliveryDate)}</p>
              )}
            </div>
            <div>
              <p className={fieldLabelClass}>Received</p>
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
            <Label htmlFor="po-notes" className={fieldLabelClass}>
              Notes
            </Label>
            {editable ? (
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

          {editable && !isDraft ? (
            <p className="mt-3 text-xs text-muted-foreground">
              This order is already in the pipeline — corrections here update
              the record without restarting the review cycle. Remember to save.
            </p>
          ) : null}
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty (units)</TableHead>
                    <TableHead className="text-right">Boxes</TableHead>
                    <TableHead className="text-right">Unit cost</TableHead>
                    {editable ? (
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
                    const boxes = lineBoxes(qty, line.packingPerBox);
                    return (
                      <TableRow key={line.productId}>
                        <TableCell>
                          <div className="font-medium">{line.productName}</div>
                          <div className="text-xs text-muted-foreground tnum">
                            {line.prCode} · {line.unit}
                            {line.packingPerBox
                              ? ` · box of ${line.packingPerBox}`
                              : ""}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {editable ? (
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
                        <TableCell className="text-right tnum">
                          {boxes != null ? (
                            formatNumber(boxes, 0)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {editable ? (
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
                        {editable ? (
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
                    <TableCell className="font-medium">Total</TableCell>
                    <TableCell className="text-right font-semibold tnum">
                      {formatNumber(totals.units)}{" "}
                      {totals.units === 1 ? "unit" : "units"}
                    </TableCell>
                    <TableCell className="text-right font-semibold tnum">
                      {totals.boxes != null ? (
                        `${formatNumber(totals.boxes, 0)} ${
                          totals.boxes === 1 ? "box" : "boxes"
                        }`
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell />
                    {editable ? <TableCell /> : null}
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}

          {editable ? (
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
                        {product.name} ({product.prCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                onClick={addLine}
                disabled={!addProductId || pending}
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
