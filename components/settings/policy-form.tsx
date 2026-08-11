"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CURRENCIES = ["EUR", "USD", "GBP", "THB"] as const;

interface PolicyValues {
  reviewPeriodDays: number;
  leadTimeDays: number;
  safetyStockDays: number;
  aduWindowDays: number;
  expiryAlertDays: number;
  currency: string;
}

const FIELDS: {
  key: keyof Omit<PolicyValues, "currency">;
  label: string;
  hint: string;
}[] = [
  {
    key: "reviewPeriodDays",
    label: "Review period (R, days)",
    hint: "How often you place an order",
  },
  {
    key: "leadTimeDays",
    label: "Lead time (L, days)",
    hint: "Order placed to tins in the fridge",
  },
  {
    key: "safetyStockDays",
    label: "Safety stock (days)",
    hint: "Buffer against surprises",
  },
  {
    key: "aduWindowDays",
    label: "ADU window (days)",
    hint: "History window for average daily usage",
  },
  {
    key: "expiryAlertDays",
    label: "Expiry alert (days)",
    hint: "Flag lots expiring within this window",
  },
];

export function PolicyForm({ initial }: { initial: PolicyValues }) {
  const router = useRouter();
  const [values, setValues] = React.useState<Record<string, string>>({
    reviewPeriodDays: String(initial.reviewPeriodDays),
    leadTimeDays: String(initial.leadTimeDays),
    safetyStockDays: String(initial.safetyStockDays),
    aduWindowDays: String(initial.aduWindowDays),
    expiryAlertDays: String(initial.expiryAlertDays),
  });
  const [currency, setCurrency] = React.useState(initial.currency);
  const [saving, setSaving] = React.useState(false);

  const coverDays =
    (Number(values.leadTimeDays) || 0) +
    (Number(values.reviewPeriodDays) || 0) +
    (Number(values.safetyStockDays) || 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, number | string> = { currency };
    for (const field of FIELDS) {
      const n = Number(values[field.key]);
      if (!Number.isInteger(n) || n < 1 || n > 365) {
        toast.error(`${field.label} must be a whole number between 1 and 365`);
        return;
      }
      payload[field.key] = n;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Save failed");
      }
      toast.success("Replenishment policy saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={save} className="space-y-6">
        <CardHeader>
          <CardTitle className="font-display">Replenishment policy</CardTitle>
          <CardDescription>
            The (R,S) rule: every R days, order up to S = ADU × (L + R +
            safety). With your numbers that is{" "}
            <span className="tnum font-medium text-foreground">
              {coverDays} days of cover
            </span>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`policy-${field.key}`}>{field.label}</Label>
              <Input
                id={`policy-${field.key}`}
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                step={1}
                required
                value={values[field.key]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [field.key]: e.target.value }))
                }
                className="tnum"
              />
              <p className="text-xs text-muted-foreground">{field.hint}</p>
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="policy-currency">Display currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="policy-currency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Product costs stay in EUR; this sets display formatting.
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" variant="gold" disabled={saving}>
            {saving ? "Saving…" : "Save policy"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
