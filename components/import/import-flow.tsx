"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ModeCards, MODE_META } from "@/components/import/mode-cards";
import { Dropzone } from "@/components/import/dropzone";
import {
  NoticesAlert,
  PriceListPreview,
  SalesPreview,
  StockTakePreview,
  UnmatchedAlert,
} from "@/components/import/previews";
import type {
  AnalysisResult,
  CommitResult,
  ImportMode,
} from "@/lib/import/types";

type Phase = "select" | "analyzing" | "preview" | "committing" | "done";

const ANALYZE_CAPTIONS = [
  "Uploading file…",
  "Parsing contents…",
  "AI is mapping rows to your catalog…",
];

interface ApiError {
  error?: string;
  issues?: string[];
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function ImportFlow({
  aiConfigured,
  aiMessage,
  currency,
}: {
  aiConfigured: boolean;
  aiMessage: string;
  currency: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("select");
  const [mode, setMode] = React.useState<ImportMode>("price_list");
  const [file, setFile] = React.useState<File | null>(null);
  const [analysis, setAnalysis] = React.useState<AnalysisResult | null>(null);
  const [commitResult, setCommitResult] = React.useState<CommitResult | null>(
    null
  );
  const [captionIndex, setCaptionIndex] = React.useState(0);
  const [fakeProgress, setFakeProgress] = React.useState(8);

  // Phase captions + creeping progress while the single analyze call runs.
  // The counters are reset in analyze() when the phase flips, so the effect
  // only schedules the timers.
  React.useEffect(() => {
    if (phase !== "analyzing") return;
    const captionTimer = setInterval(
      () =>
        setCaptionIndex((i) => Math.min(i + 1, ANALYZE_CAPTIONS.length - 1)),
      2200
    );
    const progressTimer = setInterval(
      () => setFakeProgress((p) => Math.min(92, p + Math.random() * 7)),
      450
    );
    return () => {
      clearInterval(captionTimer);
      clearInterval(progressTimer);
    };
  }, [phase]);

  const reset = () => {
    setPhase("select");
    setFile(null);
    setAnalysis(null);
    setCommitResult(null);
  };

  const analyze = async () => {
    if (!file) return;
    setCaptionIndex(0);
    setFakeProgress(8);
    setPhase("analyzing");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);
      const res = await fetch("/api/import/analyze", {
        method: "POST",
        body: form,
      });
      const body = (await readJson(res)) as ApiError & {
        result?: AnalysisResult;
      };
      if (!res.ok || !body.result) {
        toast.error(body.error ?? "The analysis failed. Please try again.", {
          description: body.issues?.slice(0, 3).join(" · "),
          duration: 8000,
        });
        setPhase("select");
        return;
      }
      setAnalysis(body.result);
      setPhase("preview");
    } catch {
      toast.error("Network error while analyzing the file. Please try again.");
      setPhase("select");
    }
  };

  const commitPayload = React.useMemo(() => {
    if (!analysis) return null;
    if (analysis.mode === "price_list") {
      const rows = analysis.rows
        .filter((r) => r.change !== "unchanged")
        .map((r) => ({
          prCode: r.prCode,
          name: r.name,
          caviarType: r.caviarType,
          gramsPerUnit: r.gramsPerUnit,
          unitCost: r.unitCost,
          currency: r.currency,
          matchedProductId: r.matchedProductId,
        }));
      return rows.length ? { mode: analysis.mode, rows } : null;
    }
    if (analysis.mode === "stock_take") {
      const rows = analysis.rows
        .filter((r) => r.deltaTins !== 0)
        .map((r) => ({ productId: r.productId, countedTins: r.countedTins }));
      return rows.length ? { mode: analysis.mode, rows } : null;
    }
    const rows = analysis.rows.map((r) => ({
      productId: r.productId,
      date: r.date,
      tins: r.tins,
      channel: r.channel,
      note: r.note,
    }));
    return rows.length ? { mode: analysis.mode, rows } : null;
  }, [analysis]);

  const confirmLabel = React.useMemo(() => {
    if (!analysis || !commitPayload) return "Nothing to write";
    const n = commitPayload.rows.length;
    if (analysis.mode === "price_list")
      return `Write ${n} product change${n === 1 ? "" : "s"}`;
    if (analysis.mode === "stock_take")
      return `Apply ${n} adjustment${n === 1 ? "" : "s"}`;
    return `Record ${n} sales row${n === 1 ? "" : "s"}`;
  }, [analysis, commitPayload]);

  const commit = async () => {
    if (!commitPayload) return;
    setPhase("committing");
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(commitPayload),
      });
      const body = (await readJson(res)) as ApiError & Partial<CommitResult>;
      if (!res.ok) {
        toast.error(body.error ?? "The import could not be written.", {
          description: body.issues?.slice(0, 3).join(" · "),
          duration: 8000,
        });
        setPhase("preview");
        return;
      }
      const result: CommitResult = {
        created: body.created ?? 0,
        updated: body.updated ?? 0,
        movements: body.movements ?? 0,
        warnings: body.warnings ?? [],
      };
      setCommitResult(result);
      setPhase("done");
      router.refresh();
      if (result.warnings.length > 0) {
        toast.warning(
          `Import finished with ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"} — see the summary.`
        );
      } else {
        toast.success("Import written successfully.");
      }
    } catch {
      toast.error("Network error while writing the import. Nothing was saved.");
      setPhase("preview");
    }
  };

  // ------------------------------------------------------------------ render

  if (phase === "analyzing") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-gold-deep" />
            Analyzing {file?.name}
          </CardTitle>
          <CardDescription>
            {MODE_META[mode].label} — nothing is written until you confirm.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={fakeProgress} aria-label="Analysis progress" />
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {ANALYZE_CAPTIONS[captionIndex]}
          </p>
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="size-4" /> Start over
          </Button>
        </CardContent>
      </Card>
    );
  }

  if ((phase === "preview" || phase === "committing") && analysis) {
    const committing = phase === "committing";
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Review before writing</CardTitle>
            <CardDescription>
              {MODE_META[analysis.mode].label} from {file?.name} —{" "}
              {analysis.rows.length} row{analysis.rows.length === 1 ? "" : "s"}{" "}
              understood
              {analysis.unmatched.length > 0
                ? `, ${analysis.unmatched.length} unmatched`
                : ""}
              . Nothing has been saved yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <NoticesAlert notices={analysis.notices} />
            <UnmatchedAlert unmatched={analysis.unmatched} />
            {analysis.mode === "price_list" ? (
              <PriceListPreview rows={analysis.rows} currency={currency} />
            ) : analysis.mode === "stock_take" ? (
              <StockTakePreview rows={analysis.rows} />
            ) : (
              <SalesPreview rows={analysis.rows} />
            )}
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="outline" onClick={reset} disabled={committing}>
                <RotateCcw className="size-4" /> Start over
              </Button>
              <Button
                variant="gold"
                onClick={commit}
                disabled={!commitPayload || committing}
              >
                {committing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Writing…
                  </>
                ) : (
                  confirmLabel
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "done" && commitResult) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-success" /> Import complete
          </CardTitle>
          <CardDescription>
            {MODE_META[mode].label} from {file?.name}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Created", value: commitResult.created },
              { label: "Updated", value: commitResult.updated },
              { label: "Movements", value: commitResult.movements },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-border bg-pearl p-3 text-center"
              >
                <div className="font-display text-2xl tnum">{stat.value}</div>
                <div className="text-xs text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
          {commitResult.warnings.length > 0 ? (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertTitle>Warnings</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {commitResult.warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="gold">
              <Link href="/inventory">
                View inventory <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/purchase-orders">Purchase orders</Link>
            </Button>
            <Button variant="ghost" onClick={reset}>
              <RotateCcw className="size-4" /> Import another file
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // phase === "select"
  return (
    <div className="space-y-5">
      {!aiConfigured ? (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>AI analysis is unavailable</AlertTitle>
          <AlertDescription>{aiMessage}</AlertDescription>
        </Alert>
      ) : null}

      <section aria-label="Step 1: choose what you are importing">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          1 · What are you importing?
        </h2>
        <ModeCards selected={mode} onSelect={setMode} />
      </section>

      <section aria-label="Step 2: choose a file">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          2 · Choose a file
        </h2>
        <Dropzone file={file} onFile={setFile} />
      </section>

      <div className="flex items-center gap-3">
        <Button
          variant="gold"
          size="lg"
          disabled={!file || !aiConfigured}
          onClick={analyze}
        >
          <Sparkles className="size-4" /> Analyze file
        </Button>
        <p className="text-xs text-muted-foreground">
          You will review everything before anything is written.
        </p>
      </div>
    </div>
  );
}
