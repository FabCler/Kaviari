"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Save, Sparkles, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CONTENT_TYPES, type ContentType } from "@/lib/domain";
import { formatDateShort } from "@/lib/format";
import {
  CONTENT_TYPE_LABELS,
  type AssetView,
  type CampaignView,
  type ProductOption,
} from "@/components/marketing/types";

const TONES = [
  { value: "refined", label: "Refined" },
  { value: "warm", label: "Warm" },
  { value: "playful", label: "Playful but elegant" },
] as const;

const LENGTHS = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
] as const;

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  } catch {
    toast.error("Could not copy — select the text manually");
  }
}

export function ContentStudio({
  campaigns,
  products,
  initialAssets,
  aiConfigured,
  aiUnavailableMessage,
}: {
  campaigns: Pick<CampaignView, "id" | "name">[];
  products: ProductOption[];
  initialAssets: AssetView[];
  aiConfigured: boolean;
  aiUnavailableMessage: string;
}) {
  const router = useRouter();
  const [type, setType] = React.useState<ContentType>("caption");
  const [campaignId, setCampaignId] = React.useState<string>("none");
  const [productIds, setProductIds] = React.useState<string[]>([]);
  const [tone, setTone] = React.useState<string>("refined");
  const [length, setLength] = React.useState<string>("medium");
  const [instructions, setInstructions] = React.useState("");
  const [generating, setGenerating] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [savedCurrent, setSavedCurrent] = React.useState(false);

  const [assets, setAssets] = React.useState<AssetView[]>(initialAssets);
  const [assetFilter, setAssetFilter] = React.useState<string>("all");

  const toggleProduct = (id: string) =>
    setProductIds((ids) =>
      ids.includes(id) ? ids.filter((p) => p !== id) : [...ids, id]
    );

  async function refreshAssets(filter = assetFilter) {
    const qs = filter !== "all" ? `?type=${filter}` : "";
    const res = await fetch(`/api/content/assets${qs}`);
    if (res.ok) {
      const data = (await res.json()) as {
        assets: {
          id: string;
          type: ContentType;
          text: string;
          createdByAI: boolean;
          createdAt: string;
          campaignId: string | null;
          campaign: { id: string; name: string } | null;
        }[];
      };
      setAssets(
        data.assets.map((a) => ({
          id: a.id,
          type: a.type,
          text: a.text,
          createdByAI: a.createdByAI,
          createdAt: a.createdAt,
          campaignId: a.campaignId,
          campaignName: a.campaign?.name ?? null,
        }))
      );
    }
  }

  async function generate() {
    setGenerating(true);
    setSavedCurrent(false);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          campaignId: campaignId === "none" ? null : campaignId,
          productIds,
          tone,
          length,
          instructions: instructions.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        throw new Error(data.error ?? "Generation failed");
      }
      setResult(data.text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function saveAsset() {
    if (!result) return;
    setSaving(true);
    try {
      const res = await fetch("/api/content/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          text: result,
          campaignId: campaignId === "none" ? null : campaignId,
          createdByAI: true,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Save failed");
      }
      toast.success("Saved to your content library");
      setSavedCurrent(true);
      await refreshAssets();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAsset(id: string) {
    try {
      const res = await fetch(`/api/content/assets/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setAssets((list) => list.filter((a) => a.id !== id));
      toast.success("Asset deleted");
      router.refresh();
    } catch {
      toast.error("Delete failed");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="font-display">Content studio</CardTitle>
          <CardDescription>
            Draft on-brand copy for the cellar — captions, emails, menu
            descriptions and invitations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!aiConfigured ? (
            <Alert variant="gold">
              <Sparkles aria-hidden />
              <AlertTitle>AI is not configured</AlertTitle>
              <AlertDescription>{aiUnavailableMessage}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="studio-type">Content type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as ContentType)}
              >
                <SelectTrigger id="studio-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {CONTENT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="studio-campaign">Campaign (optional)</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger id="studio-campaign" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No campaign</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="studio-tone">Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger id="studio-tone" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="studio-length">Length</Label>
              <Select value={length} onValueChange={setLength}>
                <SelectTrigger id="studio-length" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LENGTHS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Products (optional)</Label>
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-input bg-card p-2">
              {products.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-gold)]"
                    checked={productIds.includes(p.id)}
                    onChange={() => toggleProduct(p.id)}
                  />
                  <span className="truncate">{p.shortName}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="studio-instructions">
              Extra instructions (optional)
            </Label>
            <Textarea
              id="studio-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Mention the tasting on Friday, pair with champagne…"
            />
          </div>
          <Button
            variant="gold"
            onClick={generate}
            disabled={!aiConfigured || generating}
            className="w-full sm:w-auto"
          >
            <Sparkles aria-hidden />
            {generating ? "Writing…" : "Generate"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Result</CardTitle>
            <CardDescription>
              Review, copy, or save the generated copy as an asset.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="space-y-3">
                <div className="rounded-md border border-border bg-pearl p-4 text-sm leading-relaxed whitespace-pre-wrap">
                  {result}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(result)}
                  >
                    <Copy aria-hidden /> Copy
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={saveAsset}
                    disabled={saving || savedCurrent}
                  >
                    {savedCurrent ? <Check aria-hidden /> : <Save aria-hidden />}
                    {savedCurrent
                      ? "Saved"
                      : saving
                        ? "Saving…"
                        : "Save as asset"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {aiConfigured
                  ? "Generated copy will appear here."
                  : "Configure AI to start generating copy."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display">Saved assets</CardTitle>
            <CardDescription>Your ten most recent pieces.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="asset-filter">Filter by type</Label>
              <Select
                value={assetFilter}
                onValueChange={(v) => {
                  setAssetFilter(v);
                  void refreshAssets(v);
                }}
              >
                <SelectTrigger id="asset-filter" className="w-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {CONTENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {CONTENT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {assets.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No saved assets yet — generate something and save it.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {assets.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-md border border-border p-3"
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">
                        {CONTENT_TYPE_LABELS[a.type]}
                      </Badge>
                      {a.createdByAI ? (
                        <Badge variant="gold">AI</Badge>
                      ) : null}
                      {a.campaignName ? (
                        <Badge variant="outline">{a.campaignName}</Badge>
                      ) : null}
                      <span className="tnum ml-auto text-xs text-muted-foreground">
                        {formatDateShort(a.createdAt)}
                      </span>
                    </div>
                    <p className="line-clamp-3 text-sm whitespace-pre-wrap text-muted-foreground">
                      {a.text}
                    </p>
                    <div className="mt-2 flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Copy asset text"
                        onClick={() => copyToClipboard(a.text)}
                      >
                        <Copy />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete asset"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => deleteAsset(a.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
