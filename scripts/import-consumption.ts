/**
 * Consumption-data maintenance run on boot (called by ensure-seed.mjs),
 * guarded by the "consumption2025Imported" setting so each version runs
 * exactly once per database.
 *
 * History: v1–v4 loaded then removed an early test import; v5 wiped all
 * movements and lots. v6 imports the confirmed consumption history
 * (data/consumption_2025.json — Jan 2025 → Jul 2026 monthly totals per PR
 * code, spread as whole numbers across each month's ISO weeks, no lot).
 * August 2026 onward is recorded through the website.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { spreadMonthlyQuantity } from "../lib/import/period";

const prisma = new PrismaClient();

const GUARD_KEY = "consumption2025Imported";
const VERSION = 6;
const NOTE_PREFIX = "Historical consumption import";

interface MonthlyRow {
  prCode: string;
  month: string; // "yyyy-mm"
  tins: number;
}

async function main() {
  const done = await prisma.setting.findUnique({ where: { key: GUARD_KEY } });
  const doneVersion = done ? Number(done.value.split("|")[0]) || 1 : 0;
  if (doneVersion >= VERSION) {
    console.log("consumption-maintenance: up to date — skipping.");
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
