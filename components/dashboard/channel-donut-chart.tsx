"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { formatGrams } from "@/lib/format";
import type { Channel } from "@/lib/domain";

export interface ChannelSlice {
  channel: Channel;
  label: string;
  grams: number;
}

/** Fixed channel -> color mapping (chart-1..4 in channel order). */
const CHANNEL_COLORS: Record<Channel, string> = {
  restaurant: "var(--chart-1)",
  retail: "var(--chart-2)",
  event: "var(--chart-3)",
  staff: "var(--chart-4)",
};

export function ChannelDonutChart({ data }: { data: ChannelSlice[] }) {
  const total = data.reduce((sum, s) => sum + s.grams, 0);
  if (total <= 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No consumption logged in the last 30 days.
      </div>
    );
  }
  const slices = data.filter((s) => s.grams > 0);
  return (
    <div>
      <div className="relative h-56 w-full sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="grams"
              nameKey="label"
              innerRadius="62%"
              outerRadius="88%"
              stroke="#ffffff"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((slice) => (
                <Cell
                  key={slice.channel}
                  fill={CHANNEL_COLORS[slice.channel]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatGrams(Number(value))}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          aria-hidden="true"
        >
          <span className="font-display tnum text-2xl font-medium text-foreground">
            {formatGrams(total)}
          </span>
          <span className="text-xs text-muted-foreground">last 30 days</span>
        </div>
      </div>
      {/* HTML legend: fixed channel order, ink-colored labels (never series
          color), values direct-labeled. */}
      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
        {data.map((slice) => (
          <li key={slice.channel} className="flex items-center gap-1.5">
            <span
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: CHANNEL_COLORS[slice.channel] }}
              aria-hidden="true"
            />
            <span className="text-foreground">{slice.label}</span>
            <span className="tnum text-muted-foreground">
              {formatGrams(slice.grams)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
