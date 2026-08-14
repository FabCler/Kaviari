import { startOfDay } from "date-fns";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStockOverview } from "@/lib/stock";
import { OUTBOUND_MOVEMENT_TYPES } from "@/lib/domain";
import { shortProductName } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { AnalysisView } from "@/components/consume-analysis/analysis-view";
import {
  loadAnalysisData,
  loadForecastEditorData,
} from "@/components/consume-analysis/data";
import { LogConsumption } from "@/components/consume/log-consumption";
import type {
  ConsumableProduct,
  RecentMovementRow,
} from "@/components/consume/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Consumption & Forecasts — Kaviari Cellar" };

export default async function ConsumePage({
  searchParams,
}: {
  searchParams: Promise<{ log?: string }>;
}) {
  const { log } = await searchParams;
  const now = new Date();
  // The (app) layout redirects unauthenticated visitors; the user is only
  // needed here to prefill the forecast editor with THEIR saved quantities.
  const user = await getCurrentUser();
  const [data, forecastEditor, overview, recentMovements] = await Promise.all([
    loadAnalysisData(now),
    user
      ? loadForecastEditorData(user.id, now)
      : Promise.resolve({ months: [], products: [], saved: {} }),
    getStockOverview({ now }),
    prisma.stockMovement.findMany({
      where: {
        date: { gte: startOfDay(now) },
        type: { in: [...OUTBOUND_MOVEMENT_TYPES] },
      },
      orderBy: { date: "desc" },
      take: 8,
      include: {
        product: { select: { name: true, unit: true } },
        lot: { select: { lotNumber: true } },
      },
    }),
  ]);

  const products: ConsumableProduct[] = overview.rows
    .filter((row) => row.onHandUnits > 0)
    .sort(
      (a, b) =>
        b.aduUnitsPerDay - a.aduUnitsPerDay ||
        a.product.name.localeCompare(b.product.name)
    )
    .map((row) => ({
      productId: row.product.id,
      name: row.product.name,
      shortName: shortProductName(row.product.name),
      caviarType: row.product.caviarType,
      category: row.product.category,
      unit: row.product.unit,
      gramsPerUnit: row.product.gramsPerUnit,
      onHandUnits: row.onHandUnits,
      aduUnitsPerDay: row.aduUnitsPerDay,
    }));

  const recent: RecentMovementRow[] = recentMovements.map((m) => ({
    movementId: m.id,
    date: m.date.toISOString(),
    productName: shortProductName(m.product.name),
    units: Math.abs(m.quantityTins),
    unit: m.product.unit,
    type: m.type,
    channel: m.channel,
    lotNumber: m.lot?.lotNumber ?? null,
  }));

  return (
    <div>
      <PageHeader
        title="Consumption & Forecasts"
        description="How the cellar is being consumed — weekly, monthly or quarterly, in total or by caviar type — compared against everyone's forecasts."
        actions={
          <LogConsumption
            products={products}
            recent={recent}
            autoOpen={log != null}
          />
        }
      />
      <AnalysisView
        data={data}
        forecastEditor={forecastEditor}
        now={now.toISOString()}
      />
    </div>
  );
}
