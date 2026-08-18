"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "@/lib/format";
import type { AnalysisSeries, ChartRow } from "@/components/consume-analysis/aggregate";
import type { ChartStyle } from "@/components/consume-analysis/types";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;
/** Neutral for the folded "Other" series — never a categorical hue. */
const OTHER_COLOR = "#8a8778";
const FORECAST_COLOR = "var(--navy-700)";
/** N-1 overlay: a muted, lighter navy tone — dashed, never a series hue. */
const N1_COLOR = "#8fa1bd";

const AXIS_TICK = { fontSize: 12, fill: "var(--muted-foreground)" } as const;

/** Fixed-order color per series: chart-1..5 for types, neutral for "Other". */
export function seriesColor(index: number, id: string): string {
  if (id === "Other") return OTHER_COLOR;
  return CHART_COLORS[Math.min(index, CHART_COLORS.length - 1)];
}

function LegendSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  if (dashed) {
    return (
      <span
        aria-hidden
        className="inline-block h-0 w-4 border-t-2 border-dashed align-middle"
        style={{ borderColor: color }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 rounded-full align-middle"
      style={{ backgroundColor: color }}
    />
  );
}

export function AnalysisChart({
  data,
  series,
  compare,
  compareN1,
  chartStyle,
  weeklyNote,
}: {
  data: ChartRow[];
  series: AnalysisSeries[];
  compare: boolean;
  /** Overlay the same window one year earlier ("prev" data key). */
  compareN1: boolean;
  /** Consumption series as lines or bars; the overlays stay dashed lines. */
  chartStyle: ChartStyle;
  weeklyNote: string | null;
}) {
  const bars = chartStyle === "bar";
  const hasAny = data.some(
    (row) =>
      series.some((s) => Number(row[s.id] ?? 0) > 0) ||
      (compare && Number(row.forecast ?? 0) > 0) ||
      (compareN1 && Number(row.prev ?? 0) > 0)
  );

  if (!hasAny) {
    return (
      <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Nothing consumed in this window with the current filters — widen the
        period or adjust the filters above.
      </div>
    );
  }

  return (
    <div>
      <div className="h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#E3DFD2" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={AXIS_TICK}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(v: number) => formatNumber(v, 0)}
              axisLine={false}
              tickLine={false}
              tick={AXIS_TICK}
              width={44}
              allowDecimals={false}
            />
            <Tooltip
              formatter={(value, name) => [
                `${formatNumber(Number(value))} units`,
                String(name),
              ]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              cursor={
                bars ? { fill: "var(--muted)", opacity: 0.5 } : { stroke: "#E3DFD2" }
              }
            />
            {bars
              ? series.map((s, i) => (
                  <Bar
                    key={s.id}
                    dataKey={s.id}
                    name={s.label}
                    fill={seriesColor(i, s.id)}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={series.length === 1 ? 40 : 20}
                    isAnimationActive={false}
                  />
                ))
              : series.map((s, i) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.id}
                    name={s.label}
                    stroke={seriesColor(i, s.id)}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                ))}
            {compareN1 ? (
              <Line
                type="monotone"
                dataKey="prev"
                name="N-1"
                stroke={N1_COLOR}
                strokeWidth={2}
                strokeDasharray="3 3"
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ) : null}
            {compare ? (
              <Line
                type="monotone"
                dataKey="forecast"
                name="Forecast"
                stroke={FORECAST_COLOR}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* HTML legend — ink-colored labels, identity carried by the swatch. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
        {series.map((s, i) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1.5 text-xs text-foreground"
          >
            <LegendSwatch color={seriesColor(i, s.id)} />
            {s.label}
          </span>
        ))}
        {compareN1 ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
            <LegendSwatch color={N1_COLOR} dashed />
            N-1
          </span>
        ) : null}
        {compare ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
            <LegendSwatch color={FORECAST_COLOR} dashed />
            Forecast
          </span>
        ) : null}
      </div>
      {weeklyNote ? (
        <p className="mt-2 px-1 text-xs text-muted-foreground">{weeklyNote}</p>
      ) : null}
    </div>
  );
}
