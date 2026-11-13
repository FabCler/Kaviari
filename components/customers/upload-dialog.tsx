"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import type { CustomerSalesMeta } from "@/components/customers/types";

/**
 * Update the customer-sales data from an Excel export: a full "Top 90%
 * sales" snapshot, or an invoice-line export covering a few months.
 * Either way, uploading the same file twice is harmless.
 */
export function UploadDialog({ meta }: { meta: CustomerSalesMeta }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/customer-sales", {
        method: "POST",
        body: form,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "The upload failed. Try again.");
        return;
      }
      if (body.mode === "replace-months") {
        const months = body.months as { year: number; month: number }[];
        const label = (m: { year: number; month: number }) =>
          new Date(Date.UTC(m.year, m.month - 1, 1)).toLocaleDateString(
            "en-GB",
            { month: "short", year: "numeric", timeZone: "UTC" }
          );
        const span =
          months.length > 1
            ? `${label(months[0])} – ${label(months[months.length - 1])}`
            : label(months[0]);
        toast.success(
          `${span} updated: ${body.rows} rows, ${body.customers} customers` +
            (body.repsAdded > 0
              ? `, ${body.repsAdded} new sales-rep assignments.`
              : ".") +
            " Earlier months are kept."
        );
      } else {
        toast.success(
          `Data replaced: ${body.rows} rows, ${body.customers} customers (${body.years.join(", ")}).`
        );
      }
      setOpen(false);
      setFile(null);
      router.refresh();
    } catch {
      toast.error("The upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setOpen(next);
          if (!next) setFile(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileUp className="size-4" />
          Update data
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update customer sales</DialogTitle>
          <DialogDescription>
            Two exports are accepted. The &ldquo;Top 90% sales&rdquo; pivot
            replaces all customer data. The invoice-line export (a
            &ldquo;Data&rdquo; sheet with CardCode, PR Code, Month, Quantity)
            replaces only the months it covers and keeps earlier history.
            Consumption, stock and accounts are not affected.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="file"
          accept=".xlsx,.xls"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          disabled={busy}
        />
        {meta.uploadedAt ? (
          <p className="text-xs text-muted-foreground">
            Current data: {meta.fileName ?? "unknown file"} — uploaded{" "}
            {formatDate(meta.uploadedAt)}.
          </p>
        ) : null}
        <DialogFooter>
          <Button onClick={upload} disabled={!file || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? "Updating data…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
