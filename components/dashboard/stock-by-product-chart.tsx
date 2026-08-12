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
import { formatNumber, formatUnits } from "@/lib/format";

export interface StockBarPoint {
  /** Compact single-line label, e.g. "Kristal · 125 g". */
  name: string;
  /** Full product name, shown in the tooltip. */
  fullName: string;
  /** Stock-keeping unit ("Tin" | "PC" | "KG" | "PK"). */
  unit: string;
  units: number;
}

const AXIS_TICK = { fontSize: 12, fill: "var(--muted-foreground)" } as const;
const LABEL_WIDTH = 172;
const LABEL_MAX_CHARS = 24;

// Truncated tick labels — the tooltip carries the full name.
const truncate = (name: string) =>
  name.length > LABEL_MAX_CHARS ? `${name.slice(0, LABEL_MAX_CHARS - 1)}…` : name;

/** Plain single-line <text> tick. Recharts' default tick wraps long category
 *  labels onto multiple lines inside the axis width; this never wraps. */
function ProductTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
}) {
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      fontSize={11}
      fill="var(--foreground)"
    >
      {truncate(String(payload?.value ?? ""))}
    </text>
  );
}

export function StockByProductChart({ data }: { data: StockBarPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No stock on hand yet — receive a delivery to see it here.
      </div>
    );
  }
  const height = Math.max(220, data.length * 34 + 40);
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
            tickFormatter={(v: number) => formatNumber(v, 0)}
            axisLine={false}
            tickLine={false}
            tick={AXIS_TICK}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={170}
            axisLine={false}
            tickLine={false}
            tickFormatter={truncate}
            interval={0}
            tick={{ fontSize: 12, fill: "var(--foreground)" }}
          />
          <Tooltip
            formatter={(value, _name, item) =>
              formatUnits(
                Number(value),
                (item?.payload as StockBarPoint | undefined)?.unit ?? "Tin"
              )
            }
            labelFormatter={(label, payload) =>
              (payload?.[0]?.payload as StockBarPoint | undefined)?.fullName ??
              String(label)
            }
            cursor={{ fill: "rgba(15, 25, 43, 0.04)" }}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Bar
            dataKey="units"
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
