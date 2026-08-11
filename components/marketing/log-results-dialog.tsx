"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CampaignView } from "@/components/marketing/types";

export function LogResultsDialog({
  campaign,
  open,
  onOpenChange,
  onSaved,
}: {
  campaign: CampaignView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Log results</DialogTitle>
          <DialogDescription>
            {campaign
              ? `How did "${campaign.name}" perform?`
              : "How did the campaign perform?"}
          </DialogDescription>
        </DialogHeader>
        {open && campaign ? (
          <ResultsForm
            key={campaign.id}
            campaign={campaign}
            onCancel={() => onOpenChange(false)}
            onSaved={() => {
              onOpenChange(false);
              onSaved();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ResultsForm({
  campaign,
  onCancel,
  onSaved,
}: {
  campaign: CampaignView;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [results, setResults] = React.useState(campaign.results ?? "");
  const [revenue, setRevenue] = React.useState(
    campaign.resultRevenue != null ? String(campaign.resultRevenue) : ""
  );
  const [saving, setSaving] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const revenueNumber = revenue.trim() === "" ? null : Number(revenue);
    if (
      revenueNumber != null &&
      (!Number.isFinite(revenueNumber) || revenueNumber < 0)
    ) {
      toast.error("Revenue must be a positive number");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results: results.trim() || null,
          resultRevenue: revenueNumber,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Save failed");
      }
      toast.success("Results logged");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="results-text">Results</Label>
        <Textarea
          id="results-text"
          value={results}
          onChange={(e) => setResults(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="Reach, bookings, tins sold, learnings…"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="results-revenue">Attributed revenue (optional)</Label>
        <Input
          id="results-revenue"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={revenue}
          onChange={(e) => setRevenue(e.target.value)}
          placeholder="1200"
          className="tnum"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="gold" disabled={saving}>
          {saving ? "Saving…" : "Save results"}
        </Button>
      </DialogFooter>
    </form>
  );
}
