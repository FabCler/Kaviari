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
 * Replace the customer-sales data with a fresh "Top 90% sales" export.
 * The file is a full snapshot, so every upload replaces everything —
 * uploading the same file twice is harmless.
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
      toast.success(
        `Data replaced: ${body.rows} rows, ${body.customers} customers (${body.years.join(", ")}).`
      );
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
            Upload the latest &ldquo;Top 90% sales&rdquo; Excel export. It
            replaces all customer data on this page — consumption, stock and
            accounts are not affected.
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
            {busy ? "Replacing data…" : "Upload & replace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
