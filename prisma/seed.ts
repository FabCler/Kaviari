/**
 * Seed: real Kaviari catalog + ~63 days of demo activity.
 *
 * Products and weekly consumption rates come from data/kaviari_products.json
 * and data/consumption_history.json, both extracted from the Thammachart
 * "Import Review" workbook (data/extract_kaviari.py). The nine weekly
 * consumption snapshots are laid out over the 63 days before "now" so charts
 * and the order engine show live-looking behaviour whenever you seed.
 *
 * Unit costs are estimates (the workbook has no prices) — see README.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

const DAY = 86_400_000;

interface CatalogProduct {
  kaviariCode: string;
  name: string;
  species: string | null;
  grade: string | null;
  tinSizeGrams: number;
  unitCost: number;
  currency: string;
  category: string;
  active: boolean;
  isPlaceholder: boolean;
  stockOnHandTins?: number;
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

const rand = mulberry32(20260811);

function pickChannel(): { channel: string; type: string } {
  const r = rand();
  if (r < 0.55) return { channel: "restaurant", type: "consumption" };
  if (r < 0.85) return { channel: "retail", type: "sale" };
  if (r < 0.93) return { channel: "event", type: "consumption" };
  if (r < 0.97) return { channel: "staff", type: "consumption" };
  return { channel: "event", type: "marketing_sample" };
}

async function main() {
  const dataDir = join(__dirname, "..", "data");
  const catalog: CatalogProduct[] = JSON.parse(
    readFileSync(join(dataDir, "kaviari_products.json"), "utf8")
  );
  const history: ConsumptionHistory = JSON.parse(
    readFileSync(join(dataDir, "consumption_history.json"), "utf8")
  );

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);

  console.log("Clearing existing data…");
  await prisma.contentAsset.deleteMany();
  await prisma.campaignProduct.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.purchaseOrderLine.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.stockLot.deleteMany();
  await prisma.product.deleteMany();
  await prisma.setting.deleteMany();

  console.log(`Seeding ${catalog.length} products…`);
  const productByCode = new Map<string, { id: string; tinSizeGrams: number; unitCost: number; name: string }>();
  for (const entry of catalog) {
    const product = await prisma.product.create({
      data: {
        kaviariCode: entry.kaviariCode,
        name: entry.name,
        species: entry.species,
        grade: entry.grade,
        tinSizeGrams: entry.tinSizeGrams,
        unitCost: entry.unitCost,
        currency: entry.currency,
        category: entry.category,
        active: entry.active,
        isPlaceholder: entry.isPlaceholder,
      },
    });
    productByCode.set(entry.kaviariCode, {
      id: product.id,
      tinSizeGrams: entry.tinSizeGrams,
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
    weekly.forEach((tinsPerWeek, weekIndex) => {
      if (tinsPerWeek <= 0) return;
      total += tinsPerWeek;
      // Week 0 is the oldest -> starts (weeksCount - weekIndex) weeks ago.
      const weekStart = today.getTime() - (weeksCount - weekIndex) * 7 * DAY;
      // Split the week's tins into 1-tin (occasionally 2-tin) events.
      let remaining = tinsPerWeek;
      while (remaining > 0) {
        const qty = remaining >= 2 && rand() < 0.25 ? 2 : 1;
        const take = Math.min(qty, remaining);
        remaining -= take;
        const at = new Date(
          weekStart + rand() * 7 * DAY + (10 + rand() * 12) * 3_600_000 * 0
        );
        // Spread within the week; bias to evenings for restaurant service.
        at.setTime(weekStart + Math.floor(rand() * 7) * DAY);
        at.setHours(11 + Math.floor(rand() * 11), Math.floor(rand() * 60));
        const { channel, type } = pickChannel();
        movements.push({
          productId: product.id,
          lotId: null,
          type,
          quantityTins: -take,
          gramsEquivalent: -take * product.tinSizeGrams,
          date: at,
          channel,
          note: null,
        });
      }
    });
    if (total > 0) totalConsumedByCode.set(code, total);
  }

  // Attach historical consumption to consumed "history" lots so lot
  // views stay coherent.
  for (const [code, total] of totalConsumedByCode) {
    const product = productByCode.get(code)!;
    const receivedDate = new Date(today.getTime() - 70 * DAY);
    const lot = await prisma.stockLot.create({
      data: {
        productId: product.id,
        lotNumber: `KV-${code.slice(-7, -3)}-H1`,
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
      gramsEquivalent: total * product.tinSizeGrams,
      date: receivedDate,
      channel: "restaurant",
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
  // Short-dated exceptions to demo expiry alerts + FEFO:
  //   unpasteurized Oscietra has a short DLC; whitefish roe close behind.
  const shortDated: Record<string, number> = {
    "1638CAVCVRFRC1004-01": 9, // Oscietra Prestige 125g unpasteurized -> 9 days
    "1640FSRFIRFRC1001-01": 12, // Whitefish roe -> 12 days
  };

  for (const entry of catalog) {
    const stock = entry.stockOnHandTins ?? 0;
    if (stock <= 0) continue;
    const product = productByCode.get(entry.kaviariCode)!;
    // Split larger holdings into two lots (older + newer receipt).
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
      const shortDays = shortDated[entry.kaviariCode];
      const expiryDate =
        shortDays != null
          ? new Date(today.getTime() + shortDays * DAY)
          : new Date(
              receivedDate.getTime() +
                (120 + Math.floor(rand() * 60)) * DAY
            );
      const lot = await prisma.stockLot.create({
        data: {
          productId: product.id,
          lotNumber: `KV-${entry.kaviariCode.slice(-7, -3)}-${String(lotIndex).padStart(2, "0")}`,
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
        gramsEquivalent: split.tins * product.tinSizeGrams,
        date: receivedDate,
        channel: "restaurant",
        note: `Received ${lot.lotNumber}`,
      });
      lotIndex += 1;
    }
  }

  console.log(`Writing ${movements.length} stock movements…`);
  await prisma.stockMovement.createMany({
    data: movements.map((movement) => ({
      productId: movement.productId,
      lotId: movement.lotId,
      type: movement.type,
      quantityTins: movement.quantityTins,
      gramsEquivalent: movement.gramsEquivalent,
      date: movement.date,
      channel: movement.channel,
      note: movement.note,
    })),
  });

  // ---- Purchase orders: received history + overlapping open pipeline ----
  console.log("Seeding purchase orders…");
  const orderLinesFor = (daysOfDemand: number, codes: string[]) =>
    codes
      .map((code) => {
        const weekly = history.consumption[code] ?? [];
        const recent = weekly.slice(-4);
        const perWeek =
          recent.reduce((sum, n) => sum + n, 0) / Math.max(1, recent.length);
        const tins = Math.ceil((perWeek / 7) * daysOfDemand);
        const product = productByCode.get(code);
        if (!product || tins <= 0) return null;
        return {
          productId: product.id,
          quantityTins: tins,
          unitCost: product.unitCost,
        };
      })
      .filter((line): line is NonNullable<typeof line> => line !== null);

  const topMovers = [
    "402FSRCVRFRC1010-01", // Kristal 30g
    "440CAVCVRFRC1005-01", // Oscietra Prestige 30g
    "440CAVCVRFRC1014-01", // Kristal 125g
    "440CAVCVRFRC1006-01", // Oscietra Prestige 50g
    "440CAVCVRFRC1008-01", // Oscietra Prestige 125g
    "440CAVCVRFRC1007-01", // Kristal 50g
  ];
  const secondTier = [
    "1640CAVKAIFRC1004-01", // Daurikus 125g
    "440CAVCVRFRC1012-01", // Baeri 30g
    "1638CAVCVRFRC1004-01", // Oscietra 125g unpasteurized
    "1640FSRFIRFRC1001-01", // Whitefish roe
  ];

  // Received 24 days ago (ordered 45 days ago — 21-day lead time).
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

  // Open order #1: placed 18 days ago, lands in ~3 days (confirmed).
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

  // Open order #2: placed 3 days ago, lands in ~18 days (sent). Together
  // with #1 this is the overlapping pipeline the (R,S) math must count.
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
  const kristal125 = productByCode.get("440CAVCVRFRC1014-01")!;
  const oscietra30 = productByCode.get("440CAVCVRFRC1005-01")!;
  const oscietraUnpast = productByCode.get("1638CAVCVRFRC1004-01")!;

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
        create: [
          { productId: kristal125.id },
          { productId: oscietra30.id },
        ],
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

  await prisma.campaign.create({
    data: {
      name: "July Indulgence — retail gift sets",
      type: "email",
      status: "completed",
      startDate: new Date(today.getTime() - 35 * DAY),
      endDate: new Date(today.getTime() - 14 * DAY),
      budget: 250,
      results:
        "2 sends to 1,840 subscribers, 41% open rate. Cleared 38 gift tins; repeat orders from 6 corporate clients.",
      resultRevenue: 5230,
      products: { create: [{ productId: kristal125.id }] },
    },
  });

  await prisma.contentAsset.create({
    data: {
      campaignId: tasting.id,
      type: "event_invite",
      createdByAI: true,
      text:
        "An evening of quiet luxury. Join us as we open Kaviari's Kristal and Oscietra Prestige side by side — six caviars, one flight of Grower Champagne, and the stories behind the sturgeon. Thursday, 7 pm. Twenty-four seats, no more.",
    },
  });
  await prisma.contentAsset.create({
    data: {
      campaignId: tasting.id,
      type: "caption",
      createdByAI: true,
      text:
        "Pearls before dinner. Kristal® caviar, chilled to 2 °C, mother-of-pearl spoons polished. Thursday's tasting has four seats left — link in bio.",
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
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.create({ data: { key, value } });
  }

  const counts = {
    products: await prisma.product.count(),
    lots: await prisma.stockLot.count(),
    movements: await prisma.stockMovement.count(),
    purchaseOrders: await prisma.purchaseOrder.count(),
    campaigns: await prisma.campaign.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
