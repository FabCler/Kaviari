import { requireOwner } from "@/lib/auth";
import { isEmailConfigured, sendTestEmail } from "@/lib/email";

/**
 * POST /api/settings/email-test — owner only. Sends a test email to the
 * owner's own address so SMTP configuration can be verified from Settings.
 */
export async function POST() {
  const ownerOrDenied = await requireOwner();
  if (ownerOrDenied instanceof Response) return ownerOrDenied;

  if (!isEmailConfigured()) {
    return Response.json(
      {
        error:
          "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (and optionally SMTP_FROM) in your environment, then redeploy.",
      },
      { status: 503 }
    );
  }

  const result = await sendTestEmail(ownerOrDenied.email);
  if (!result.ok) {
    return Response.json(
      { error: `The test email failed: ${result.error}` },
      { status: 502 }
    );
  }
  return Response.json({ ok: true, to: ownerOrDenied.email });
}
