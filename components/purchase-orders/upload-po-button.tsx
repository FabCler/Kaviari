"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Dropzone } from "@/components/import/dropzone";

interface UploadResponse {
  id?: string;
  reference?: string;
  matched?: number;
  unmatched?: { description: string; quantity?: number | null }[];
  error?: string;
}

/**
 * "Upload PO" — drag & drop a supplier order file (.xlsx/.xls/.csv/.pdf).
 * The server parses it, the AI matches lines to the catalog and a PO is
 * created as "sent"; on success we navigate straight to it.
 */
export function UploadPoButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);

  async function upload(candidate: File) {
    setPending(true);
    try {
      const form = new FormData();
      form.append("file", candidate);
      const res = await fetch("/api/purchase-orders/upload", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as UploadResponse;
      if (!res.ok || !data.id) {
        toast.error(data.error ?? "The file could not be analyzed.");
        setFile(null);
        return;
      }
      const matched = data.matched ?? 0;
      const unmatchedCount = data.unmatched?.length ?? 0;
      toast.success(
        `PO ${data.reference} created — ${matched} ${
          matched === 1 ? "line" : "lines"
        }${unmatchedCount > 0 ? `, ${unmatchedCount} unmatched` : ""}.`
      );
      if (unmatchedCount > 0 && data.unmatched) {
        toast.warning(
          `Not matched to the catalog: ${data.unmatched
            .slice(0, 5)
            .map((u) => u.description)
            .join("; ")}${unmatchedCount > 5 ? "…" : ""}`
        );
      }
      setOpen(false);
      setFile(null);
      router.push(`/purchase-orders/${data.id}`);
      router.refresh();
    } catch {
      toast.error("The file could not be analyzed.");
      setFile(null);
    } finally {
      setPending(false);
    }
  }

  function handleFile(candidate: File | null) {
    setFile(candidate);
    if (candidate) void upload(candidate);
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label="Upload a purchase order file"
      >
        <Upload aria-hidden /> Upload PO
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return; // don't close mid-analysis
          setOpen(next);
          if (!next) setFile(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload a purchase order</DialogTitle>
            <DialogDescription>
              Drop the order file you sent to Kaviari — .xlsx, .xls, .csv or
              .pdf, up to 10 MB. The AI matches its lines to your product
              catalog and creates the order as “sent”.
            </DialogDescription>
          </DialogHeader>

          <Dropzone file={file} onFile={handleFile} disabled={pending} />

          {pending ? (
            <p
              className="flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <Sparkles className="size-4 text-gold-deep" aria-hidden />
              Reading the file and matching products — this can take a few
              seconds…
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
