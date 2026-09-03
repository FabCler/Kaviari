"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, PencilLine } from "lucide-react";
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
import { ToneBadge, documentTone } from "@/components/scm/status-badge";
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "@/lib/scm/domain";
import { cn } from "@/lib/utils";

/**
 * §1.3 — the verification screen. Everything the reader produced is editable;
 * a corrected field is marked so the next reader can tell machine output from
 * a human decision, and the change is written to the audit trail.
 */

interface LineState {
  id: string;
  lineNo: number;
  productId: string | null;
  productCodeRaw: string | null;
  descriptionRaw: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  priceUnit: string | null;
  deliveryDate: string;
  editedFields: string[];
  poLineId: string | null;
}

interface InvoiceState {
  id: string;
  invoiceNumber: string;
  status: string;
  poId: string | null;
  currency: string;
  invoiceDate: string;
  deliveryDate: string;
  poNumberRaw: string | null;
  supplierNameRaw: string | null;
  rejectReason: string | null;
  verifiedByName: string | null;
  lines: LineState[];
}

export function InvoiceVerify({
  invoice,
  products,
  purchaseOrders,
  poLines,
  canEdit,
}: {
  invoice: InvoiceState;
  products: { id: string; prCode: string; name: string; unit: string }[];
  purchaseOrders: { id: string; poNumber: string; supplierName: string }[];
  poLines: { id: string; label: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [header, setHeader] = React.useState({
    invoiceNumber: invoice.invoiceNumber,
    poId: invoice.poId ?? "none",
    invoiceDate: invoice.invoiceDate,
    deliveryDate: invoice.deliveryDate,
    currency: invoice.currency,
  });
  const [lines, setLines] = React.useState<LineState[]>(invoice.lines);
  const [rejectReason, setRejectReason] = React.useState("");
  const [busy, setBusy] = React.useState<"save" | "verify" | "reject" | null>(null);

  const locked = invoice.status === "verified" || invoice.status === "rejected";
  const editable = canEdit && !locked;

  function updateLine(id: string, patch: Partial<LineState>) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line))
    );
  }

  async function send(action: "save" | "verify" | "reject") {
    setBusy(action);
    try {
      const response = await fetch(`/api/scm/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          invoiceNumber: header.invoiceNumber,
          poId: header.poId === "none" ? null : header.poId,
          invoiceDate: header.invoiceDate || null,
          deliveryDate: header.deliveryDate || null,
          currency: header.currency,
          rejectReason: action === "reject" ? rejectReason : undefined,
          lines: lines.map((line) => ({
            id: line.id,
            productId: line.productId,
            quantity: Number(line.quantity),
            unit: line.unit,
            unitPrice: Number(line.unitPrice),
            priceUnit: line.priceUnit,
            deliveryDate: line.deliveryDate || null,
            descriptionRaw: line.descriptionRaw,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? "The invoice could not be saved.");
        return;
      }
      if (action === "verify") {
        toast.success(
          `Verified. ${payload.reconciliation?.needsReview ?? 0} line(s) need purchasing review.`
        );
      } else if (action === "reject") {
        toast.success("Invoice rejected.");
      } else {
        toast.success("Saved.");
      }
      router.refresh();
    } catch {
      toast.error("The request failed — try again.");
    } finally {
      setBusy(null);
    }
  }

  const unmatched = lines.filter((line) => !line.productId).length;
  const total = lines.reduce(
    (sum, line) => sum + Number(line.quantity) * Number(line.unitPrice),
    0
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Invoice header</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {invoice.poNumberRaw
                ? `PO printed on the document: ${invoice.poNumberRaw}`
                : "No PO number printed on the document."}
            </p>
          </div>
          <ToneBadge tone={documentTone(invoice.status)}>
            {INVOICE_STATUS_LABELS[invoice.status as InvoiceStatus] ?? invoice.status}
          </ToneBadge>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="invoice-number">Invoice number</Label>
            <Input
              id="invoice-number"
              value={header.invoiceNumber}
              disabled={!editable}
              onChange={(event) =>
                setHeader((current) => ({
                  ...current,
                  invoiceNumber: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="invoice-po">Purchase order</Label>
            <Select
              value={header.poId}
              disabled={!editable}
              onValueChange={(value) =>
                setHeader((current) => ({ ...current, poId: value }))
              }
            >
              <SelectTrigger id="invoice-po">
                <SelectValue placeholder="Not linked" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked</SelectItem>
                {purchaseOrders.map((po) => (
                  <SelectItem key={po.id} value={po.id}>
                    {po.poNumber} · {po.supplierName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-date">Invoice date</Label>
            <Input
              id="invoice-date"
              type="date"
              value={header.invoiceDate}
              disabled={!editable}
              onChange={(event) =>
                setHeader((current) => ({
                  ...current,
                  invoiceDate: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-delivery">Delivery date</Label>
            <Input
              id="invoice-delivery"
              type="date"
              value={header.deliveryDate}
              disabled={!editable}
              onChange={(event) =>
                setHeader((current) => ({
                  ...current,
                  deliveryDate: event.target.value,
                }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Extracted lines ({lines.length})
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {unmatched > 0
              ? `${unmatched} line(s) have no product yet — pick one before verifying.`
              : "Every line is matched to a product."}{" "}
            Fields marked with a pencil were corrected by hand.
          </p>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Read from the document</TableHead>
                  <TableHead className="w-64">Product</TableHead>
                  <TableHead className="w-28">Quantity</TableHead>
                  <TableHead className="w-24">Unit</TableHead>
                  <TableHead className="w-28">Unit price</TableHead>
                  <TableHead className="w-24">Price unit</TableHead>
                  <TableHead className="w-36">Delivery</TableHead>
                  <TableHead className="w-56">PO line</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="tnum">{line.lineNo}</TableCell>
                    <TableCell className="max-w-[18rem] text-xs text-muted-foreground">
                      <div className="truncate">{line.descriptionRaw ?? "-"}</div>
                      <div>{line.productCodeRaw ?? "no code"}</div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={line.productId ?? "none"}
                        disabled={!editable}
                        onValueChange={(value) =>
                          updateLine(line.id, {
                            productId: value === "none" ? null : value,
                          })
                        }
                      >
                        <SelectTrigger
                          className={cn(!line.productId && "border-destructive")}
                          aria-label={`Product for line ${line.lineNo}`}
                        >
                          <SelectValue placeholder="Pick a product" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not matched</SelectItem>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.prCode} · {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <EditedMark fields={line.editedFields} field="productId" />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.001"
                        min={0}
                        value={line.quantity}
                        disabled={!editable}
                        onChange={(event) =>
                          updateLine(line.id, {
                            quantity: Number(event.target.value),
                          })
                        }
                        aria-label={`Quantity for line ${line.lineNo}`}
                      />
                      <EditedMark fields={line.editedFields} field="quantity" />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={line.unit}
                        disabled={!editable}
                        onChange={(event) =>
                          updateLine(line.id, { unit: event.target.value })
                        }
                        aria-label={`Unit for line ${line.lineNo}`}
                      />
                      <EditedMark fields={line.editedFields} field="unit" />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.0001"
                        min={0}
                        value={line.unitPrice}
                        disabled={!editable}
                        onChange={(event) =>
                          updateLine(line.id, {
                            unitPrice: Number(event.target.value),
                          })
                        }
                        aria-label={`Unit price for line ${line.lineNo}`}
                      />
                      <EditedMark fields={line.editedFields} field="unitPrice" />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={line.priceUnit ?? ""}
                        disabled={!editable}
                        onChange={(event) =>
                          updateLine(line.id, { priceUnit: event.target.value })
                        }
                        aria-label={`Price unit for line ${line.lineNo}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        value={line.deliveryDate}
                        disabled={!editable}
                        onChange={(event) =>
                          updateLine(line.id, { deliveryDate: event.target.value })
                        }
                        aria-label={`Delivery date for line ${line.lineNo}`}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {line.poLineId
                        ? (poLines.find((po) => po.id === line.poLineId)?.label ??
                          "matched")
                        : "matched on verification"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="px-6 pt-3 text-sm text-muted-foreground">
            Document total:{" "}
            <span className="tnum font-medium text-foreground">
              {total.toLocaleString("en-GB", { maximumFractionDigits: 2 })}{" "}
              {header.currency}
            </span>
          </div>
        </CardContent>
      </Card>

      {locked ? (
        <Card>
          <CardContent className="py-4 text-sm">
            {invoice.status === "verified"
              ? `Verified by ${invoice.verifiedByName ?? "purchasing"} — the lines can no longer be edited.`
              : `Rejected: ${invoice.rejectReason ?? "no reason recorded"}.`}
          </CardContent>
        </Card>
      ) : editable ? (
        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => send("save")}
                disabled={busy !== null}
              >
                {busy === "save" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                Save corrections
              </Button>
              <Button
                variant="gold"
                onClick={() => send("verify")}
                disabled={busy !== null || unmatched > 0 || header.poId === "none"}
              >
                {busy === "verify" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                Verify and reconcile against the PO
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[18rem] flex-1 space-y-1.5">
                <Label htmlFor="reject-reason">Reject the invoice</Label>
                <Textarea
                  id="reject-reason"
                  value={rejectReason}
                  rows={2}
                  placeholder="Why is this invoice being rejected?"
                  onChange={(event) => setRejectReason(event.target.value)}
                />
              </div>
              <Button
                variant="destructive"
                onClick={() => send("reject")}
                disabled={busy !== null || rejectReason.trim().length === 0}
              >
                {busy === "reject" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Your department can view this invoice but not verify it.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EditedMark({ fields, field }: { fields: string[]; field: string }) {
  if (!fields.includes(field)) return null;
  return (
    <span className="mt-1 flex items-center gap-1 text-[0.68rem] text-warning">
      <PencilLine className="size-3" aria-hidden />
      corrected
    </span>
  );
}
