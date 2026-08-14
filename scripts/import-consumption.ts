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
  if (done) {
    console.log("import-consumption: already imported — skipping.");
    return;
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
        note: `Historical consumption import (${row.month} monthly total)`,
      });
    }
  }

  await prisma.$transaction([
    prisma.stockMovement.createMany({ data: movements }),
    prisma.setting.upsert({
      where: { key: GUARD_KEY },
      create: { key: GUARD_KEY, value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
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
