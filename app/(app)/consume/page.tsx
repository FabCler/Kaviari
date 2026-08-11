import { startOfDay } from "date-fns";
import { prisma } from "@/lib/db";
import { getStockOverview } from "@/lib/stock";
import { OUTBOUND_MOVEMENT_TYPES } from "@/lib/domain";
import { shortProductName } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { ConsumeFlow } from "@/components/consume/consume-flow";
import type {
  ConsumableProduct,
  RecentMovementRow,
} from "@/components/consume/types";

export default async function ConsumePage() {
  const now = new Date();
  const [overview, recentMovements] = await Promise.all([
    getStockOverview({ now }),
    prisma.stockMovement.findMany({
      where: {
        date: { gte: startOfDay(now) },
        type: { in: [...OUTBOUND_MOVEMENT_TYPES] },
      },
      orderBy: { date: "desc" },
      take: 8,
      include: {
        product: { select: { name: true } },
        lot: { select: { lotNumber: true } },
      },
    }),
  ]);

  const products: ConsumableProduct[] = overview.rows
    .filter((row) => row.onHandTins > 0)
    .sort(
      (a, b) =>
        b.aduGramsPerDay - a.aduGramsPerDay ||
        a.product.name.localeCompare(b.product.name)
    )
    .map((row) => ({
      productId: row.product.id,
      name: row.product.name,
      shortName: shortProductName(row.product.name),
      grade: row.product.grade,
      category: row.product.category,
      tinSizeGrams: row.product.tinSizeGrams,
      onHandTins: row.onHandTins,
      aduGramsPerDay: row.aduGramsPerDay,
    }));

  const recent: RecentMovementRow[] = recentMovements.map((m) => ({
    movementId: m.id,
    date: m.date.toISOString(),
    productName: shortProductName(m.product.name),
    tins: Math.abs(m.quantityTins),
    type: m.type,
    channel: m.channel,
    lotNumber: m.lot?.lotNumber ?? null,
  }));

  return (
    <div>
      <PageHeader
        title="Log Consumption"
        description="Tap a product, set the quantity, confirm — done."
      />
      <ConsumeFlow products={products} recent={recent} />
    </div>
  );
}
