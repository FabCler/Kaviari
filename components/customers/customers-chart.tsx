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

/** N-1 overlay: same muted navy as the consumption analysis chart. */
const N1_COLOR = "#8fa1bd";
const BAR_COLOR = "var(--chart-1)";
const AXIS_TICK = { fontSize: 12, fill: "var(--muted-foreground)" } as const;

export interface CustomersChartRow {
  label: string;
  current: number;
  prev: number;
}

export function CustomersChart({
  data,
  compareN1,
  yearLabel,
  prevYearLabel,
}: {
  data: CustomersChartRow[];
  compareN1: boolean;
  yearLabel: string;
  prevYearLabel: string;
}) {
  const hasAny = data.some(
    (row) => row.current > 0 || (compareN1 && row.prev > 0)
  );
  if (!hasAny) {
    return (
      <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-muted-foreground">
        No quantities for this selection — adjust the filters above.
      </div>
    );
  }

  return (
    <div>
      <div className="h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="#E3DFD2" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={AXIS_TICK}
              minTickGap={16}
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
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            />
            <Bar
              dataKey="current"
              name={yearLabel}
              fill={BAR_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              isAnimationActive={false}
            />
            {compareN1 ? (
              <Line
                type="monotone"
                dataKey="prev"
                name={prevYearLabel}
                stroke={N1_COLOR}
                strokeWidth={2}
                strokeDasharray="3 3"
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
        <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-full align-middle"
            style={{ backgroundColor: BAR_COLOR }}
          />
          {yearLabel}
        </span>
        {compareN1 ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
            <span
              aria-hidden
              className="inline-block h-0 w-4 border-t-2 border-dashed align-middle"
              style={{ borderColor: N1_COLOR }}
            />
            {prevYearLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
