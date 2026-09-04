import { z } from "zod";
import { requirePermission, isResponse } from "@/lib/osms/guard";
import { getScmSettings, saveScmSettings } from "@/lib/osms/settings";
import { recordAudit } from "@/lib/osms/audit";

export const dynamic = "force-dynamic";

/** §10 — admins tune the reconciliation tolerances without a deploy. */

const schema = z.object({
  qtyTolerancePct: z.number().min(0).max(100).optional(),
  priceTolerancePct: z.number().min(0).max(100).optional(),
  deliveryWarningDays: z.number().int().min(0).max(60).optional(),
  defaultStorageLocation: z.string().max(120).optional(),
});

export async function PATCH(request: Request) {
  const actor = await requirePermission("master.manage");
  if (isResponse(actor)) return actor;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid settings." }, { status: 400 });
  }

  const before = await getScmSettings();
  await saveScmSettings(parsed.data);

  await recordAudit(
    { entity: "scm_settings", entityId: "global", actor },
    Object.entries(parsed.data)
      .filter(
        ([key, value]) =>
          value !== undefined && value !== before[key as keyof typeof before]
      )
      .map(([field, value]) => ({
        action: "update",
        field,
        oldValue: before[field as keyof typeof before],
        newValue: value,
        reason: "Tolerance changed by admin",
      }))
  );

  return Response.json({ ok: true, settings: await getScmSettings() });
}
