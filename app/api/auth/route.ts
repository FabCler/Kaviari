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
  if (user.status === "rejected") {
    return Response.json(
      { error: "This account has been blocked by the owner." },
      { status: 403 }
    );
  }
  // No approval step: accounts created before this policy change may still
  // be "pending" — promote them on their first successful sign-in.
  if (user.status === "pending") {
    await prisma.user.update({
      where: { id: user.id },
      data: { status: "approved" },
    });
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
