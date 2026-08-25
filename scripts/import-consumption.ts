/**
 * Consumption-data maintenance run on boot (called by ensure-seed.mjs),
 * guarded by the "consumption2025Imported" setting so each version runs
 * exactly once per database.
 *
 * History: v1–v4 loaded then removed an early test import; v5 wiped all
 * movements and lots. v6 imports the confirmed consumption history
 * (data/consumption_2025.json — Jan 2025 → Jul 2026 monthly totals per PR
 * code, spread as whole numbers across each month's ISO weeks, no lot).
 * August 2026 onward is recorded through the website. v7 syncs the product
 * catalog from data/products_db.json (upsert by PR code, deactivate removed
 * codes) without touching movements, lots, forecasts or accounts.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { spreadMonthlyQuantity } from "../lib/import/period";

const prisma = new PrismaClient();

const GUARD_KEY = "consumption2025Imported";
const VERSION = 7;
const NOTE_PREFIX = "Historical consumption import";

interface MonthlyRow {
  prCode: string;
  month: string; // "yyyy-mm"
  tins: number;
}

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
}

/** Upsert every catalog product by PR code; deactivate codes not in the file. */
async function syncCatalog(): Promise<string> {
  const file = join(__dirname, "..", "data", "products_db.json");
  if (!existsSync(file)) return "no catalog file";
  const catalog: CatalogProduct[] = JSON.parse(readFileSync(file, "utf8"));
  const codes = new Set(catalog.map((p) => p.prCode));

  let created = 0;
  let updated = 0;
  for (const entry of catalog) {
    const data = {
      name: entry.name,
      caviarType: entry.caviarType,
      category: entry.category,
      unit: entry.unit,
      packingPerBox: entry.packingPerBox,
      gramsPerUnit: entry.gramsPerUnit,
      unitCost: entry.unitCost,
      currency: entry.currency,
      active: true,
    };
    const existing = await prisma.product.findUnique({
      where: { prCode: entry.prCode },
    });
    if (existing) {
      await prisma.product.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.product.create({ data: { prCode: entry.prCode, ...data } });
      created += 1;
    }
  }
  const deactivated = await prisma.product.updateMany({
    where: { prCode: { notIn: [...codes] }, active: true },
    data: { active: false },
  });
  return `catalog synced: ${created} created, ${updated} updated, ${deactivated.count} deactivated`;
}

async function main() {
  const done = await prisma.setting.findUnique({ where: { key: GUARD_KEY } });
  const doneVersion = done ? Number(done.value.split("|")[0]) || 1 : 0;
  if (doneVersion >= VERSION) {
    console.log("consumption-maintenance: up to date — skipping.");
    return;
  }

  const catalogResult = await syncCatalog();
  console.log(`consumption-maintenance: ${catalogResult}`);

  if (doneVersion >= 6) {
    // Only the catalog changed — keep the imported history as is.
    await prisma.setting.upsert({
      where: { key: GUARD_KEY },
      create: {
        key: GUARD_KEY,
        value: `${VERSION}|${new Date().toISOString()}`,
      },
      update: { value: `${VERSION}|${new Date().toISOString()}` },
    });
    console.log(
      `consumption-maintenance: v${doneVersion} -> v${VERSION} — catalog refresh only.`
    );
    return;
  }

  // Remove anything a previous version of this import wrote, then load the
  // confirmed history fresh.
  const removed = await prisma.stockMovement.deleteMany({
    where: { note: { startsWith: NOTE_PREFIX } },
  });

  const file = join(__dirname, "..", "data", "consumption_2025.json");
  let written = 0;
  let missing = 0;
  if (existsSync(file)) {
    const rows: MonthlyRow[] = JSON.parse(readFileSync(file, "utf8"));
    const products = await prisma.product.findMany();
    const byCode = new Map(products.map((p) => [p.prCode, p]));

    const movements = [];
    for (const row of rows) {
      const product = byCode.get(row.prCode);
      if (!product) {
        missing += 1;
        continue;
      }
      for (const chunk of spreadMonthlyQuantity(row.month, row.tins)) {
        movements.push({
          productId: product.id,
          lotId: null,
          type: "sale",
          channel: "food_service",
          quantityTins: -chunk.tins,
          gramsEquivalent:
            -Math.round(chunk.tins * (product.gramsPerUnit ?? 0) * 100) / 100,
          date: new Date(`${chunk.date}T12:00:00.000Z`),
          note: `${NOTE_PREFIX} (${row.month} monthly total)`,
        });
      }
    }
    await prisma.stockMovement.createMany({ data: movements });
    written = movements.length;
  }

  await prisma.setting.upsert({
    where: { key: GUARD_KEY },
    create: { key: GUARD_KEY, value: `${VERSION}|${new Date().toISOString()}` },
    update: { value: `${VERSION}|${new Date().toISOString()}` },
  });

  console.log(
    `consumption-maintenance: v${doneVersion} -> v${VERSION} — removed ${removed.count}, wrote ${written} movements` +
      (missing > 0 ? ` (${missing} rows had unknown PR codes)` : "")
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
