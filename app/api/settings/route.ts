import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getSettings, setSetting } from "@/lib/settings";

const dayCount = z.number().int().min(1).max(365);

const patchSchema = z
  .object({
    reviewPeriodDays: dayCount.optional(),
    leadTimeDays: dayCount.optional(),
    safetyStockDays: dayCount.optional(),
    aduWindowDays: dayCount.optional(),
    expiryAlertDays: dayCount.optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code")
      .optional(),
    lastOrderDate: z
      .string()
      .refine((s) => !Number.isNaN(new Date(s).getTime()), {
        message: "Invalid date",
      })
      .optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "Nothing to update",
  });

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  const settings = await getSettings();
  return Response.json({ settings });
}

export async function PATCH(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

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

  const entries = Object.entries(parsed.data) as [string, number | string][];
  for (const [key, value] of entries) {
    if (key === "lastOrderDate") {
      await setSetting(key, new Date(String(value)).toISOString());
    } else {
      await setSetting(key, String(value));
    }
  }

  const settings = await getSettings();
  return Response.json({ settings });
}
