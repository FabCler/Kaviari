"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Sparkles button that asks the AI to explain a replenishment suggestion.
 * The explanation is fetched lazily on first open; an unconfigured AI key
 * degrades to a friendly notice.
 */
export function ExplainPopover({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    if (explanation || notice || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/planner/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        explanation?: string;
        error?: string;
      };
      if (res.ok && data.explanation) {
        setExplanation(data.explanation);
      } else {
        setNotice(data.error ?? "The explanation could not be generated.");
      }
    } catch {
      setNotice("The explanation could not be generated.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-gold-deep hover:text-gold-deep"
          aria-label={`Explain suggestion for ${productName}`}
        >
          <Sparkles aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-gold-deep uppercase">
          <Sparkles className="size-3.5" aria-hidden /> Why this suggestion
        </p>
        <p className="mb-2 text-sm font-medium">{productName}</p>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Thinking through the numbers…
          </p>
        ) : notice ? (
          <p className="text-sm text-muted-foreground">{notice}</p>
        ) : explanation ? (
          <p className="text-sm leading-relaxed">{explanation}</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
