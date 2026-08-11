import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { campaignStatusSchema, campaignTypeSchema } from "@/lib/domain";

/** "YYYY-MM-DD" or full ISO string -> Date, rejecting garbage. */
const dateStringSchema = z
  .string()
  .min(8)
  .refine((s) => !Number.isNaN(new Date(s).getTime()), {
    message: "Invalid date",
  });

const campaignBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    type: campaignTypeSchema,
    status: campaignStatusSchema.default("planned"),
    startDate: dateStringSchema,
    endDate: dateStringSchema.nullable().optional(),
    budget: z.number().nonnegative().max(1_000_000).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
    productIds: z.array(z.string().min(1)).max(100).default([]),
  })
  .refine(
    (d) =>
      d.endDate == null ||
      new Date(d.endDate).getTime() >= new Date(d.startDate).getTime(),
    { message: "End date must be on or after the start date" }
  );

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const campaigns = await prisma.campaign.findMany({
    include: { products: { include: { product: true } } },
    orderBy: { startDate: "desc" },
  });
  return Response.json({ campaigns });
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = campaignBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }
  const { productIds, ...data } = parsed.data;

  if (productIds.length > 0) {
    const found = await prisma.product.count({
      where: { id: { in: productIds } },
    });
    if (found !== new Set(productIds).size) {
      return Response.json(
        { error: "One or more linked products do not exist" },
        { status: 400 }
      );
    }
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: data.name,
      type: data.type,
      status: data.status,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      budget: data.budget ?? null,
      notes: data.notes?.trim() ? data.notes.trim() : null,
      products: {
        create: [...new Set(productIds)].map((productId) => ({ productId })),
      },
    },
    include: { products: true },
  });

  return Response.json({ campaign }, { status: 201 });
}
