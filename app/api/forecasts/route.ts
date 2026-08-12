import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireUser } from "@/lib/auth";
import { monthKeyOf, parseMonthKey, round2 } from "@/components/consume-analysis/aggregate";
import { MONTH_KEY_RE, parseMonthInRange } from "@/app/api/forecasts/lib";

/**
 * GET /api/forecasts?from=YYYY-MM&to=YYYY-MM
 * All users' forecasts in the month range (defaults: 12 months back to
 * 18 months ahead). Totals shown anywhere are the SUM across users.
 */
export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1));
  const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 18, 1));

  const parseParam = (name: string, fallback: Date): Date | Response => {
    const raw = params.get(name);
    if (raw == null || raw === "") return fallback;
    const parsed = parseMonthKey(raw);
    if (!parsed) {
      return Response.json(
        { error: `Invalid "${name}" month — expected YYYY-MM` },
        { status: 400 }
      );
    }
    return parsed;
  };

  const from = parseParam("from", defaultFrom);
  if (from instanceof Response) return from;
  const to = parseParam("to", defaultTo);
  if (to instanceof Response) return to;
  if (from > to) {
    return Response.json({ error: `"from" must not be after "to"` }, { status: 400 });
  }

  const forecasts = await prisma.forecast.findMany({
    where: { month: { gte: from, lte: to } },
    select: {
      userId: true,
      productId: true,
      month: true,
      quantity: true,
      user: { select: { name: true } },
    },
    orderBy: [{ month: "asc" }, { productId: "asc" }],
  });

  return Response.json({
    forecasts: forecasts.map((f) => ({
      userId: f.userId,
      userName: f.user.name,
      productId: f.productId,
      month: monthKeyOf(f.month),
      quantity: f.quantity,
    })),
  });
}

const putSchema = z.object({
  rows: z
    .array(
      z.object({
        productId: z.string().min(1).max(64),
        month: z.string().regex(MONTH_KEY_RE, "Months must look like 2026-08"),
        quantity: z.number().min(0).finite().max(1_000_000),
      })
    )
    .min(1)
    .max(2000),
});

/**
 * PUT /api/forecasts — upsert the CURRENT USER's forecast rows.
 * quantity 0 deletes the row; months limited to -1 .. +18 months.
 */
export async function PUT(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const now = new Date();
  // Last write wins for duplicate (productId, month) pairs in the payload.
  const byKey = new Map<string, { productId: string; month: Date; quantity: number }>();
  for (const row of parsed.data.rows) {
    const month = parseMonthInRange(row.month, now);
    if ("error" in month) {
      return Response.json({ error: month.error }, { status: 400 });
    }
    byKey.set(`${row.productId}|${row.month}`, {
      productId: row.productId,
      month: month.date,
      quantity: round2(row.quantity),
    });
  }
  const rows = [...byKey.values()];

  const productIds = [...new Set(rows.map((r) => r.productId))];
  const known = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true },
  });
  if (known.length !== productIds.length) {
    const knownIds = new Set(known.map((p) => p.id));
    const missing = productIds.find((id) => !knownIds.has(id));
    return Response.json({ error: `Unknown product "${missing}"` }, { status: 400 });
  }

  let updated = 0;
  let deleted = 0;
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      if (row.quantity === 0) {
        const result = await tx.forecast.deleteMany({
          where: { userId: user.id, productId: row.productId, month: row.month },
        });
        deleted += result.count;
      } else {
        await tx.forecast.upsert({
          where: {
            userId_productId_month: {
              userId: user.id,
              productId: row.productId,
              month: row.month,
            },
          },
          create: {
            userId: user.id,
            productId: row.productId,
            month: row.month,
            quantity: row.quantity,
          },
          update: { quantity: row.quantity },
        });
        updated += 1;
      }
    }
  });

  return Response.json({ updated, deleted });
}
