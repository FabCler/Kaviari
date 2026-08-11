import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Product detail for the inventory sheet: in-stock lots + recent movements. */
export async function GET(_request: Request, ctx: Ctx) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await ctx.params;
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  const [lots, movements] = await Promise.all([
    prisma.stockLot.findMany({
      where: { productId: id, status: "in_stock", quantityTins: { gt: 0 } },
      orderBy: { expiryDate: "asc" },
    }),
    prisma.stockMovement.findMany({
      where: { productId: id },
      orderBy: { date: "desc" },
      take: 10,
      include: { lot: { select: { lotNumber: true } } },
    }),
  ]);

  return Response.json({ lots, movements });
}

const patchSchema = z.object({
  aduOverrideGramsPerDay: z.number().min(0).nullable().optional(),
  active: z.boolean().optional(),
  unitCost: z.number().positive().optional(),
  imageUrl: z.string().max(2000).nullable().optional(),
});

/** Partial product update (ADU override, active flag, unit cost, image). */
export async function PATCH(request: Request, ctx: Ctx) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }
  const hasField = Object.values(parsed.data).some((v) => v !== undefined);
  if (!hasField) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const product = await prisma.product.update({
      where: { id },
      data: parsed.data,
    });
    return Response.json({ product });
  } catch {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }
}
