import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AUTH_COOKIE, sessionTokenFor, verifyPassword } from "@/lib/auth";

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
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return Response.json(
      { error: "Incorrect email or password." },
      { status: 401 }
    );
  }
  if (user.status === "pending") {
    return Response.json(
      {
        error:
          "Your account is awaiting approval. You'll be able to sign in once the owner approves your request.",
      },
      { status: 403 }
    );
  }
  if (user.status !== "approved") {
    return Response.json(
      { error: "Your access request was declined." },
      { status: 403 }
    );
  }
  const store = await cookies();
  store.set(AUTH_COOKIE, sessionTokenFor(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return Response.json({ ok: true, role: user.role });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
  return Response.json({ ok: true });
}
