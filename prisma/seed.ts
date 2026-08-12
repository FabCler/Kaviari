/**
 * Seed v2: canonical product database + ~63 days of real demo activity.
 *
 * Products come from data/products_db.json (extracted from
 * Data_base_products.xlsx — PR codes, caviar types, categories, units,
 * packing per box). Weekly consumption rates and stock on hand come from the
 * Thammachart import-review workbook, matched by PR code, and are laid out
 * over the 63 days before "now".
 *
 * User accounts are NEVER deleted by the seed. Everything else is wiped and
 * reloaded. Setting catalogVersion marks the catalog generation so hosted
 * deployments reseed automatically after an upgrade (see
 * scripts/ensure-seed.mjs).
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

const DAY = 86_400_000;
export const CATALOG_VERSION = "2";

interface CatalogProduct {
  prCode: string;
  name: string;
  caviarType: string | null;
  category: string;
  unit: string;
  packingPerBox: number | null;
  gramsPerUnit: number | null;
  unitCost: number;
  currency: string;
  stockOnHand: number;
}

interface ConsumptionHistory {
  weeks: string[];
  consumption: Record<string, number[]>;
}

/** Deterministic PRNG so re-seeding produces the same demo story. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260812);

function pickChannel(): { channel: string; type: string } {
  const r = rand();
  if (r < 0.75) return { channel: "food_service", type: "consumption" };
  if (r < 0.87) {
    return rand() < 0.25
      ? { channel: "event", type: "marketing_sample" }
      : { channel: "event", type: "consumption" };
  }
  return { channel: "training", type: "consumption" };
}

async function main() {
  const dataDir = join(__dirname, "..", "data");
  const catalog: CatalogProduct[] = JSON.parse(
    readFileSync(join(dataDir, "products_db.json"), "utf8")
  );
  const history: ConsumptionHistory = JSON.parse(
    readFileSync(join(dataDir, "consumption_history.json"), "utf8")
  );

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);

  console.log("Clearing existing data (user accounts are preserved)…");
  await prisma.contentAsset.deleteMany();
  await prisma.campaignProduct.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.purchaseOrderLine.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.stockLot.deleteMany();
  await prisma.forecast.deleteMany();
  await prisma.product.deleteMany();
  await prisma.setting.deleteMany();

  console.log(`Seeding ${catalog.length} products…`);
  const productByCode = new Map<
    string,
    { id: string; gramsPerUnit: number | null; unitCost: number; name: string }
  >();
  for (const entry of catalog) {
    const product = await prisma.product.create({
      data: {
        prCode: entry.prCode,
        name: entry.name,
        caviarType: entry.caviarType,
        category: entry.category,
        unit: entry.unit,
        packingPerBox: entry.packingPerBox,
        gramsPerUnit: entry.gramsPerUnit,
        unitCost: entry.unitCost,
        currency: entry.currency,
        active: true,
        isPlaceholder: false,
      },
    });
    productByCode.set(entry.prCode, {
      id: product.id,
      gramsPerUnit: entry.gramsPerUnit,
      unitCost: entry.unitCost,
      name: entry.name,
    });
  }

  // ---- Historical consumption (last 63 days, from real weekly rates) ----
  console.log("Seeding ~63 days of consumption…");
  const weeksCount = history.weeks.length; // 9
  type MovementRow = {
    productId: string;
    lotId: string | null;
    type: string;
    quantityTins: number;
    gramsEquivalent: number;
    date: Date;
    channel: string;
    note: string | null;
  };
  const movements: MovementRow[] = [];
  const totalConsumedByCode = new Map<string, number>();

  for (const [code, weekly] of Object.entries(history.consumption)) {
    const product = productByCode.get(code);
    if (!product) continue;
    let total = 0;
    weekly.forEach((unitsPerWeek, weekIndex) => {
      if (unitsPerWeek <= 0) return;
      total += unitsPerWeek;
      const weekStart = today.getTime() - (weeksCount - weekIndex) * 7 * DAY;
      let remaining = unitsPerWeek;
      while (remaining > 0) {
        const qty = remaining >= 2 && rand() < 0.25 ? 2 : 1;
        const take = Math.min(qty, remaining);
        remaining -= take;
        const at = new Date(weekStart + Math.floor(rand() * 7) * DAY);
        at.setHours(11 + Math.floor(rand() * 11), Math.floor(rand() * 60));
        const { channel, type } = pickChannel();
        movements.push({
          productId: product.id,
          lotId: null,
          type,
          quantityTins: -take,
          gramsEquivalent: -take * (product.gramsPerUnit ?? 0),
          date: at,
          channel,
          note: null,
        });
      }
    });
    if (total > 0) totalConsumedByCode.set(code, total);
  }

  // Attach historical consumption to consumed "history" lots so lot views
  // stay coherent.
  for (const [code, total] of totalConsumedByCode) {
    const product = productByCode.get(code)!;
    const receivedDate = new Date(today.getTime() - 70 * DAY);
    const lot = await prisma.stockLot.create({
      data: {
        productId: product.id,
        lotNumber: `KV-${code}-H1`,
        quantityTins: 0,
        receivedTins: total,
        receivedDate,
        expiryDate: new Date(receivedDate.getTime() + 180 * DAY),
        status: "consumed",
      },
    });
    movements.push({
      productId: product.id,
      lotId: lot.id,
      type: "receipt",
      quantityTins: total,
      gramsEquivalent: total * (product.gramsPerUnit ?? 0),
      date: receivedDate,
      channel: "food_service",
      note: "Opening stock (historic)",
    });
    for (const movement of movements) {
      if (movement.productId === product.id && movement.lotId === null) {
        movement.lotId = lot.id;
      }
    }
  }

  // ---- Current stock lots (matching the latest review's on-hand) ----
  console.log("Seeding current stock lots…");
  // Short-dated exceptions to demo expiry alerts + FEFO.
  const shortDated: Record<string, number> = {
    "9011": 9, // Oscietra Prestige 125g unpasteurized -> 9 days
    "9396": 12, // Whitefish roe -> 12 days
  };

  for (const entry of catalog) {
    const stock = entry.stockOnHand ?? 0;
    if (stock <= 0) continue;
    const product = productByCode.get(entry.prCode)!;
    const splits: Array<{ tins: number; receivedDaysAgo: number }> =
      stock >= 20
        ? [
            { tins: Math.round(stock * 0.4), receivedDaysAgo: 38 },
            { tins: stock - Math.round(stock * 0.4), receivedDaysAgo: 24 },
          ]
        : [{ tins: stock, receivedDaysAgo: 24 }];

    let lotIndex = 1;
    for (const split of splits) {
      const receivedDate = new Date(
        today.getTime() - split.receivedDaysAgo * DAY
      );
      const shortDays = shortDated[entry.prCode];
      const expiryDate =
        shortDays != null
          ? new Date(today.getTime() + shortDays * DAY)
          : new Date(
              receivedDate.getTime() + (120 + Math.floor(rand() * 60)) * DAY
            );
      const lot = await prisma.stockLot.create({
        data: {
          productId: product.id,
          lotNumber: `KV-${entry.prCode}-${String(lotIndex).padStart(2, "0")}`,
          quantityTins: split.tins,
          receivedTins: split.tins,
          receivedDate,
          expiryDate,
          status: "in_stock",
        },
      });
      movements.push({
        productId: product.id,
        lotId: lot.id,
        type: "receipt",
        quantityTins: split.tins,
        gramsEquivalent: split.tins * (product.gramsPerUnit ?? 0),
        date: receivedDate,
        channel: "food_service",
        note: `Received ${lot.lotNumber}`,
      });
      lotIndex += 1;
    }
  }

  console.log(`Writing ${movements.length} stock movements…`);
  await prisma.stockMovement.createMany({ data: movements });

  // ---- Purchase orders: received history + overlapping open pipeline ----
  console.log("Seeding purchase orders…");
  const orderLinesFor = (daysOfDemand: number, codes: string[]) =>
    codes
      .map((code) => {
        const weekly = history.consumption[code] ?? [];
        const recent = weekly.slice(-4);
        const perWeek =
          recent.reduce((sum, n) => sum + n, 0) / Math.max(1, recent.length);
        const units = Math.ceil((perWeek / 7) * daysOfDemand);
        const product = productByCode.get(code);
        if (!product || units <= 0) return null;
        return {
          productId: product.id,
          quantityTins: units,
          unitCost: product.unitCost,
        };
      })
      .filter((line): line is NonNullable<typeof line> => line !== null);

  const topMovers = ["1216", "3126", "3193", "3127", "3134", "3133"];
  const secondTier = ["7715", "3148", "9011", "9396"];

  await prisma.purchaseOrder.create({
    data: {
      reference: "PO-RECEIVED-DEMO",
      status: "received",
      orderDate: new Date(today.getTime() - 45 * DAY),
      expectedDeliveryDate: new Date(today.getTime() - 24 * DAY),
      receivedDate: new Date(today.getTime() - 24 * DAY),
      notes: "Regular cycle order — received in full.",
      lines: { create: orderLinesFor(15, [...topMovers, ...secondTier]) },
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      reference: "PO-OPEN-DEMO-1",
      status: "confirmed",
      orderDate: new Date(today.getTime() - 18 * DAY),
      expectedDeliveryDate: new Date(today.getTime() + 3 * DAY),
      notes: "Confirmed by Kaviari — air freight booked.",
      lines: { create: orderLinesFor(15, topMovers) },
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      reference: "PO-OPEN-DEMO-2",
      status: "sent",
      orderDate: new Date(today.getTime() - 3 * DAY),
      expectedDeliveryDate: new Date(today.getTime() + 18 * DAY),
      notes: "Awaiting confirmation.",
      lines: { create: orderLinesFor(15, [...topMovers, ...secondTier]) },
    },
  });

  // ---- Campaigns & content ----
  console.log("Seeding campaigns…");
  const kristal125 = productByCode.get("3193")!;
  const oscietra30 = productByCode.get("3126")!;
  const oscietraUnpast = productByCode.get("9011")!;

  const tasting = await prisma.campaign.create({
    data: {
      name: "Caviar & Champagne Evening",
      type: "tasting",
      status: "active",
      startDate: new Date(today.getTime() + 5 * DAY),
      endDate: new Date(today.getTime() + 5 * DAY),
      budget: 1200,
      notes:
        "Guided tasting for 24 guests: Kristal vs Oscietra Prestige flight, blinis and Grower Champagne pairing.",
      products: {
        create: [{ productId: kristal125.id }, { productId: oscietra30.id }],
      },
    },
  });

  await prisma.campaign.create({
    data: {
      name: "Unpasteurized Oscietra — Chef's Week",
      type: "promo",
      status: "planned",
      startDate: new Date(today.getTime() + 2 * DAY),
      endDate: new Date(today.getTime() + 8 * DAY),
      budget: 400,
      notes:
        "Short-dated lot push: feature the unpasteurized Oscietra Prestige 125 g on the tasting menu before DLC.",
      products: { create: [{ productId: oscietraUnpast.id }] },
    },
  });

  await prisma.contentAsset.create({
    data: {
      campaignId: tasting.id,
      type: "event_invite",
      createdByAI: true,
      text: "An evening of quiet luxury. Join us as we open Kaviari's Kristal and Oscietra Prestige side by side — six caviars, one flight of Grower Champagne, and the stories behind the sturgeon. Thursday, 7 pm. Twenty-four seats, no more.",
    },
  });

  // ---- Settings ----
  console.log("Seeding settings…");
  const lastOrderDate = new Date(today.getTime() - 3 * DAY);
  const settings: Record<string, string> = {
    reviewPeriodDays: "15",
    leadTimeDays: "21",
    safetyStockDays: "15",
    aduWindowDays: "42",
    currency: "EUR",
    expiryAlertDays: "14",
    lastOrderDate: lastOrderDate.toISOString(),
    catalogVersion: CATALOG_VERSION,
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.create({ data: { key, value } });
  }

  console.log("Seed complete:", {
    products: await prisma.product.count(),
    lots: await prisma.stockLot.count(),
    movements: await prisma.stockMovement.count(),
    purchaseOrders: await prisma.purchaseOrder.count(),
    campaigns: await prisma.campaign.count(),
    users: await prisma.user.count(),
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
