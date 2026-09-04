import { PrismaClient } from "@/lib/generated/osms";

/**
 * The OSMS database connection.
 *
 * Deliberately separate from the host application's client (`@/lib/db`):
 * OSMS owns its own schema, its own migrations and its own connection string
 * (OSMS_DATABASE_URL). Nothing in this module may reach across into a host
 * table, and nothing in the host may reach in here — the two systems meet
 * only at the signed-in account's email address (see `lib/osms/guard.ts`).
 */
const globalForOsms = globalThis as unknown as { osms?: PrismaClient };

export const osms = globalForOsms.osms ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForOsms.osms = osms;
}
