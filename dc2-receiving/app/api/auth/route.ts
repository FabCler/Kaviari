import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  clearSessionCookie,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";

const bodySchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
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
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  // One message for both cases, so the form cannot be used to find out which
  // email addresses have an account.
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return Response.json(
      { error: "Incorrect email or password." },
      { status: 401 }
    );
  }
  if (user.status === "blocked") {
    return Response.json(
      { error: "This account has been blocked. Ask the owner to restore it." },
      { status: 403 }
    );
  }
  if (user.status !== "approved") {
    return Response.json(
      {
        error:
          "This account is waiting for approval. The owner has to approve it and set your department before you can sign in.",
      },
      { status: 403 }
    );
  }
  await setSessionCookie(user.id);
  return Response.json({ ok: true });
}

export async function DELETE() {
  await clearSessionCookie();
  return Response.json({ ok: true });
}
