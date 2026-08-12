import Link from "next/link";
import { format, startOfDay, subDays } from "date-fns";
import {
  ArrowRight,
  CalendarClock,
  FileUp,
  PackageCheck,
  UtensilsCrossed,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getStockOverview } from "@/lib/stock";
import { getPlannerData } from "@/lib/planner";
import {
  CHANNELS,
  CHANNEL_LABELS,
  DEMAND_MOVEMENT_TYPES,
  OPEN_PO_STATUSES,
  type Channel,
} from "@/lib/domain";
import {
  formatDate,
  formatGrams,
  formatMoney,
  formatNumber,
  formatWeeks,
  shortProductName,
} from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ConsumptionTrendChart,
  type DailyDemandPoint,
  type ForecastMonthPoint,
} from "@/components/dashboard/consumption-trend-chart";
import {
  StockByProductChart,
  type StockBarPoint,
} from "@/components/dashboard/stock-by-product-chart";
import {
  ChannelDonutChart,
  type ChannelSlice,
} from "@/components/dashboard/channel-donut-chart";

// ~185 days covers 13 full ISO weeks and 6 full months for the trend chart.
const TREND_DAYS = 185;

function StatCard({
  label,
  value,
  sub,
  tone = "default",
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "danger" | "warning";
  href?: string;
}) {
  const valueColor =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-warning"
        : "text-foreground";
  const body = (
    <Card className="h-full gap-2 py-4 transition-shadow hover:shadow-md">
      <CardContent className="px-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p
          className={`font-display tnum mt-1.5 text-2xl font-medium lg:text-3xl ${valueColor}`}
        >
          {value}
        </p>
        {sub ? (
          <p className="tnum mt-1 text-xs text-muted-foreground">{sub}</p>
        ) : null}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link
      href={href}
      className="block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring/60 outline-none"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function DashboardPage() {
  const now = new Date();
  const trendStart = startOfDay(subDays(now, TREND_DAYS - 1));
  const channelStart = subDays(now, 30);
  // Forecast months are stored as UTC midnight on the 1st. Fetch one month of
  // slack on each side of the 6-month trend window so local/UTC month
  // boundaries never drop a bucket; the chart picks what each view needs.
  const forecastMonthGte = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1)
  );
  const forecastMonthLte = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  );

  const [overview, planner, openPoLines, demandMovements, forecastMonths] =
    await Promise.all([
      getStockOverview({ now }),
      getPlannerData(now),
      prisma.purchaseOrderLine.findMany({
        where: { purchaseOrder: { status: { in: [...OPEN_PO_STATUSES] } } },
        select: { quantityTins: true, unitCost: true },
      }),
      prisma.stockMovement.findMany({
        where: {
          type: { in: [...DEMAND_MOVEMENT_TYPES] },
          date: { gte: trendStart, lte: now },
        },
        select: { date: true, quantityTins: true, channel: true },
      }),
      prisma.forecast.groupBy({
        by: ["month"],
        where: { month: { gte: forecastMonthGte, lte: forecastMonthLte } },
        _sum: { quantity: true },
      }),
    ]);

  const { settings, totals } = overview;
  const currency = settings.currency;

  // --- Consumption trend: daily unit aggregates, grouped client-side --------
  const unitsByDay = new Map<string, number>();
  for (const m of demandMovements) {
    const key = format(m.date, "yyyy-MM-dd");
    unitsByDay.set(key, (unitsByDay.get(key) ?? 0) + Math.abs(m.quantityTins));
  }
  const trend: DailyDemandPoint[] = [...unitsByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, units]) => ({ date, units: Math.round(units * 100) / 100 }));

  // --- Forecast: monthly totals summed across ALL users ---------------------
  const forecast: ForecastMonthPoint[] = forecastMonths
    .map((row) => ({
      month: `${row.month.getUTCFullYear()}-${String(
        row.month.getUTCMonth() + 1
      ).padStart(2, "0")}`,
      units: Math.round((row._sum.quantity ?? 0) * 100) / 100,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // --- Consumption by channel, last 30 days, units --------------------------
  const channelTotals = new Map<Channel, number>();
  for (const m of demandMovements) {
    if (m.date < channelStart) continue;
    const channel = m.channel as Channel | null;
    if (!channel || !CHANNELS.includes(channel)) continue;
    channelTotals.set(
      channel,
      (channelTotals.get(channel) ?? 0) + Math.abs(m.quantityTins)
    );
  }
  const channelData: ChannelSlice[] = CHANNELS.map((channel) => ({
    channel,
    label: CHANNEL_LABELS[channel],
    units: Math.round((channelTotals.get(channel) ?? 0) * 10) / 10,
  }));

  // --- Stock by product (top 10 by on-hand units) ----------------------------
  // Compact single-line labels for axis ticks (the tooltip shows the full name).
  const chartLabel = (name: string) =>
    shortProductName(name)
      .replace(/\((\d+)\s*g(?:r|m)?\s*\/\s*tin\)/i, "· $1 g")
      .replace(/\s*-\s*(\d+)\s*g(?:r|m)?\b/i, " · $1 g")
      .replace(/\[unpasteurized\]/i, "unpast.")
      .replace(/\((?:le bua|zuma|villa)[^)]*\)/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  const stockBars: StockBarPoint[] = overview.rows
    .filter((row) => row.onHandUnits > 0)
    .sort((a, b) => b.onHandUnits - a.onHandUnits)
    .slice(0, 10)
    .map((row) => ({
      name: chartLabel(row.product.name),
      fullName: row.product.name,
      unit: row.product.unit,
      units: Math.round(row.onHandUnits * 10) / 10,
    }));

  // --- KPIs -------------------------------------------------------------------
  const openPoValue = openPoLines.reduce(
    (sum, line) => sum + line.quantityTins * line.unitCost,
    0
  );
  const coverWeeks = totals.daysOfCover == null ? null : totals.daysOfCover / 7;
  const nextOrderValue =
    planner.daysUntilOrder == null
      ? "Due now"
      : planner.daysUntilOrder < 0
        ? "OVERDUE"
        : planner.daysUntilOrder === 0
          ? "Today"
          : `in ${planner.daysUntilOrder}d`;
  const nextOrderTone: "default" | "danger" | "warning" = planner.orderDue
    ? "danger"
    : planner.daysUntilOrder != null && planner.daysUntilOrder <= 3
      ? "warning"
      : "default";

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Cellar overview — ${formatDate(now)}`}
      />

      {/* Quick actions */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Button variant="gold" size="lg" asChild>
          <Link href="/consume?log=1">
            <UtensilsCrossed />
            Log consumption
          </Link>
        </Button>
        <Button variant="outline" size="lg" asChild>
          <Link href="/purchase-orders?receive=1">
            <PackageCheck />
            Receive delivery
          </Link>
        </Button>
        <Button variant="outline" size="lg" asChild>
          <Link href="/import">
            <FileUp />
            Upload file
          </Link>
        </Button>
      </div>

      {/* Alerts */}
      {planner.orderDue && (
        <div className="mb-6">
          <Alert variant="gold">
            <CalendarClock className="size-4" />
            <AlertTitle>Order review is due</AlertTitle>
            <AlertDescription>
              <span>
                {planner.daysUntilOrder != null && planner.daysUntilOrder < 0
                  ? `The ${settings.reviewPeriodDays}-day order cycle is ${Math.abs(planner.daysUntilOrder)} day${Math.abs(planner.daysUntilOrder) === 1 ? "" : "s"} overdue.`
                  : "It is time to review stock and place the next Kaviari order."}{" "}
                <Link
                  href="/planner"
                  className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
                >
                  Open the order planner
                  <ArrowRight className="size-3" />
                </Link>
              </span>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total stock"
          value={`${formatNumber(totals.units, 0)} units`}
          sub={`${formatGrams(totals.grams)} · ${formatMoney(totals.value, currency)}`}
        />
        <StatCard
          label="Cover"
          value={formatWeeks(coverWeeks)}
          sub="at current usage"
          tone={
            coverWeeks != null && coverWeeks < 2
              ? coverWeeks < 1
                ? "danger"
                : "warning"
              : "default"
          }
        />
        <StatCard
          label="Next order"
          value={nextOrderValue}
          sub={
            planner.nextOrderDate
              ? formatDate(planner.nextOrderDate)
              : "no order recorded yet"
          }
          tone={nextOrderTone}
          href="/planner"
        />
        <StatCard
          label="Open POs"
          value={planner.openPoCount}
          sub={formatMoney(openPoValue, currency)}
          href="/purchase-orders"
        />
      </div>

      {/* Charts */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Consumption vs forecast</CardTitle>
            <CardDescription>
              Units consumed per period against the team forecast
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConsumptionTrendChart
              data={trend}
              forecast={forecast}
              endDate={format(now, "yyyy-MM-dd")}
            />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Stock by product</CardTitle>
              <CardDescription>
                On-hand units, top {Math.min(10, stockBars.length) || 10}{" "}
                products
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StockByProductChart data={stockBars} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Consumption by channel</CardTitle>
              <CardDescription>Last 30 days, units by channel</CardDescription>
            </CardHeader>
            <CardContent>
              <ChannelDonutChart data={channelData} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
