"use client";

import * as React from "react";
import { toast } from "sonner";
import { FileText, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const REPORT_OPTIONS = [
  {
    value: "inventory",
    label: "Inventory status",
    description: "Stock position, lot detail, expiry risk and slow movers.",
  },
  {
    value: "consumption",
    label: "Consumption & forecasts",
    description: "Usage by product and channel, trends and demand outlook.",
  },
  {
    value: "orders",
    label: "Order planning",
    description: "What to order next cycle, timing, open POs and risks.",
  },
] as const;

type ReportType = (typeof REPORT_OPTIONS)[number]["value"];

/**
 * "Reports" header button + dialog. Generates a detailed AI report as a
 * standalone HTML document and opens it in a new tab via a Blob URL so the
 * user can read, print or save it as a PDF.
 */
export function ReportDialog({
  aiConfigured,
  aiUnavailableMessage,
}: {
  aiConfigured: boolean;
  aiUnavailableMessage: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<ReportType>("inventory");
  const [focus, setFocus] = React.useState("");
  const [generating, setGenerating] = React.useState(false);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/assistant/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          focus: focus.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "The report could not be generated.");
      }
      const html = await res.text();
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const tab = window.open(url, "_blank");
      if (!tab) {
        URL.revokeObjectURL(url);
        throw new Error(
          "The report tab was blocked — allow pop-ups for this site and try again."
        );
      }
      // Give the new tab time to load before releasing the Blob URL.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("Report opened in a new tab");
      setOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "The report could not be generated."
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileText aria-hidden /> Reports
      </Button>

      <Dialog open={open} onOpenChange={(o) => !generating && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Detailed report</DialogTitle>
            <DialogDescription>
              The assistant writes a full report from your live data — it opens
              in a new tab, ready to read, print or save as PDF.
            </DialogDescription>
          </DialogHeader>

          {!aiConfigured ? (
            <Alert variant="gold">
              <Sparkles aria-hidden />
              <AlertTitle>AI is not configured</AlertTitle>
              <AlertDescription>{aiUnavailableMessage}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Report type</Label>
              <div
                role="radiogroup"
                aria-label="Report type"
                className="space-y-2"
              >
                {REPORT_OPTIONS.map((opt) => {
                  const selected = type === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setType(opt.value)}
                      className={cn(
                        "w-full rounded-lg border p-3 text-left transition-colors",
                        selected
                          ? "border-gold bg-gold/5"
                          : "border-border hover:border-gold/50"
                      )}
                    >
                      <span className="block text-sm font-medium text-foreground">
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {opt.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="report-focus">Focus (optional)</Label>
              <Textarea
                id="report-focus"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="e.g. concentrate on Kristal and Oscietra, or the next 30 days…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={generating}
            >
              Cancel
            </Button>
            <Button
              variant="gold"
              onClick={generate}
              disabled={!aiConfigured || generating}
            >
              <Sparkles aria-hidden />
              {generating ? "Writing report…" : "Generate report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
