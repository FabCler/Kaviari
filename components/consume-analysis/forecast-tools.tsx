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
import { UploadDropzone } from "@/components/consume-analysis/upload-dropzone";

interface UploadResult {
  updated: number;
  deleted: number;
  skipped: string[];
}

/**
 * Forecast round-trip: download the styled template, fill it in Excel, drop
 * it back here. Uploads are saved under the signed-in user; totals shown in
 * the analysis are the sum across everyone's forecasts.
 */
export function ForecastTools({ hasForecasts }: { hasForecasts: boolean }) {
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
          Download the template, fill in monthly quantities and upload it back.
          Uploaded forecasts are saved under your name; totals sum everyone’s
          forecasts, and the person filter above narrows them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {hasForecasts ? (
                <p>
                  The template is prefilled with your saved forecasts for the
                  next six months — blank cells keep saved values, 0 clears one.
                </p>
              ) : (
                <p>
                  No forecasts yet. Download the template to enter the first
                  monthly quantities for the caviar and fish-roe range.
                </p>
              )}
            </div>
            <div>
              <Button variant="outline" asChild>
                <a href="/api/forecasts/template" download>
                  <Download aria-hidden />
                  Forecast template
                </a>
              </Button>
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
