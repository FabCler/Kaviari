"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CampaignCalendar } from "@/components/marketing/campaign-calendar";
import { CampaignCard } from "@/components/marketing/campaign-card";
import { CampaignFormDialog } from "@/components/marketing/campaign-form-dialog";
import { ContentStudio } from "@/components/marketing/content-studio";
import { LogResultsDialog } from "@/components/marketing/log-results-dialog";
import type {
  AssetView,
  CampaignPrefill,
  CampaignView,
  ProductOption,
} from "@/components/marketing/types";

export function MarketingView({
  campaigns,
  products,
  assets,
  currency,
  month,
  prefill,
  aiConfigured,
  aiUnavailableMessage,
}: {
  campaigns: CampaignView[];
  products: ProductOption[];
  assets: AssetView[];
  currency: string;
  month: string;
  prefill: CampaignPrefill | null;
  aiConfigured: boolean;
  aiUnavailableMessage: string;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState(prefill ? "campaigns" : "calendar");
  const [formOpen, setFormOpen] = React.useState(Boolean(prefill));
  const [editing, setEditing] = React.useState<CampaignView | null>(null);
  const [activePrefill, setActivePrefill] =
    React.useState<CampaignPrefill | null>(prefill);
  const [resultsFor, setResultsFor] = React.useState<CampaignView | null>(null);
  const [resultsOpen, setResultsOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<CampaignView | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  function openCreate() {
    setEditing(null);
    setActivePrefill(null);
    setFormOpen(true);
  }

  function openEdit(campaign: CampaignView) {
    setEditing(campaign);
    setActivePrefill(null);
    setFormOpen(true);
  }

  function openResults(campaign: CampaignView) {
    setResultsFor(campaign);
    setResultsOpen(true);
  }

  function onFormOpenChange(open: boolean) {
    setFormOpen(open);
    if (!open && activePrefill) {
      // Clear the ?promoteLot param so the dialog doesn't re-open on refresh.
      setActivePrefill(null);
      router.replace("/marketing", { scroll: false });
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${deleting.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Delete failed");
      }
      toast.success("Campaign deleted");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  const sortedCampaigns = React.useMemo(
    () =>
      [...campaigns].sort(
        (a, b) =>
          new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      ),
    [campaigns]
  );

  return (
    <div>
      <Tabs value={tab} onValueChange={setTab}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="studio">Content studio</TabsTrigger>
          </TabsList>
          <Button variant="gold" size="sm" onClick={openCreate}>
            <Plus aria-hidden /> New campaign
          </Button>
        </div>

        <TabsContent value="calendar">
          <CampaignCalendar
            campaigns={campaigns}
            month={month}
            onSelect={openEdit}
          />
        </TabsContent>

        <TabsContent value="campaigns">
          {sortedCampaigns.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
              <p className="font-display text-lg text-foreground">
                No campaigns yet
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Plan events, promotions and tastings — then log results to
                learn what sells caviar.
              </p>
              <Button variant="gold" className="mt-4" onClick={openCreate}>
                <Plus aria-hidden /> Plan your first campaign
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sortedCampaigns.map((c) => (
                <CampaignCard
                  key={c.id}
                  campaign={c}
                  currency={currency}
                  onEdit={openEdit}
                  onLogResults={openResults}
                  onDelete={setDeleting}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="studio">
          <ContentStudio
            campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
            products={products}
            initialAssets={assets}
            aiConfigured={aiConfigured}
            aiUnavailableMessage={aiUnavailableMessage}
          />
        </TabsContent>
      </Tabs>

      <CampaignFormDialog
        open={formOpen}
        onOpenChange={onFormOpenChange}
        campaign={editing}
        prefill={activePrefill}
        products={products}
        aiConfigured={aiConfigured}
        onSaved={() => {
          if (activePrefill) {
            setActivePrefill(null);
            router.replace("/marketing", { scroll: false });
          }
          router.refresh();
        }}
      />

      <LogResultsDialog
        campaign={resultsFor}
        open={resultsOpen}
        onOpenChange={setResultsOpen}
        onSaved={() => router.refresh()}
      />

      <Dialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Delete campaign</DialogTitle>
            <DialogDescription>
              {deleting
                ? `"${deleting.name}" and its links will be removed. Saved content assets are kept.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteBusy}
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
