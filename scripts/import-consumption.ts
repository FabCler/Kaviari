/**
 * One-time import of the historical consumption workbook
 * (data/consumption_2025.json — monthly totals per PR code, Jan 2025 →).
 *
 * Idempotent: guarded by the "consumption2025Imported" setting, so hosted
 * deployments run it exactly once (ensure-seed.mjs calls it on boot).
 * Monthly totals are spread across the ISO weeks of each month; movements
 * carry no lot (historical — current stock levels are untouched).
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { spreadMonthlyQuantity } from "../lib/import/period";

const prisma = new PrismaClient();

const GUARD_KEY = "consumption2025Imported";
// Bump when the shipped data changes: previous historical-import movements
// are wiped and re-imported from the JSON (v2 removed August 2026; v3 also
// purges ALL August 2026 demand data regardless of its source).
const IMPORT_VERSION = 3;
const NOTE_PREFIX = "Historical consumption import";

interface MonthlyRow {
  prCode: string;
  month: string; // "yyyy-mm"
  tins: number;
}

async function main() {
  const file = join(__dirname, "..", "data", "consumption_2025.json");
  if (!existsSync(file)) {
    console.log("import-consumption: no data file — skipping.");
    return;
  }
  const done = await prisma.setting.findUnique({ where: { key: GUARD_KEY } });
  const doneVersion = done ? Number(done.value.split("|")[0]) || 1 : 0;
  if (doneVersion >= IMPORT_VERSION) {
    console.log("import-consumption: already imported — skipping.");
    return;
  }
  if (doneVersion > 0) {
    const removed = await prisma.stockMovement.deleteMany({
      where: { note: { startsWith: NOTE_PREFIX } },
    });
    // The August 2026 source data was wrong — purge that month entirely,
    // whatever wrote it (upload, boot import or manual log).
    const august = await prisma.stockMovement.deleteMany({
      where: {
        quantityTins: { lt: 0 },
        date: {
          gte: new Date(Date.UTC(2026, 7, 1)),
          lt: new Date(Date.UTC(2026, 8, 1)),
        },
      },
    });
    console.log(
      `import-consumption: v${doneVersion} -> v${IMPORT_VERSION} — removed ${removed.count} imported + ${august.count} August 2026 movements.`
    );
  }

  const rows: MonthlyRow[] = JSON.parse(readFileSync(file, "utf8"));
  const products = await prisma.product.findMany();
  const byCode = new Map(products.map((p) => [p.prCode, p]));

  const movements = [];
  let missing = 0;
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
        gramsEquivalent: -Math.round(chunk.tins * (product.gramsPerUnit ?? 0) * 100) / 100,
        date: new Date(`${chunk.date}T12:00:00.000Z`),
        note: `${NOTE_PREFIX} (${row.month} monthly total)`,
      });
    }
  }

  await prisma.$transaction([
    prisma.stockMovement.createMany({ data: movements }),
    prisma.setting.upsert({
      where: { key: GUARD_KEY },
      create: {
        key: GUARD_KEY,
        value: `${IMPORT_VERSION}|${new Date().toISOString()}`,
      },
      update: { value: `${IMPORT_VERSION}|${new Date().toISOString()}` },
    }),
  ]);

  console.log(
    `import-consumption: wrote ${movements.length} movements from ${rows.length} monthly rows` +
      (missing > 0 ? ` (${missing} rows had unknown PR codes)` : "")
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
