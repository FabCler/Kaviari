/**
 * Consumption-data maintenance run on boot (called by ensure-seed.mjs),
 * guarded by the "consumption2025Imported" setting so each version runs
 * exactly once per database.
 *
 * History: v1/v2 imported a consumption workbook that turned out to be test
 * data; v3 purged August 2026; v4 removed that import's movements. v5 wipes
 * ALL movements and ALL stock lots — the team restarts from a clean slate
 * and loads real stock/consumption through uploads. Products, users,
 * forecasts and purchase orders are untouched.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const GUARD_KEY = "consumption2025Imported";
const VERSION = 5;

async function main() {
  const done = await prisma.setting.findUnique({ where: { key: GUARD_KEY } });
  const doneVersion = done ? Number(done.value.split("|")[0]) || 1 : 0;
  if (doneVersion >= VERSION) {
    console.log("consumption-maintenance: up to date — skipping.");
    return;
  }

  let movements = 0;
  let lots = 0;
  if (doneVersion > 0) {
    const [m, l] = await prisma.$transaction([
      prisma.stockMovement.deleteMany(),
      prisma.stockLot.deleteMany(),
    ]);
    movements = m.count;
    lots = l.count;
  }

  await prisma.setting.upsert({
    where: { key: GUARD_KEY },
    create: { key: GUARD_KEY, value: `${VERSION}|${new Date().toISOString()}` },
    update: { value: `${VERSION}|${new Date().toISOString()}` },
  });

  console.log(
    `consumption-maintenance: v${doneVersion} -> v${VERSION} — removed ${movements} movements and ${lots} stock lots.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
