"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatGrams } from "@/lib/format";

export interface StockBarPoint {
  name: string;
  grams: number;
}

const AXIS_TICK = { fontSize: 12, fill: "var(--muted-foreground)" } as const;

export function StockByProductChart({ data }: { data: StockBarPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No stock on hand yet — receive a delivery to see it here.
      </div>
    );
  }
  const height = Math.max(220, data.length * 34 + 40);
  // Single-line truncated tick labels — the tooltip carries the full name.
  const truncate = (name: string) =>
    name.length > 26 ? `${name.slice(0, 25)}…` : name;
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid horizontal={false} stroke="#E3DFD2" />
          <XAxis
            type="number"
            tickFormatter={(v: number) => formatGrams(v)}
            axisLine={false}
            tickLine={false}
            tick={AXIS_TICK}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={168}
            axisLine={false}
            tickLine={false}
            tickFormatter={truncate}
            interval={0}
            tick={{ fontSize: 12, fill: "var(--foreground)" }}
          />
          <Tooltip
            formatter={(value) => formatGrams(Number(value))}
            cursor={{ fill: "rgba(15, 25, 43, 0.04)" }}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Bar
            dataKey="grams"
            name="On hand"
            fill="var(--chart-1)"
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
