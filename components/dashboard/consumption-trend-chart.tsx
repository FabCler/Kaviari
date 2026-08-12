"use client";

import * as React from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  addMonths,
  addWeeks,
  format,
  parseISO,
  startOfISOWeek,
  startOfMonth,
  subMonths,
  subWeeks,
} from "date-fns";
import { formatTins } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Raw daily demand aggregate computed server-side (~185 days). */
export interface DailyDemandPoint {
  /** yyyy-MM-dd */
  date: string;
  /** Sum of abs(quantityTins) of demand movements that day. */
  units: number;
}

type Grouping = "weekly" | "monthly";

interface PeriodPoint {
  label: string;
  units: number;
  avg: number;
}

const WEEKS = 13;
const MONTHS = 6;
const AVG_WINDOW = 4;
const AXIS_TICK = { fontSize: 12, fill: "var(--muted-foreground)" } as const;

function groupByPeriod(
  data: DailyDemandPoint[],
  grouping: Grouping,
  end: Date
): PeriodPoint[] {
  const periodCount = grouping === "weekly" ? WEEKS : MONTHS;
  const startOfPeriod = grouping === "weekly" ? startOfISOWeek : startOfMonth;
  const firstPeriod =
    grouping === "weekly"
      ? subWeeks(startOfISOWeek(end), WEEKS - 1)
      : subMonths(startOfMonth(end), MONTHS - 1);

  const buckets = new Map<string, number>();
  for (const point of data) {
    const key = format(startOfPeriod(parseISO(point.date)), "yyyy-MM-dd");
    buckets.set(key, (buckets.get(key) ?? 0) + point.units);
  }

  const points: PeriodPoint[] = [];
  for (let i = 0; i < periodCount; i++) {
    const periodStart =
      grouping === "weekly" ? addWeeks(firstPeriod, i) : addMonths(firstPeriod, i);
    const key = format(periodStart, "yyyy-MM-dd");
    points.push({
      label: format(periodStart, grouping === "weekly" ? "d MMM" : "MMM"),
      units: Math.round((buckets.get(key) ?? 0) * 10) / 10,
      avg: 0,
    });
  }
  for (let i = 0; i < points.length; i++) {
    const window = points.slice(Math.max(0, i - (AVG_WINDOW - 1)), i + 1);
    const mean = window.reduce((sum, p) => sum + p.units, 0) / window.length;
    points[i].avg = Math.round(mean * 10) / 10;
  }
  return points;
}

export function ConsumptionTrendChart({
  data,
  endDate,
}: {
  data: DailyDemandPoint[];
  /** yyyy-MM-dd for "today" from the server, so grouping is deterministic. */
  endDate: string;
}) {
  const [grouping, setGrouping] = React.useState<Grouping>("weekly");

  const points = React.useMemo(
    () => groupByPeriod(data, grouping, parseISO(endDate)),
    [data, grouping, endDate]
  );
  const hasAny = points.some((p) => p.units > 0);
  const avgName = grouping === "weekly" ? "4-week average" : "4-month average";

  return (
    <div>
      {/* Grouping filter */}
      <div className="mb-3 flex justify-end">
        <div
          className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
          role="group"
          aria-label="Group consumption by period"
        >
          {(["weekly", "monthly"] as const).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={grouping === g}
              onClick={() => setGrouping(g)}
              className={cn(
                "h-8 rounded-md px-3 text-xs font-medium transition-colors sm:text-sm",
                grouping === g
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {g === "weekly" ? "Weekly" : "Monthly"}
            </button>
          ))}
        </div>
      </div>

      {!hasAny ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          No consumption recorded in the last{" "}
          {grouping === "weekly" ? `${WEEKS} weeks` : `${MONTHS} months`}.
        </div>
      ) : (
        <div className="h-64 w-full sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={points}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="#E3DFD2" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={AXIS_TICK}
                interval="preserveStartEnd"
                minTickGap={16}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={AXIS_TICK}
                width={40}
                allowDecimals={false}
              />
              <Tooltip
                formatter={(value) => formatTins(Number(value))}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                cursor={{ fill: "rgba(15, 25, 43, 0.04)" }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value: string) => (
                  <span style={{ color: "var(--foreground)" }}>{value}</span>
                )}
              />
              <Bar
                dataKey="units"
                name={grouping === "weekly" ? "Tins per week" : "Tins per month"}
                fill="var(--chart-1)"
                radius={[4, 4, 0, 0]}
                maxBarSize={18}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="avg"
                name={avgName}
                stroke="var(--chart-2)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
