import type { Prisma, PrismaClient } from "@prisma/client";
import type { CustomerSalesParseResult } from "./parse";

type Db = PrismaClient | Prisma.TransactionClient;

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
 *
 * Either way, customers are then re-linked by commercial name (see
 * relinkCustomersByName) so one customer never shows as two.
 */
export async function applyCustomerSales(
  db: PrismaClient,
  parsed: CustomerSalesParseResult,
  fileName: string
): Promise<{
  removed: number;
  written: number;
  relinked: number;
  repsAdded: number;
}> {
  return db.$transaction(
    async (tx) => {
      const removed = await tx.customerSale.deleteMany({
        where:
          parsed.mode === "replace-all"
            ? {}
            : { OR: parsed.months.map(({ year, month }) => ({ year, month })) },
      });
      await tx.customerSale.createMany({ data: parsed.rows });

      // Before filling reps: a rep kept under a customer's former code must
      // move to the current code first, or the customer would look unassigned.
      const relinked = await relinkCustomersByName(tx);

      let repsAdded = 0;
      if (parsed.mode === "replace-months") {
        const assigned = new Set(
          (await tx.customerRep.findMany({ select: { customerCode: true } })).map(
            (r) => r.customerCode
          )
        );
        const newReps = Object.entries(parsed.reps)
          .filter(([code]) => !assigned.has(code))
          .map(([customerCode, repName]) => ({ customerCode, repName }));
        await tx.customerRep.createMany({ data: newReps });
        repsAdded = newReps.length;
      }

      const metaValue = JSON.stringify({
        fileName,
        uploadedAt: new Date().toISOString(),
        rows: parsed.rows.length,
      });
      await tx.setting.upsert({
        where: { key: "customerSalesMeta" },
        create: { key: "customerSalesMeta", value: metaValue },
        update: { value: metaValue },
      });

      return {
        removed: removed.count,
        written: parsed.rows.length,
        relinked,
        repsAdded,
      };
    },
    { timeout: 60_000 }
  );
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * The exports identify a customer by commercial name; the codes behind a
 * name can change (a new customer account, or a placeholder such as "New" in
 * a forecast file written before the customer had a code). Left alone, such
 * a customer shows as two rows: history or forecast under the old code,
 * recent sales under the new one.
 *
 * This moves everything onto the code of the customer's most recent sale:
 *  - sales codes sharing a commercial name (compared on each code's latest
 *    name) are merged into the most recently sold one;
 *  - forecasts and sales reps follow, as do those under a code with no sales
 *    at all whose forecast name matches a sales customer.
 * A forecast or rep already present on the current code wins over the one
 * being moved. Returns the number of codes re-linked.
 */
export async function relinkCustomersByName(db: Db): Promise<number> {
  const sales = await db.customerSale.findMany({
    select: { customerCode: true, customerName: true, year: true, month: true },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  // Each code's identity: its latest name, and when it last sold.
  const latest = new Map<string, { name: string; at: number }>();
  for (const sale of sales) {
    latest.set(sale.customerCode, {
      name: normalizeName(sale.customerName),
      at: sale.year * 12 + sale.month,
    });
  }
  const current = new Map<string, { code: string; at: number }>();
  for (const [code, { name, at }] of latest) {
    const best = current.get(name);
    if (!best || at > best.at) current.set(name, { code, at });
  }

  // Former code → current code, for sales codes that share a name.
  const moves = new Map<string, string>();
  for (const [code, { name }] of latest) {
    const target = current.get(name)!.code;
    if (target !== code) moves.set(code, target);
  }
  for (const [from, to] of moves) {
    await db.customerSale.updateMany({
      where: { customerCode: from },
      data: { customerCode: to },
    });
  }

  // Forecast-only codes: matched on the name each forecast row carries (one
  // placeholder code can hold several customers).
  const liveCodes = new Set([...latest.keys()].filter((c) => !moves.has(c)));
  const forecastNames = await db.customerForecast.findMany({
    select: { customerCode: true, customerName: true },
    distinct: ["customerCode", "customerName"],
  });
  const orphanTargets = new Map<string, Set<string>>();
  for (const { customerCode, customerName } of forecastNames) {
    if (liveCodes.has(customerCode) || moves.has(customerCode)) continue;
    const target = current.get(normalizeName(customerName))?.code;
    if (!target) continue;
    await moveForecasts(db, { customerCode, customerName }, target);
    const targets = orphanTargets.get(customerCode) ?? new Set<string>();
    targets.add(target);
    orphanTargets.set(customerCode, targets);
  }
  for (const [from, to] of moves) {
    await moveForecasts(db, { customerCode: from }, to);
  }

  // Reps carry no name: they follow their code's move, when it is unambiguous.
  const repMoves = new Map(moves);
  for (const [code, targets] of orphanTargets) {
    if (targets.size === 1) repMoves.set(code, [...targets][0]);
  }
  for (const [from, to] of repMoves) {
    const rep = await db.customerRep.findUnique({ where: { customerCode: from } });
    if (!rep) continue;
    const existing = await db.customerRep.findUnique({
      where: { customerCode: to },
    });
    await db.customerRep.delete({ where: { customerCode: from } });
    if (!existing) {
      await db.customerRep.create({
        data: { customerCode: to, repName: rep.repName },
      });
    }
  }

  return new Set([...moves.keys(), ...orphanTargets.keys()]).size;
}

/** Move forecast rows to `target`; a forecast already there is kept. */
async function moveForecasts(
  db: Db,
  where: { customerCode: string; customerName?: string },
  target: string
): Promise<void> {
  const rows = await db.customerForecast.findMany({ where });
  for (const row of rows) {
    const taken = await db.customerForecast.findUnique({
      where: {
        customerCode_productId_month: {
          customerCode: target,
          productId: row.productId,
          month: row.month,
        },
      },
    });
    if (taken) {
      await db.customerForecast.delete({ where: { id: row.id } });
    } else {
      await db.customerForecast.update({
        where: { id: row.id },
        data: { customerCode: target },
      });
    }
  }
}
