import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getPlannerData, nextPoReference } from "@/lib/planner";
import { getSettings } from "@/lib/settings";
import { expectedDeliveryDate } from "@/lib/replenishment";

const lineSchema = z.object({
  productId: z.string().min(1),
  quantityTins: z.number().positive(),
  unitCost: z.number().min(0),
});

const bodySchema = z.object({
  fromSuggestions: z.boolean().optional().default(false),
  notes: z.string().max(2000).optional(),
  lines: z.array(lineSchema).max(200).optional(),
});

/**
 * Create a draft purchase order.
 * - { fromSuggestions: true } — server recomputes the replenishment
 *   suggestions and builds lines from every product that needs ordering.
 *   Client-supplied quantities are never trusted for this path.
 * - { lines?: [...] } — manual draft (possibly blank) with explicit lines.
 */
export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const body = parsed.data;
  const now = new Date();

  let lines: { productId: string; quantityTins: number; unitCost: number }[];

  if (body.fromSuggestions) {
    const planner = await getPlannerData(now);
    lines = planner.rows
      .filter((row) => row.suggestion.suggestedUnits > 0)
      .map((row) => ({
        productId: row.product.id,
        quantityTins: row.suggestion.suggestedUnits,
        unitCost: row.product.unitCost,
      }));
    if (lines.length === 0) {
      return Response.json(
        {
          error:
            "Nothing to order — all products are at or above their order-up-to level.",
        },
        { status: 422 }
      );
    }
  } else {
    lines = body.lines ?? [];
    if (lines.length > 0) {
      const products = await prisma.product.findMany({
        where: { id: { in: lines.map((l) => l.productId) } },
        select: { id: true },
      });
      const known = new Set(products.map((p) => p.id));
      const missing = lines.find((l) => !known.has(l.productId));
      if (missing) {
        return Response.json(
          { error: "One or more products in the order do not exist." },
          { status: 400 }
        );
      }
    }
  }

  const settings = await getSettings();
  const reference = await nextPoReference(now);

  const po = await prisma.purchaseOrder.create({
    data: {
      reference,
      status: "draft",
      orderDate: now,
      expectedDeliveryDate: expectedDeliveryDate(now, settings.leadTimeDays),
      notes: body.notes ?? null,
      lines: {
        create: lines.map((line) => ({
          productId: line.productId,
          quantityTins: line.quantityTins,
          unitCost: line.unitCost,
        })),
      },
    },
  });

  return Response.json({ id: po.id, reference: po.reference }, { status: 201 });
}
