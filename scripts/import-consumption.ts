/**
 * Consumption-data maintenance run on boot (called by ensure-seed.mjs),
 * guarded by the "consumption2025Imported" setting so each version runs
 * exactly once per database.
 *
 * History: v1/v2 imported a consumption workbook that turned out to be test
 * data; v3 purged August 2026. v4 removes EVERYTHING that import created —
 * real consumption is recorded through uploads, logging or Manage data.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const GUARD_KEY = "consumption2025Imported";
const VERSION = 4;
const NOTE_PREFIX = "Historical consumption import";

async function main() {
  const done = await prisma.setting.findUnique({ where: { key: GUARD_KEY } });
  const doneVersion = done ? Number(done.value.split("|")[0]) || 1 : 0;
  if (doneVersion >= VERSION) {
    console.log("consumption-maintenance: up to date — skipping.");
    return;
  }

  let removed = 0;
  if (doneVersion > 0) {
    // Remove every movement written by the old test-file import.
    const result = await prisma.stockMovement.deleteMany({
      where: { note: { startsWith: NOTE_PREFIX } },
    });
    removed = result.count;
  }

  await prisma.setting.upsert({
    where: { key: GUARD_KEY },
    create: { key: GUARD_KEY, value: `${VERSION}|${new Date().toISOString()}` },
    update: { value: `${VERSION}|${new Date().toISOString()}` },
  });

  console.log(
    `consumption-maintenance: v${doneVersion} -> v${VERSION} — removed ${removed} imported test movements.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
