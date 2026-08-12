"use client";

import * as React from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES } from "@/lib/domain";
import type { CampaignStatus, CampaignType } from "@/lib/domain";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_LABELS,
  type CampaignPrefill,
  type CampaignView,
  type ProductOption,
} from "@/components/marketing/types";

interface FormState {
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  startDate: string;
  endDate: string;
  budget: string;
  notes: string;
  productIds: string[];
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function initialForm(
  campaign: CampaignView | null,
  prefill: CampaignPrefill | null
): FormState {
  if (campaign) {
    return {
      name: campaign.name,
      type: campaign.type,
      status: campaign.status,
      startDate: toDateInput(campaign.startDate),
      endDate: toDateInput(campaign.endDate),
      budget: campaign.budget != null ? String(campaign.budget) : "",
      notes: campaign.notes ?? "",
      productIds: campaign.productIds,
    };
  }
  if (prefill) {
    return {
      name: prefill.name,
      type: prefill.type,
      status: prefill.status,
      startDate: toDateInput(prefill.startDate),
      endDate: toDateInput(prefill.endDate),
      budget: "",
      notes: prefill.notes,
      productIds: prefill.productIds,
    };
  }
  return {
    name: "",
    type: "event",
    status: "planned",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    budget: "",
    notes: "",
    productIds: [],
  };
}

export function CampaignFormDialog({
  open,
  onOpenChange,
  campaign,
  prefill,
  products,
  aiConfigured,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this campaign; otherwise it creates one. */
  campaign: CampaignView | null;
  /** Pre-filled values for a new campaign (expiry-driven promo flow). */
  prefill: CampaignPrefill | null;
  products: ProductOption[];
  aiConfigured: boolean;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">
            {campaign ? "Edit campaign" : "New campaign"}
          </DialogTitle>
          <DialogDescription>
            {campaign
              ? "Update the details of this campaign."
              : "Plan a marketing moment for the cellar."}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <CampaignForm
            key={campaign?.id ?? (prefill ? "prefill" : "new")}
            campaign={campaign}
            prefill={prefill}
            products={products}
            aiConfigured={aiConfigured}
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

function CampaignForm({
  campaign,
  prefill,
  products,
  aiConfigured,
  onCancel,
  onSaved,
}: {
  campaign: CampaignView | null;
  prefill: CampaignPrefill | null;
  products: ProductOption[];
  aiConfigured: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState<FormState>(() =>
    initialForm(campaign, prefill)
  );
  const [saving, setSaving] = React.useState(false);
  const [drafting, setDrafting] = React.useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleProduct = (id: string) =>
    setForm((f) => ({
      ...f,
      productIds: f.productIds.includes(id)
        ? f.productIds.filter((p) => p !== id)
        : [...f.productIds, id],
    }));

  async function draftCopy() {
    setDrafting(true);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "caption",
          productIds: form.productIds,
          tone: "refined",
          length: "short",
          instructions:
            prefill?.aiHint ??
            `Copy for a ${CAMPAIGN_TYPE_LABELS[form.type].toLowerCase()} campaign called "${form.name || "our next campaign"}".`,
        }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        throw new Error(data.error ?? "Generation failed");
      }
      const text = data.text;
      setForm((f) => ({
        ...f,
        notes: f.notes ? `${f.notes}\n\n${text}` : text,
      }));
      toast.success("Draft copy added to notes");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setDrafting(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Give the campaign a name");
      return;
    }
    if (!form.startDate) {
      toast.error("Pick a start date");
      return;
    }
    const budget = form.budget.trim() === "" ? null : Number(form.budget);
    if (budget != null && (!Number.isFinite(budget) || budget < 0)) {
      toast.error("Budget must be a positive number");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        status: form.status,
        startDate: form.startDate,
        endDate: form.endDate || null,
        budget,
        notes: form.notes.trim() || null,
        productIds: form.productIds,
      };
      const res = await fetch(
        campaign ? `/api/campaigns/${campaign.id}` : "/api/campaigns",
        {
          method: campaign ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Save failed");
      }
      toast.success(campaign ? "Campaign updated" : "Campaign created");
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
        <Label htmlFor="campaign-name">Name</Label>
        <Input
          id="campaign-name"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Autumn oscietra tasting"
          maxLength={200}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="campaign-type">Type</Label>
          <Select
            value={form.type}
            onValueChange={(v) => set("type", v as CampaignType)}
          >
            <SelectTrigger id="campaign-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAMPAIGN_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {CAMPAIGN_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="campaign-status">Status</Label>
          <Select
            value={form.status}
            onValueChange={(v) => set("status", v as CampaignStatus)}
          >
            <SelectTrigger id="campaign-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAMPAIGN_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {CAMPAIGN_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="campaign-start">Start date</Label>
          <Input
            id="campaign-start"
            type="date"
            value={form.startDate}
            onChange={(e) => set("startDate", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="campaign-end">End date</Label>
          <Input
            id="campaign-end"
            type="date"
            value={form.endDate}
            min={form.startDate || undefined}
            onChange={(e) => set("endDate", e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="campaign-budget">Budget (optional)</Label>
        <Input
          id="campaign-budget"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={form.budget}
          onChange={(e) => set("budget", e.target.value)}
          placeholder="500"
          className="tnum"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Linked products</Label>
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-input bg-card p-2">
          {products.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">
              No active products.
            </p>
          ) : (
            products.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-accent"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-gold)]"
                  checked={form.productIds.includes(p.id)}
                  onChange={() => toggleProduct(p.id)}
                />
                <span className="truncate">{p.shortName}</span>
              </label>
            ))
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="campaign-notes">Notes</Label>
          {aiConfigured ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={draftCopy}
              disabled={drafting}
              className="text-gold-deep"
            >
              <Sparkles aria-hidden />
              {drafting ? "Drafting…" : "Draft copy with AI"}
            </Button>
          ) : null}
        </div>
        <Textarea
          id="campaign-notes"
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="Angle, audience, offer…"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="gold" disabled={saving}>
          {saving ? "Saving…" : campaign ? "Save changes" : "Create campaign"}
        </Button>
      </DialogFooter>
    </form>
  );
}
