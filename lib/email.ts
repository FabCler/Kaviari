import nodemailer from "nodemailer";

/**
 * Outbound email (owner notifications for access requests). Configured via
 * SMTP_* environment variables; when unset, emails are skipped silently and
 * approvals happen in Settings → Users instead.
 *
 *   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_FROM
 */

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.log(
      `[email skipped — SMTP not configured] to=${options.to} subject=${options.subject}`
    );
    return false;
  }
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    return true;
  } catch (error) {
    console.error("Email send failed", error);
    return false;
  }
}

export function accessRequestEmail(params: {
  applicantName: string;
  applicantEmail: string;
  approveUrl: string;
  rejectUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `Kaviari Cellar — access request from ${params.applicantName}`,
    html: `
      <div style="font-family: Georgia, serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e3dfd2;">
        <h2 style="color: #0f192b; letter-spacing: 2px;">KAVIARI <span style="color:#c9a227">CELLAR</span></h2>
        <p><strong>${params.applicantName}</strong> (${params.applicantEmail}) is requesting access to the app.</p>
        <p style="margin: 28px 0;">
          <a href="${params.approveUrl}" style="background:#c9a227;color:#101010;padding:10px 22px;text-decoration:none;border-radius:6px;font-weight:bold;">Approve</a>
          &nbsp;&nbsp;
          <a href="${params.rejectUrl}" style="background:#b3261e;color:#fff;padding:10px 22px;text-decoration:none;border-radius:6px;">Reject</a>
        </p>
        <p style="color:#6d6f74;font-size:13px;">You can also manage requests in Settings → Users.</p>
      </div>`,
  };
}
