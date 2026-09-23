import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const putSchema = z.object({
  customerCode: z.string().trim().min(1).max(100),
  /** Empty clears the assignment. */
  repName: z.string().trim().max(120),
});

/**
 * PUT /api/customer-reps — assign (or clear) the sales rep of one customer.
 * Assignments live in their own table so re-uploading the Top 90% sales
 * file never wipes them.
 */
export async function PUT(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const { customerCode, repName } = parsed.data;

  if (repName === "") {
    await prisma.customerRep.deleteMany({ where: { customerCode } });
    return Response.json({ ok: true, repName: null });
  }
  await prisma.customerRep.upsert({
    where: { customerCode },
    create: { customerCode, repName },
    update: { repName },
  });
  return Response.json({ ok: true, repName });
}
