/**
 * Seed v3: real catalog only — no demo activity.
 *
 * Products come from data/products_db.json (extracted from
 * Data_base_products.xlsx — PR codes, caviar types, categories, units,
 * packing per box, REAL purchase costs from the Cost sheet). Current stock
 * on hand becomes one opening lot per product. No demo consumption, no demo
 * purchase orders, no demo campaigns: the team logs real activity.
 *
 * User accounts and their chats are NEVER deleted by the seed. Everything
 * else is wiped and reloaded. Setting catalogVersion marks the catalog
 * generation so hosted deployments reseed automatically after an upgrade
 * (see scripts/ensure-seed.mjs).
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

export const CATALOG_VERSION = "4";

interface CatalogProduct {
  prCode: string;
  name: string;
  caviarType: string | null;
  category: string;
  unit: string;
  packingPerBox: number | null;
  gramsPerUnit: number | null;
  unitCost: number;
  costPerKg: number | null;
  currency: string;
  stockOnHand: number;
}

async function main() {
  const dataDir = join(__dirname, "..", "data");
  const catalog: CatalogProduct[] = JSON.parse(
    readFileSync(join(dataDir, "products_db.json"), "utf8")
  );

  console.log("Clearing existing data (user accounts and chats are kept)…");
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
  const productByCode = new Map<string, { id: string; gramsPerUnit: number | null }>();
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
    });
  }

  // ---- No opening stock ----
  // Stock starts at zero on purpose: it is set by uploading a stock file
  // through Import & Analyze (stock take mode) or by receiving POs.

  // ---- Settings ----
  console.log("Seeding settings…");
  const settings: Record<string, string> = {
    reviewPeriodDays: "15",
    leadTimeDays: "21",
    safetyStockDays: "15",
    aduWindowDays: "42",
    currency: "EUR",
    expiryAlertDays: "14",
    catalogVersion: CATALOG_VERSION,
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.create({ data: { key, value } });
  }

  // OSMS is seeded separately against its own database: `npm run osms:seed`.

  console.log("Seed complete:", {
    products: await prisma.product.count(),
    users: await prisma.user.count(),
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
