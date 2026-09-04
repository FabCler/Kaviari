import { z } from "zod";
import { osms } from "@/lib/osms/db";
import { requirePermission, isResponse } from "@/lib/osms/guard";
import { recordAudit } from "@/lib/osms/audit";
import { nextExceptionCode } from "@/lib/osms/numbering";
import {
  DEPARTMENTS,
  EXCEPTION_SEVERITIES,
  EXCEPTION_STATUSES,
  EXCEPTION_TYPES,
} from "@/lib/osms/domain";

export const dynamic = "force-dynamic";

/** §15 — raise an exception by hand, or move one along its lifecycle. */

const createSchema = z.object({
  type: z.enum(EXCEPTION_TYPES),
  severity: z.enum(EXCEPTION_SEVERITIES).default("medium"),
  documentType: z.string().max(40).nullable().optional(),
  documentId: z.string().max(60).nullable().optional(),
  documentNumber: z.string().max(60).nullable().optional(),
  description: z.string().min(1).max(1000),
  reason: z.string().max(1000).nullable().optional(),
  responsibleDept: z.enum(DEPARTMENTS),
  action: z.string().max(500).nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(EXCEPTION_STATUSES).optional(),
  action: z.string().max(500).nullable().optional(),
  responsibleDept: z.enum(DEPARTMENTS).optional(),
  dueDate: z.string().nullable().optional(),
  resolution: z.string().max(1000).optional(),
});

function parseDay(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value.length <= 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: Request) {
  const actor = await requirePermission("exceptions.manage");
  if (isResponse(actor)) return actor;

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid exception." },
      { status: 400 }
    );
  }
  const body = parsed.data;
  const code = await nextExceptionCode();

  const exception = await osms.exception.create({
    data: {
      code,
      type: body.type,
      severity: body.severity,
      documentType: body.documentType ?? null,
      documentId: body.documentId ?? null,
      documentNumber: body.documentNumber ?? null,
      description: body.description,
      reason: body.reason ?? null,
      responsibleDept: body.responsibleDept,
      action: body.action ?? null,
      dueDate: parseDay(body.dueDate),
      createdByName: actor.name,
    },
  });

  await recordAudit(
    { entity: "exception", entityId: exception.id, documentNumber: code, actor },
    [{ action: "create", field: "type", newValue: body.type, reason: body.reason }]
  );

  return Response.json({ id: exception.id, code }, { status: 201 });
}

export async function PATCH(request: Request) {
  const actor = await requirePermission("exceptions.manage");
  if (isResponse(actor)) return actor;

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { id, ...patch } = parsed.data;

  const existing = await osms.exception.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Exception not found." }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (patch.status && patch.status !== existing.status) {
    data.status = patch.status;
    if (patch.status === "resolved") {
      data.resolvedByName = actor.name;
      data.resolvedAt = new Date();
      data.resolution = patch.resolution ?? "Resolved";
    }
  }
  if (patch.action !== undefined) data.action = patch.action;
  if (patch.responsibleDept) data.responsibleDept = patch.responsibleDept;
  if (patch.dueDate !== undefined) data.dueDate = parseDay(patch.dueDate);

  if (Object.keys(data).length === 0) return Response.json({ ok: true });

  await osms.exception.update({ where: { id }, data });
  await recordAudit(
    {
      entity: "exception",
      entityId: id,
      documentNumber: existing.code,
      actor,
    },
    Object.entries(data)
      .filter(([field]) => !["resolvedByName", "resolvedAt"].includes(field))
      .map(([field, value]) => ({
        action: field === "status" ? "status_change" : "update",
        field,
        oldValue: (existing as unknown as Record<string, unknown>)[field],
        newValue: value,
        reason: patch.resolution ?? null,
      }))
  );

  return Response.json({ ok: true });
}
