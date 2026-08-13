import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, ownerEmail } from "@/lib/auth";

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

  // No approval step: every account is active immediately. The owner can
  // still block or remove accounts from Settings → Users.
  const isOwner = email === ownerEmail();
  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name.trim(),
      passwordHash: hashPassword(parsed.data.password),
      role: isOwner ? "owner" : "member",
      status: "approved",
    },
  });

  return Response.json(
    {
      ok: true,
      status: user.status,
      message: "Account created — you can sign in.",
    },
    { status: 201 }
  );
}
