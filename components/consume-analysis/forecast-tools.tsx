"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ForecastEditor } from "@/components/consume-analysis/forecast-editor";
import { UploadDropzone } from "@/components/consume-analysis/upload-dropzone";
import type { ForecastEditorData } from "@/components/consume-analysis/types";

interface UploadResult {
  updated: number;
  deleted: number;
  skipped: string[];
}

/**
 * Forecast round-trip: edit saved forecasts directly in the app, or download
 * the styled template, fill it in Excel and drop it back here. Everything is
 * saved under the signed-in user; totals shown in the analysis are the sum
 * across everyone's forecasts.
 */
export function ForecastTools({
  hasForecasts,
  editor,
  isOwner = false,
}: {
  hasForecasts: boolean;
  editor: ForecastEditorData;
  /** Owners also get the audit export (who forecasted, per customer). */
  isOwner?: boolean;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function upload() {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/forecasts/upload", { method: "POST", body: form });
      const json: (UploadResult & { error?: string }) | null = await res
        .json()
        .catch(() => null);
      if (!res.ok || !json) {
        toast.error(json?.error ?? "The upload failed — please try again.");
        return;
      }
      const saved = json.updated + json.deleted;
      const summary =
        saved === 0
          ? "No forecast changes were saved"
          : `${json.updated} forecast${json.updated === 1 ? "" : "s"} saved` +
            (json.deleted > 0 ? `, ${json.deleted} cleared` : "");
      if (json.skipped.length > 0) {
        toast.warning(`${summary} — ${json.skipped.length} skipped`, {
          description: json.skipped.slice(0, 3).join(" · "),
        });
      } else if (saved === 0) {
        toast.info(summary);
      } else {
        toast.success(summary);
      }
      setFile(null);
      router.refresh();
    } catch {
      toast.error("The upload failed — check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forecasts</CardTitle>
        <CardDescription>
          Download the customer template — one row per customer and month,
          with the assigned sales rep and a column per product — fill in the
          quantities and upload it back. Uploads are recorded under your
          name, per customer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {hasForecasts ? (
                <p>
                  The template lists every customer with its sales rep for the
                  next three months, prefilled with the saved customer
                  forecasts. Blank cells keep saved values, 0 clears one.
                  “Edit forecasts” still adjusts product-level totals
                  directly.
                </p>
              ) : (
                <p>
                  No forecasts yet. Download the customer template to enter
                  the first quantities, or use “Edit forecasts” for quick
                  product-level totals.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <ForecastEditor editor={editor} />
              <Button variant="outline" asChild>
                <a href="/api/forecasts/template" download>
                  <Download aria-hidden />
                  Forecast template
                </a>
              </Button>
              {isOwner ? (
                <Button variant="outline" asChild>
                  <a href="/api/exports/forecast-data" download>
                    <Download aria-hidden />
                    Forecast data (admin)
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <UploadDropzone file={file} onFile={setFile} disabled={uploading} />
            <Button
              variant="gold"
              onClick={upload}
              disabled={!file || uploading}
              className="self-end"
            >
              {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
              {uploading ? "Uploading…" : "Upload filled template"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
