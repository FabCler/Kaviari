import { prisma } from "@/lib/db";

/**
 * Releases and confirmations are decisions about goods, so who made them is
 * kept. Recording must never be the reason an action fails.
 */
export async function record(
  userId: string | null,
  action: string,
  target = "",
  detail = ""
): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: { userId, action, target, detail },
    });
  } catch {
    // an audit row is not worth losing the user's work over
  }
}
