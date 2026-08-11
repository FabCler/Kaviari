import { cookies } from "next/headers";
import { z } from "zod";
import { AUTH_COOKIE, sessionToken, verifyPin } from "@/lib/auth";

const bodySchema = z.object({ pin: z.string().min(1).max(64) });

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
  if (!verifyPin(parsed.data.pin)) {
    return Response.json({ error: "Incorrect PIN" }, { status: 401 });
  }
  const store = await cookies();
  store.set(AUTH_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
  return Response.json({ ok: true });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
  return Response.json({ ok: true });
}
