import { z } from "zod";
import { prisma } from "@/lib/db";
import { approvalToken, hashPassword, ownerEmail } from "@/lib/auth";
import { accessRequestEmail, sendEmail } from "@/lib/email";

const bodySchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  password: z.string().min(6).max(200),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Please fill in every field (password: 6 characters minimum).",
      },
      { status: 400 }
    );
  }
  const email = parsed.data.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json(
      { error: "An account with this email already exists." },
      { status: 409 }
    );
  }

  const isOwner = email === ownerEmail();
  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name.trim(),
      passwordHash: hashPassword(parsed.data.password),
      role: isOwner ? "owner" : "member",
      status: isOwner ? "approved" : "pending",
    },
  });

  if (!isOwner) {
    // Notify the owner (silently skipped when SMTP is not configured —
    // requests then get approved from Settings → Users).
    const owner = await prisma.user.findFirst({
      where: { role: "owner" },
    });
    const baseUrl =
      process.env.APP_URL ?? new URL(request.url).origin;
    const email$ = accessRequestEmail({
      applicantName: user.name,
      applicantEmail: user.email,
      approveUrl: `${baseUrl}/api/users/action?id=${user.id}&action=approve&token=${approvalToken(user.id, "approve")}`,
      rejectUrl: `${baseUrl}/api/users/action?id=${user.id}&action=reject&token=${approvalToken(user.id, "reject")}`,
    });
    await sendEmail({
      to: owner?.email ?? ownerEmail(),
      subject: email$.subject,
      html: email$.html,
    });
  }

  return Response.json(
    {
      ok: true,
      status: user.status,
      message: isOwner
        ? "Owner account created — you can sign in."
        : "Request sent. You'll be able to sign in once the owner approves it.",
    },
    { status: 201 }
  );
}
