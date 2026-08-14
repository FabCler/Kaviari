"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { monthLabel } from "@/components/consume-analysis/aggregate";
import type { ForecastEditorData } from "@/components/consume-analysis/types";

/**
 * In-app forecast editing: fix mistakes without re-uploading the Excel
 * template. Shows the CURRENT USER's saved monthly quantities in editable
 * cells; blank keeps the saved value, 0 clears it (same contract as the
 * template upload). Saves through PUT /api/forecasts.
 */
export function ForecastEditor({ editor }: { editor: ForecastEditorData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState(false);

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return editor.products;
    return editor.products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.prCode.toLowerCase().includes(q) ||
        (p.caviarType ?? "").toLowerCase().includes(q)
    );
  }, [editor.products, search]);

  const cellValue = (productId: string, month: string): string => {
    const key = `${productId}|${month}`;
    const edited = edits.get(key);
    if (edited !== undefined) return edited;
    const saved = editor.saved[key];
    return saved !== undefined ? String(saved) : "";
  };

  const setCell = (productId: string, month: string, value: string) => {
    setEdits((prev) => {
      const next = new Map(prev);
      next.set(`${productId}|${month}`, value);
      return next;
    });
  };

  /** Changed cells only. Blank cells are skipped (they keep the saved value). */
  const changedRows = ():
    | { rows: { productId: string; month: string; quantity: number }[] }
    | { error: string } => {
    const rows: { productId: string; month: string; quantity: number }[] = [];
    for (const [key, raw] of edits) {
      const value = raw.trim();
      if (value === "") continue; // blank keeps the saved value
      const quantity = Number(value);
      if (!Number.isFinite(quantity) || quantity < 0) {
        return { error: "Quantities must be numbers of 0 or more." };
      }
      const [productId, month] = key.split("|");
      const saved = editor.saved[key];
      if (saved !== undefined && saved === quantity) continue; // unchanged
      if (saved === undefined && quantity === 0) continue; // nothing to clear
      rows.push({ productId, month, quantity });
    }
    return { rows };
  };

  async function save() {
    const parsed = changedRows();
    if ("error" in parsed) {
      toast.error(parsed.error);
      return;
    }
    if (parsed.rows.length === 0) {
      toast.info("No forecast changes to save.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/forecasts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed.rows }),
      });
      const json: { updated?: number; deleted?: number; error?: string } | null =
        await res.json().catch(() => null);
      if (!res.ok || !json) {
        toast.error(json?.error ?? "Saving the forecasts failed — please try again.");
        return;
      }
      const updated = json.updated ?? 0;
      const deleted = json.deleted ?? 0;
      toast.success(
        `${updated} forecast${updated === 1 ? "" : "s"} saved` +
          (deleted > 0 ? `, ${deleted} cleared` : "")
      );
      setEdits(new Map());
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Saving the forecasts failed — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setEdits(new Map());
          setSearch("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil aria-hidden />
          Edit forecasts
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit forecasts</DialogTitle>
          <DialogDescription>
            Your saved monthly quantities, editable in place — blank keeps the
            saved value, 0 clears it. Totals in the analysis sum everyone&apos;s
            forecasts.
          </DialogDescription>
        </DialogHeader>

        {editor.products.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No active caviar or fish-roe products to forecast yet.
          </p>
        ) : (
          <>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by name, code or type…"
              aria-label="Search products"
              className="max-w-sm"
            />
            <div className="max-h-[50vh] overflow-auto rounded-md border">
              <table className="w-full min-w-max border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b text-left">
                    <th className="px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Product
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Unit
                    </th>
                    {editor.months.map((m) => (
                      <th
                        key={m}
                        className="px-3 py-2 text-right text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                      >
                        {monthLabel(m)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={2 + editor.months.length}
                        className="px-3 py-8 text-center text-muted-foreground"
                      >
                        No products match “{search.trim()}”.
                      </td>
                    </tr>
                  ) : (
                    visibleProducts.map((p) => (
                      <tr key={p.id} className="border-b last:border-b-0">
                        <td className="max-w-64 truncate px-3 py-1.5 font-medium" title={p.name}>
                          {p.name}
                          <span className="ml-2 text-xs text-muted-foreground tnum">
                            {p.prCode}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">{p.unit}</td>
                        {editor.months.map((m) => (
                          <td key={m} className="px-1.5 py-1.5 text-right">
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              inputMode="decimal"
                              value={cellValue(p.id, m)}
                              onChange={(e) => setCell(p.id, m, e.target.value)}
                              aria-label={`${p.name} — ${monthLabel(m)}`}
                              className="h-8 w-24 text-right tnum"
                            />
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="gold"
            onClick={save}
            disabled={saving || editor.products.length === 0}
          >
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
