import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { CONTENT_TYPES, contentTypeSchema } from "@/lib/domain";

const postSchema = z.object({
  type: contentTypeSchema,
  text: z.string().trim().min(1).max(20_000),
  campaignId: z.string().min(1).nullable().optional(),
  createdByAI: z.boolean().default(true),
});

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const typeParam = new URL(request.url).searchParams.get("type");
  const type = (CONTENT_TYPES as readonly string[]).includes(typeParam ?? "")
    ? (typeParam as string)
    : undefined;

  const assets = await prisma.contentAsset.findMany({
    where: type ? { type } : undefined,
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { campaign: { select: { id: true, name: true } } },
  });
  return Response.json({ assets });
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
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }
  const { type, text, campaignId, createdByAI } = parsed.data;

  if (campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      return Response.json({ error: "Campaign not found" }, { status: 404 });
    }
  }

  const asset = await prisma.contentAsset.create({
    data: { type, text, campaignId: campaignId ?? null, createdByAI },
  });
  return Response.json({ asset }, { status: 201 });
}
