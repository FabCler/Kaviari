import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import type { User } from "@prisma/client";
import { isAdmin, type Section, canSee } from "@/lib/permissions";

/**
 * Account-based auth, the same shape as the Kaviari app: register with email
 * and password, sessions are HMAC-signed cookies carrying the user id.
 *
 * Unlike Kaviari, a new account here stays `pending` until an owner or admin
 * approves it and gives it a department — this app releases goods, so nobody
 * gets in by signing up. The account whose email matches OWNER_EMAIL is the
 * owner and is approved on registration.
 */

export const AUTH_COOKIE = "dc2_session";

function secret(): string {
  return process.env.APP_SECRET ?? "dc2-dev-secret-change-me";
}

export function ownerEmail(): string {
  return (process.env.OWNER_EMAIL ?? "fabien@thammachartseafood.com")
    .trim()
    .toLowerCase();
}

// ---- passwords -----------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}

// ---- session tokens ------------------------------------------------------

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function sessionTokenFor(userId: string): string {
  return `${userId}.${sign(`session:${userId}`)}`;
}

export function userIdFromToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(`session:${userId}`);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}

export async function setSessionCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(AUTH_COOKIE, sessionTokenFor(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
}

// ---- current user --------------------------------------------------------

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  const userId = userIdFromToken(token);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "approved") return null;
  return user;
}

/**
 * Guard for route handlers and server actions. Server Functions are reachable
 * by a direct POST, not only through the UI, so every one of them calls this
 * before touching the database.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Not signed in", 401);
  return user;
}

export async function requireSection(section: Section): Promise<User> {
  const user = await requireUser();
  if (!canSee(user, section)) {
    throw new AuthError("Your department does not have access to this screen", 403);
  }
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!isAdmin(user)) throw new AuthError("Administrator access required", 403);
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}
