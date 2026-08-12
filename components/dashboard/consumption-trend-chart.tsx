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
  addDays,
  addMonths,
  addWeeks,
  format,
  getDaysInMonth,
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

/** Monthly forecast total summed across ALL users, computed server-side. */
export interface ForecastMonthPoint {
  /** yyyy-MM */
  month: string;
  units: number;
}

type Grouping = "weekly" | "monthly";

interface PeriodPoint {
  label: string;
  units: number;
  forecast: number;
}

const WEEKS = 13;
const MONTHS = 6;
const AXIS_TICK = { fontSize: 12, fill: "var(--muted-foreground)" } as const;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Forecast for one period. Monthly buckets read the month total directly;
 * weekly buckets prorate per day — a monthly forecast M covering days d1..dN
 * contributes M/N for each of the week's days falling inside that month.
 * (Same proration as the consumption analysis page, kept local because the
 * dashboard buckets in local time while the analysis module buckets in UTC.)
 */
function periodForecast(
  byMonth: Map<string, number>,
  periodStart: Date,
  grouping: Grouping
): number {
  if (grouping === "monthly") {
    return byMonth.get(format(periodStart, "yyyy-MM")) ?? 0;
  }
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDays(periodStart, i);
    const monthly = byMonth.get(format(day, "yyyy-MM")) ?? 0;
    if (monthly > 0) total += monthly / getDaysInMonth(day);
  }
  return total;
}

function groupByPeriod(
  data: DailyDemandPoint[],
  forecastByMonth: Map<string, number>,
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
      units: round1(buckets.get(key) ?? 0),
      forecast: round1(periodForecast(forecastByMonth, periodStart, grouping)),
    });
  }
  return points;
}

export function ConsumptionTrendChart({
  data,
  forecast,
  endDate,
}: {
  data: DailyDemandPoint[];
  /** Per-month forecast totals (all users summed), yyyy-MM keys. */
  forecast: ForecastMonthPoint[];
  /** yyyy-MM-dd for "today" from the server, so grouping is deterministic. */
  endDate: string;
}) {
  const [grouping, setGrouping] = React.useState<Grouping>("weekly");

  const forecastByMonth = React.useMemo(
    () => new Map(forecast.map((f) => [f.month, f.units])),
    [forecast]
  );
  const points = React.useMemo(
    () => groupByPeriod(data, forecastByMonth, grouping, parseISO(endDate)),
    [data, forecastByMonth, grouping, endDate]
  );
  const hasAny = points.some((p) => p.units > 0 || p.forecast > 0);

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
          No consumption or forecast in the last{" "}
          {grouping === "weekly" ? `${WEEKS} weeks` : `${MONTHS} months`} — log
          usage or add a forecast to see the trend.
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
                name="Consumption"
                fill="var(--chart-1)"
                radius={[4, 4, 0, 0]}
                maxBarSize={18}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="forecast"
                name="Forecast"
                stroke="var(--chart-2)"
                strokeWidth={2}
                strokeDasharray="6 4"
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
