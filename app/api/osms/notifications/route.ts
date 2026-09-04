import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { markRead } from "@/lib/osms/notify";

export const dynamic = "force-dynamic";

/** Mark workflow alerts as read (§16). */
export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const schema = z.object({ ids: z.array(z.string().min(1)).max(200) });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  await markRead(parsed.data.ids);
  return Response.json({ ok: true });
}
