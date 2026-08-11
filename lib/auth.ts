import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/**
 * Single-tenant PIN gate. The PIN comes from APP_PIN (default 1234 for dev).
 * A successful login stores an HMAC of the PIN in an httpOnly cookie; server
 * components and route handlers verify it with `isAuthenticated()`.
 */

export const AUTH_COOKIE = "kaviari_session";

function secret(): string {
  return process.env.APP_SECRET ?? "kaviari-dev-secret-change-me";
}

export function expectedPin(): string {
  return process.env.APP_PIN ?? "1234";
}

export function sessionToken(): string {
  return createHmac("sha256", secret()).update(expectedPin()).digest("hex");
}

export function verifyPin(pin: string): boolean {
  const a = Buffer.from(pin);
  const b = Buffer.from(expectedPin());
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE)?.value;
  if (!token) return false;
  const expected = sessionToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Route-handler guard: returns a 401 Response or null when authenticated. */
export async function requireAuth(): Promise<Response | null> {
  if (await isAuthenticated()) return null;
  return Response.json({ error: "Not authenticated" }, { status: 401 });
}
