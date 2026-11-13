import type { PrismaClient } from "@prisma/client";
import type { CustomerSalesParseResult } from "./parse";

/**
 * Writes a parsed customer-sales file to the database. Shared by the
 * "Update data" upload and the boot maintenance script, so both apply a file
 * the same way (the client is a parameter: the script has its own).
 *
 * - "replace-all" (Top 90% snapshot): every stored row is replaced.
 * - "replace-months" (invoice-line export): only the months the file covers
 *   are replaced; earlier history is kept. Customers the file brings without
 *   a sales rep get the rep from their invoice lines — assignments made on
 *   the Customers page are never overwritten.
 */
export async function applyCustomerSales(
  db: PrismaClient,
  parsed: CustomerSalesParseResult,
  fileName: string
): Promise<{ removed: number; written: number; repsAdded: number }> {
  const metaValue = JSON.stringify({
    fileName,
    uploadedAt: new Date().toISOString(),
    rows: parsed.rows.length,
  });
  const meta = db.setting.upsert({
    where: { key: "customerSalesMeta" },
    create: { key: "customerSalesMeta", value: metaValue },
    update: { value: metaValue },
  });

  if (parsed.mode === "replace-all") {
    const [removed] = await db.$transaction([
      db.customerSale.deleteMany(),
      db.customerSale.createMany({ data: parsed.rows }),
      meta,
    ]);
    return { removed: removed.count, written: parsed.rows.length, repsAdded: 0 };
  }

  const assigned = new Set(
    (await db.customerRep.findMany({ select: { customerCode: true } })).map(
      (r) => r.customerCode
    )
  );
  const newReps = Object.entries(parsed.reps)
    .filter(([code]) => !assigned.has(code))
    .map(([customerCode, repName]) => ({ customerCode, repName }));

  const [removed] = await db.$transaction([
    db.customerSale.deleteMany({
      where: {
        OR: parsed.months.map(({ year, month }) => ({ year, month })),
      },
    }),
    db.customerSale.createMany({ data: parsed.rows }),
    db.customerRep.createMany({ data: newReps }),
    meta,
  ]);
  return {
    removed: removed.count,
    written: parsed.rows.length,
    repsAdded: newReps.length,
  };
}
