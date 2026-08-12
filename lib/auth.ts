import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import type { User } from "@prisma/client";

/**
 * Account-based auth. Users register with email + password; new accounts
 * are `pending` until the owner approves them (by email link or in the
 * Settings → Users panel). The account whose email matches OWNER_EMAIL is
 * auto-approved as owner on registration. Sessions are HMAC-signed cookies
 * carrying the user id.
 */

export const AUTH_COOKIE = "kaviari_session";

function secret(): string {
  return process.env.APP_SECRET ?? "kaviari-dev-secret-change-me";
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
  const payload = `session:${userId}`;
  return `${userId}.${sign(payload)}`;
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

// ---- approval action tokens (for email links) -----------------------------

export function approvalToken(userId: string, action: "approve" | "reject") {
  return sign(`approval:${userId}:${action}`);
}

export function verifyApprovalToken(
  userId: string,
  action: "approve" | "reject",
  token: string
): boolean {
  const expected = approvalToken(userId, action);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---- current user ----------------------------------------------------------

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

export async function isAuthenticated(): Promise<boolean> {
  return (await getCurrentUser()) !== null;
}

/** Route-handler guard: returns a 401 Response or null when authenticated. */
export async function requireAuth(): Promise<Response | null> {
  if (await isAuthenticated()) return null;
  return Response.json({ error: "Not authenticated" }, { status: 401 });
}

/** Like requireAuth but returns the user (or a 401 Response). */
export async function requireUser(): Promise<User | Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  return user;
}

/** Owner-only guard for route handlers. */
export async function requireOwner(): Promise<User | Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "owner") {
    return Response.json({ error: "Owner access required" }, { status: 403 });
  }
  return user;
}
