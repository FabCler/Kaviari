import { osms } from "@/lib/osms/db";
import type { Prisma } from "@/lib/generated/osms";
import { departmentOf, type Actor } from "@/lib/osms/permissions";

/**
 * Audit trail (§12). Nothing important is ever overwritten silently: each
 * change writes user, timestamp, field, old value, new value, reason and the
 * document number it belongs to. `diffFields` turns a before/after pair into
 * one row per changed field, which is what the History panel renders.
 */

export interface AuditContext {
  entity: string;
  entityId: string;
  documentNumber?: string | null;
  actor: Actor;
  reason?: string | null;
}

export type AuditClient = Prisma.TransactionClient | typeof osms;

function stringify(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function recordAudit(
  context: AuditContext,
  entries: {
    action: string;
    field?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string | null;
  }[],
  client: AuditClient = osms
): Promise<void> {
  if (entries.length === 0) return;
  await client.auditLog.createMany({
    data: entries.map((entry) => ({
      entity: context.entity,
      entityId: context.entityId,
      documentNumber: context.documentNumber ?? null,
      action: entry.action,
      field: entry.field ?? null,
      oldValue: stringify(entry.oldValue),
      newValue: stringify(entry.newValue),
      reason: entry.reason ?? context.reason ?? null,
      userId: context.actor.id,
      userName: context.actor.name,
      department: departmentOf(context.actor),
    })),
  });
}

/** Convenience: one row, the common case. */
export async function auditEvent(
  context: AuditContext,
  action: string,
  details: {
    field?: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string | null;
  } = {},
  client: AuditClient = osms
): Promise<void> {
  await recordAudit(context, [{ action, ...details }], client);
}

/** One audit row per field that actually changed. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: (keyof T & string)[]
): { action: string; field: string; oldValue: unknown; newValue: unknown }[] {
  const rows: {
    action: string;
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }[] = [];
  for (const field of fields) {
    if (!(field in after)) continue;
    const oldValue = before[field];
    const newValue = after[field];
    const same =
      oldValue instanceof Date && newValue instanceof Date
        ? oldValue.getTime() === newValue.getTime()
        : oldValue === newValue;
    if (same) continue;
    rows.push({ action: "update", field, oldValue, newValue });
  }
  return rows;
}

export async function auditTrailFor(
  entity: string,
  entityId: string,
  take = 100
) {
  return osms.auditLog.findMany({
    where: { entity, entityId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function auditTrailForDocument(documentNumber: string, take = 200) {
  return osms.auditLog.findMany({
    where: { documentNumber },
    orderBy: { createdAt: "desc" },
    take,
  });
}
