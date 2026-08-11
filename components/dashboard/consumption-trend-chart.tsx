"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate, formatDateShort, formatGrams } from "@/lib/format";

export interface TrendPoint {
  /** yyyy-MM-dd */
  date: string;
  grams: number;
  avg7: number;
}

const AXIS_TICK = { fontSize: 12, fill: "var(--muted-foreground)" } as const;

export function ConsumptionTrendChart({ data }: { data: TrendPoint[] }) {
  const hasAny = data.some((d) => d.grams > 0);
  if (!hasAny) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No consumption recorded in the last 90 days.
      </div>
    );
  }
  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#E3DFD2" />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => formatDateShort(v)}
            axisLine={false}
            tickLine={false}
            tick={AXIS_TICK}
            minTickGap={48}
          />
          <YAxis
            tickFormatter={(v: number) => formatGrams(v)}
            axisLine={false}
            tickLine={false}
            tick={AXIS_TICK}
            width={52}
          />
          <Tooltip
            formatter={(value) => formatGrams(Number(value))}
            labelFormatter={(label) => formatDate(String(label))}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            iconType="plainline"
            formatter={(value: string) => (
              <span style={{ color: "var(--foreground)" }}>{value}</span>
            )}
          />
          <Line
            type="monotone"
            dataKey="grams"
            name="Daily consumption"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="avg7"
            name="7-day average"
            stroke="var(--chart-2)"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
