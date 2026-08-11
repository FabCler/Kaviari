import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { campaignStatusSchema, campaignTypeSchema } from "@/lib/domain";

const dateStringSchema = z
  .string()
  .min(8)
  .refine((s) => !Number.isNaN(new Date(s).getTime()), {
    message: "Invalid date",
  });

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  type: campaignTypeSchema.optional(),
  status: campaignStatusSchema.optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.nullable().optional(),
  budget: z.number().nonnegative().max(1_000_000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  results: z.string().max(4000).nullable().optional(),
  resultRevenue: z.number().nonnegative().max(10_000_000).nullable().optional(),
  productIds: z.array(z.string().min(1)).max(100).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

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

  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }

  const d = parsed.data;

  // Validate the resulting date range against whichever side is changing.
  const startDate = d.startDate ? new Date(d.startDate) : existing.startDate;
  const endDate =
    d.endDate === undefined
      ? existing.endDate
      : d.endDate === null
        ? null
        : new Date(d.endDate);
  if (endDate && endDate.getTime() < startDate.getTime()) {
    return Response.json(
      { error: "End date must be on or after the start date" },
      { status: 400 }
    );
  }

  if (d.productIds && d.productIds.length > 0) {
    const found = await prisma.product.count({
      where: { id: { in: d.productIds } },
    });
    if (found !== new Set(d.productIds).size) {
      return Response.json(
        { error: "One or more linked products do not exist" },
        { status: 400 }
      );
    }
  }

  const data: Prisma.CampaignUpdateInput = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.type !== undefined) data.type = d.type;
  if (d.status !== undefined) data.status = d.status;
  if (d.startDate !== undefined) data.startDate = startDate;
  if (d.endDate !== undefined) data.endDate = endDate;
  if (d.budget !== undefined) data.budget = d.budget;
  if (d.notes !== undefined)
    data.notes = d.notes?.trim() ? d.notes.trim() : null;
  if (d.results !== undefined)
    data.results = d.results?.trim() ? d.results.trim() : null;
  if (d.resultRevenue !== undefined) data.resultRevenue = d.resultRevenue;
  if (d.productIds !== undefined) {
    // Replace-all semantics for linked products.
    data.products = {
      deleteMany: {},
      create: [...new Set(d.productIds)].map((productId) => ({ productId })),
    };
  }

  const campaign = await prisma.campaign.update({
    where: { id },
    data,
    include: { products: true },
  });

  return Response.json({ campaign });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await ctx.params;

  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }
  await prisma.campaign.delete({ where: { id } });
  return Response.json({ ok: true });
}
