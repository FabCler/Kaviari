"use client";

import { CAVIAR_TYPES, PRODUCT_CATEGORIES } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAX_TYPE_SERIES, WEEKLY_FORECAST_NOTE } from "@/components/consume-analysis/aggregate";
import { seriesColor } from "@/components/consume-analysis/analysis-chart";
import {
  MONTHLY_WINDOWS,
  WEEKLY_WINDOWS,
  type ForecastPerson,
  type Granularity,
} from "@/components/consume-analysis/types";

export interface FilterBarState {
  granularity: Granularity;
  weeklyWindow: number;
  monthlyWindow: number;
  scope: "total" | "by_type";
  types: string[];
  category: string;
  personId: string;
  compare: boolean;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

export function FilterBar({
  state,
  onChange,
  availableTypes,
  people,
}: {
  state: FilterBarState;
  onChange: (patch: Partial<FilterBarState>) => void;
  /** Caviar types that actually occur in the loaded products. */
  availableTypes: string[];
  people: ForecastPerson[];
}) {
  const windows = state.granularity === "weekly" ? WEEKLY_WINDOWS : MONTHLY_WINDOWS;
  const windowValue = state.granularity === "weekly" ? state.weeklyWindow : state.monthlyWindow;

  // Chips mirror the chart's fixed-order color assignment.
  const orderedSelected = CAVIAR_TYPES.filter((t) => state.types.includes(t));
  const chipColor = (type: string): string | null => {
    const index = orderedSelected.indexOf(type as (typeof CAVIAR_TYPES)[number]);
    if (index === -1) return null;
    return index < MAX_TYPE_SERIES ? seriesColor(index, type) : seriesColor(0, "Other");
  };

  const toggleType = (type: string) => {
    if (state.types.includes(type)) {
      if (state.types.length === 1) return; // keep at least one series
      onChange({ types: state.types.filter((t) => t !== type) });
    } else {
      onChange({ types: [...state.types, type] });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <Field label="Granularity">
          <Tabs
            value={state.granularity}
            onValueChange={(v) =>
              onChange({ granularity: v as Granularity })
            }
          >
            <TabsList aria-label="Granularity">
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
            </TabsList>
          </Tabs>
        </Field>

        <Field label="Period">
          <Select
            value={String(windowValue)}
            onValueChange={(v) =>
              onChange(
                state.granularity === "weekly"
                  ? { weeklyWindow: Number(v) }
                  : { monthlyWindow: Number(v) }
              )
            }
          >
            <SelectTrigger size="sm" className="min-w-36" aria-label="Period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {windows.map((w) => (
                <SelectItem key={w} value={String(w)}>
                  Last {w} {state.granularity === "weekly" ? "weeks" : "months"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Scope">
          <Tabs
            value={state.scope}
            onValueChange={(v) => onChange({ scope: v as "total" | "by_type" })}
          >
            <TabsList aria-label="Scope">
              <TabsTrigger value="total">Total consumption</TabsTrigger>
              <TabsTrigger value="by_type">By caviar type</TabsTrigger>
            </TabsList>
          </Tabs>
        </Field>

        <Field label="Category">
          <Select
            value={state.category}
            onValueChange={(v) => onChange({ category: v })}
          >
            <SelectTrigger size="sm" className="min-w-32" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {PRODUCT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Forecast person">
          <Select
            value={state.personId}
            onValueChange={(v) => onChange({ personId: v })}
          >
            <SelectTrigger size="sm" className="min-w-32" aria-label="Forecast person">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All (sum)</SelectItem>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="flex h-8 items-center gap-2">
          <Switch
            id="compare-forecast"
            checked={state.compare}
            onCheckedChange={(v) => onChange({ compare: v })}
          />
          <Label
            htmlFor="compare-forecast"
            className="text-sm"
            title={state.granularity === "weekly" ? WEEKLY_FORECAST_NOTE : undefined}
          >
            Compare vs forecast
          </Label>
        </div>
      </div>

      {state.scope === "by_type" ? (
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Caviar types to compare"
        >
          {availableTypes.map((type) => {
            const selected = state.types.includes(type);
            const color = selected ? chipColor(type) : null;
            return (
              <button
                key={type}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleType(type)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 outline-none cursor-pointer",
                  selected
                    ? "border-gold/50 bg-gold/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {color ? (
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                ) : null}
                {type}
              </button>
            );
          })}
          <span className="ml-1 text-xs text-muted-foreground">
            Pick types to compare — the first {MAX_TYPE_SERIES} get their own
            color, the rest fold into “Other”.
          </span>
        </div>
      ) : null}
    </div>
  );
}
