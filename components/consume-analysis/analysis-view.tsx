"use client";

import { useMemo, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CAVIAR_TYPES } from "@/lib/domain";
import { formatGrams, formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  buildAnalysis,
  presetWindow,
  WEEKLY_FORECAST_NOTE,
} from "@/components/consume-analysis/aggregate";
import { AnalysisChart } from "@/components/consume-analysis/analysis-chart";
import { AnalysisTable } from "@/components/consume-analysis/analysis-table";
import { FilterBar, type FilterBarState } from "@/components/consume-analysis/filter-bar";
import { ForecastTools } from "@/components/consume-analysis/forecast-tools";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PERIOD_PRESETS,
  type AnalysisData,
  type AnalysisFilters,
  type ChartStyle,
  type ForecastEditorData,
  type Granularity,
} from "@/components/consume-analysis/types";

function Kpi({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <div className="mt-1.5 text-sm">{children}</div>
      </CardContent>
    </Card>
  );
}

export function AnalysisView({
  data,
  forecastEditor,
  now,
}: {
  data: AnalysisData;
  forecastEditor: ForecastEditorData;
  now: string;
}) {
  const nowDate = useMemo(() => new Date(now), [now]);

  const availableTypes = useMemo(() => {
    const present = new Set(
      data.products.map((p) => p.caviarType).filter((t): t is string => t != null)
    );
    return CAVIAR_TYPES.filter((t) => present.has(t));
  }, [data.products]);

  const [state, setState] = useState<FilterBarState>(() => ({
    granularity: "monthly" as Granularity,
    period: "6m",
    scope: "total",
    types: [...availableTypes],
    category: "Caviar",
    personId: "all",
    compare: false,
  }));
  const [showAll, setShowAll] = useState(false);
  const [chartStyle, setChartStyle] = useState<ChartStyle>("bar");
  /** "all" or a bucket key of the CURRENT granularity/period. */
  const [tableBucket, setTableBucket] = useState("all");
  const [exporting, setExporting] = useState(false);

  const onFilterChange = (patch: Partial<FilterBarState>) => {
    // Bucket keys change shape with granularity/period — zoom back out.
    if (patch.granularity !== undefined || patch.period !== undefined) {
      setTableBucket("all");
    }
    setState((prev) => ({ ...prev, ...patch }));
  };

  const filters: AnalysisFilters = useMemo(
    () => ({
      granularity: state.granularity,
      window: presetWindow(state.period, state.granularity, nowDate),
      tableBucket,
      scope: state.scope,
      types: state.types.filter((t): t is (typeof CAVIAR_TYPES)[number] =>
        (CAVIAR_TYPES as readonly string[]).includes(t)
      ),
      category: state.category as AnalysisFilters["category"],
      personId: state.personId,
      compare: state.compare,
      showAll,
    }),
    [state, tableBucket, showAll, nowDate]
  );

  const result = useMemo(
    () => buildAnalysis(data, filters, nowDate),
    [data, filters, nowDate]
  );

  const windowLabel =
    PERIOD_PRESETS.find((p) => p.id === state.period)?.short ?? state.period;

  async function downloadExcel() {
    setExporting(true);
    try {
      const res = await fetch("/api/exports/consumption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? "The export failed — please try again.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `consumption_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The export failed — please try again."
      );
    } finally {
      setExporting(false);
    }
  }

  const { kpis } = result;

  return (
    <div className="space-y-6">
      {/* Filter bar — everything below adapts to it. */}
      <Card className="py-4">
        <CardContent className="px-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <FilterBar
              state={state}
              onChange={onFilterChange}
              availableTypes={availableTypes}
              people={data.people}
            />
            <Button
              variant="gold"
              onClick={downloadExcel}
              disabled={exporting}
              className="shrink-0 self-start"
            >
              {exporting ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <FileDown aria-hidden />
              )}
              {exporting ? "Preparing…" : "Download Excel"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Mini-dashboard */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`Total consumed (${windowLabel})`}>
          <span className="font-semibold tnum">{formatNumber(kpis.totalUnits)} units</span>
          {kpis.totalGrams > 0 ? (
            <span className="text-muted-foreground tnum">
              {" "}
              · {formatGrams(kpis.totalGrams)}
            </span>
          ) : null}
        </Kpi>
        <Kpi label="Avg per week">
          <span className="font-semibold tnum">{formatNumber(kpis.avgPerWeek)}</span>{" "}
          <span className="text-muted-foreground">units/wk</span>
        </Kpi>
        <Kpi label="Best-selling caviar type">
          {kpis.bestType ? (
            <>
              <span className="font-semibold">{kpis.bestType}</span>{" "}
              <span className="text-muted-foreground tnum">
                ({formatNumber(kpis.bestTypeUnits)} units)
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">No caviar consumption</span>
          )}
        </Kpi>
        <Kpi label={`Forecast (${windowLabel})`}>
          {kpis.forecastTotal > 0 ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold tnum">
                {formatNumber(kpis.forecastTotal)} units
              </span>
              {state.compare && kpis.attainmentPct != null ? (
                <Badge variant={kpis.attainmentPct > 100 ? "warning" : "seafoam"}>
                  {kpis.attainmentPct}% attained
                </Badge>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">No forecast in window</span>
          )}
        </Kpi>
      </div>

      {/* Chart */}
      <Card className="py-4">
        <CardContent className="px-4">
          <div className="mb-2 flex justify-end">
            <Tabs
              value={chartStyle}
              onValueChange={(v) => setChartStyle(v as ChartStyle)}
            >
              <TabsList aria-label="Chart style">
                <TabsTrigger value="line">Line</TabsTrigger>
                <TabsTrigger value="bar">Bar</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <AnalysisChart
            data={result.chartData}
            series={result.series}
            compare={state.compare}
            chartStyle={chartStyle}
            weeklyNote={
              state.compare && state.granularity === "weekly"
                ? WEEKLY_FORECAST_NOTE
                : null
            }
          />
        </CardContent>
      </Card>

      {/* Detailed table — follows the filters, plus its own period zoom */}
      <Card className="py-2">
        <CardContent className="px-2 sm:px-4">
          <AnalysisTable
            rows={result.rows}
            totals={result.totals}
            avgPerWeekTotal={result.totals.avgPerWeek}
            periodLabel={result.periodLabel}
            buckets={result.buckets}
            tableBucket={filters.tableBucket}
            onTableBucketChange={setTableBucket}
            showAll={showAll}
            onShowAllChange={setShowAll}
          />
        </CardContent>
      </Card>

      {/* Forecast editing & round-trip */}
      <ForecastTools
        hasForecasts={data.forecasts.length > 0}
        editor={forecastEditor}
      />
    </div>
  );
}
