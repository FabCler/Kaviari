import Link from "next/link";
import { addDays, format, startOfDay, subDays } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  FileUp,
  PackageCheck,
  UtensilsCrossed,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getStockOverview, getExpiringLots } from "@/lib/stock";
import { getPlannerData } from "@/lib/planner";
import {
  CHANNELS,
  DEMAND_MOVEMENT_TYPES,
  OPEN_PO_STATUSES,
  type Channel,
} from "@/lib/domain";
import {
  formatDate,
  formatGrams,
  formatMoney,
  formatNumber,
  formatTins,
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
  type TrendPoint,
} from "@/components/dashboard/consumption-trend-chart";
import { StockByProductChart } from "@/components/dashboard/stock-by-product-chart";
import {
  ChannelDonutChart,
  type ChannelSlice,
} from "@/components/dashboard/channel-donut-chart";

const CHANNEL_LABELS: Record<Channel, string> = {
  restaurant: "Restaurant",
  retail: "Retail",
  event: "Event",
  staff: "Staff",
};

const TREND_DAYS = 90;

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
    <Link href={href} className="block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring/60 outline-none">
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

  const [overview, planner, expiring, openPoLines, demandMovements] =
    await Promise.all([
      getStockOverview({ now }),
      getPlannerData(now),
      getExpiringLots({ now }),
      prisma.purchaseOrderLine.findMany({
        where: { purchaseOrder: { status: { in: [...OPEN_PO_STATUSES] } } },
        select: { quantityTins: true, unitCost: true },
      }),
      prisma.stockMovement.findMany({
        where: {
          type: { in: [...DEMAND_MOVEMENT_TYPES] },
          date: { gte: trendStart, lte: now },
        },
        select: { date: true, gramsEquivalent: true, channel: true },
      }),
    ]);

  const { settings, totals } = overview;
  const currency = settings.currency;

  // --- Consumption trend: daily grams + 7-day rolling average -------------
  const gramsByDay = new Map<string, number>();
  for (const m of demandMovements) {
    const key = format(m.date, "yyyy-MM-dd");
    gramsByDay.set(key, (gramsByDay.get(key) ?? 0) + Math.abs(m.gramsEquivalent));
  }
  const trend: TrendPoint[] = [];
  for (let i = 0; i < TREND_DAYS; i++) {
    const key = format(addDays(trendStart, i), "yyyy-MM-dd");
    trend.push({ date: key, grams: Math.round(gramsByDay.get(key) ?? 0), avg7: 0 });
  }
  for (let i = 0; i < trend.length; i++) {
    const window = trend.slice(Math.max(0, i - 6), i + 1);
    const mean = window.reduce((s, p) => s + p.grams, 0) / window.length;
    trend[i].avg7 = Math.round(mean * 10) / 10;
  }

  // --- Consumption by channel, last 30 days --------------------------------
  const channelTotals = new Map<Channel, number>();
  for (const m of demandMovements) {
    if (m.date < channelStart) continue;
    const channel = m.channel as Channel | null;
    if (!channel || !CHANNELS.includes(channel)) continue;
    channelTotals.set(
      channel,
      (channelTotals.get(channel) ?? 0) + Math.abs(m.gramsEquivalent)
    );
  }
  const channelData: ChannelSlice[] = CHANNELS.map((channel) => ({
    channel,
    label: CHANNEL_LABELS[channel],
    grams: Math.round(channelTotals.get(channel) ?? 0),
  }));

  // --- Stock by product (top 10 by grams) ----------------------------------
  // Compact single-line labels for axis ticks (the tooltip shows values).
  const chartLabel = (name: string) =>
    shortProductName(name)
      .replace(/\((\d+)\s*g(?:r|m)?\s*\/\s*tin\)/i, "· $1 g")
      .replace(/\s*-\s*(\d+)\s*g(?:r|m)?\b/i, " · $1 g")
      .replace(/\[unpasteurized\]/i, "unpast.")
      .replace(/\((?:le bua|zuma|villa)[^)]*\)/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  const stockBars = overview.rows
    .filter((row) => row.onHandGrams > 0)
    .sort((a, b) => b.onHandGrams - a.onHandGrams)
    .slice(0, 10)
    .map((row) => ({
      name: chartLabel(row.product.name),
      grams: Math.round(row.onHandGrams),
    }));

  // --- KPIs -----------------------------------------------------------------
  const openPoValue = openPoLines.reduce(
    (sum, line) => sum + line.quantityTins * line.unitCost,
    0
  );
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
          <Link href="/consume">
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
      {(planner.orderDue || expiring.length > 0) && (
        <div className="mb-6 space-y-3">
          {planner.orderDue && (
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
          )}
          {expiring.length > 0 && (
            <Alert variant="warning">
              <AlertTriangle className="size-4" />
              <AlertTitle>
                {expiring.length} lot{expiring.length === 1 ? "" : "s"} expiring
                within {settings.expiryAlertDays} days
              </AlertTitle>
              <AlertDescription>
                <span>
                  Prioritise these tins on the menu or push them to marketing.{" "}
                  <Link
                    href="/inventory?filter=expiring"
                    className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
                  >
                    View expiring lots
                    <ArrowRight className="size-3" />
                  </Link>
                </span>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Total stock"
          value={formatGrams(totals.grams)}
          sub={`${formatTins(totals.tins)} · ${formatMoney(totals.value, currency)}`}
        />
        <StatCard
          label="Days of cover"
          value={
            totals.daysOfCover != null
              ? `${formatNumber(totals.daysOfCover, 0)}d`
              : "—"
          }
          sub="at current usage"
          tone={
            totals.daysOfCover != null && totals.daysOfCover < 15
              ? totals.daysOfCover < 7
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
          label="Expiring lots"
          value={expiring.length}
          sub={`within ${settings.expiryAlertDays} days`}
          tone={expiring.length > 0 ? "warning" : "default"}
          href="/inventory?filter=expiring"
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
            <CardTitle>Consumption trend</CardTitle>
            <CardDescription>
              Daily grams consumed over the last 90 days, with 7-day average
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConsumptionTrendChart data={trend} />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Stock by product</CardTitle>
              <CardDescription>
                On-hand grams, top {Math.min(10, stockBars.length) || 10}{" "}
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
              <CardDescription>Last 30 days, grams by channel</CardDescription>
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
