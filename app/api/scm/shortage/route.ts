import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, isResponse } from "@/lib/scm/guard";
import { validateShortageDecision } from "@/lib/scm/shortage";
import { compareSoConfirmed } from "@/lib/scm/reconcile";
import { recordAudit } from "@/lib/scm/audit";
import { resolveExceptions } from "@/lib/scm/exceptions";
import { notify } from "@/lib/scm/notify";
import { syncPoStatuses } from "@/lib/scm/workflow";
import { round } from "@/lib/scm/units";

export const dynamic = "force-dynamic";

/**
 * §20 / §45 — approve a cross-channel shortage.
 *
 * This is the only path that may reduce a customer order when several
 * channels compete for the same short delivery, and it is gated on
 * `shortage.approve` (management, or a sales manager who sees every channel).
 * The proposal the screen opens with carries no weight: what gets written is
 * exactly what the approver signs.
 */

const bodySchema = z.object({
  caseId: z.string().min(1),
  action: z.enum(["approve", "reject"]),
  decisionNote: z.string().max(1000).optional(),
  lines: z
    .array(
      z.object({
        id: z.string().min(1),
        approvedQuantity: z.number().min(0),
        priority: z.number().int().min(0).max(999).optional(),
        reason: z.string().max(500).nullable().optional(),
      })
    )
    .max(200)
    .default([]),
});

export async function POST(request: Request) {
  const actor = await requirePermission("shortage.approve");
  if (isResponse(actor)) return actor;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const shortageCase = await prisma.scmShortageCase.findUnique({
    where: { id: body.caseId },
    include: {
      product: true,
      poLine: { include: { po: true } },
      lines: {
        include: {
          channel: true,
          customer: true,
          soLine: { include: { so: true } },
        },
      },
    },
  });
  if (!shortageCase) {
    return Response.json({ error: "Shortage case not found." }, { status: 404 });
  }
  if (["approved", "applied", "rejected"].includes(shortageCase.status)) {
    return Response.json(
      { error: "This shortage case has already been decided." },
      { status: 409 }
    );
  }

  const context = {
    entity: "shortage_case",
    entityId: shortageCase.id,
    documentNumber: shortageCase.caseNumber,
    actor,
  };

  if (body.action === "reject") {
    if (!body.decisionNote?.trim()) {
      return Response.json(
        { error: "Say why the split is rejected — it goes back to purchasing." },
        { status: 422 }
      );
    }
    await prisma.scmShortageCase.update({
      where: { id: shortageCase.id },
      data: {
        status: "rejected",
        decisionNote: body.decisionNote,
        approvedByName: actor.name,
        approvedAt: new Date(),
      },
    });
    await recordAudit(context, [
      {
        action: "reject",
        field: "status",
        oldValue: shortageCase.status,
        newValue: "rejected",
        reason: body.decisionNote,
      },
    ]);
    await notify({
      department: "purchasing",
      type: "shortage_rejected",
      severity: "critical",
      title: `${shortageCase.caseNumber} rejected`,
      body: body.decisionNote,
      documentType: "shortage_case",
      documentId: shortageCase.id,
      documentNumber: shortageCase.caseNumber,
    });
    if (shortageCase.poLine) await syncPoStatuses(shortageCase.poLine.poId);
    return Response.json({ ok: true, status: "rejected" });
  }

  // ---- approve ------------------------------------------------------------
  const byId = new Map(body.lines.map((line) => [line.id, line]));
  const merged = shortageCase.lines.map((line) => ({
    line,
    approvedQuantity: byId.get(line.id)?.approvedQuantity ?? null,
    priority: byId.get(line.id)?.priority ?? line.priority,
    reason: byId.get(line.id)?.reason ?? line.reason,
  }));

  const validation = validateShortageDecision(
    shortageCase.actualQuantity,
    merged.map((entry) => ({
      requestedQuantity: entry.line.requestedQuantity,
      approvedQuantity: entry.approvedQuantity,
    }))
  );
  if (!validation.ok) {
    return Response.json(
      { error: validation.errors[0], errors: validation.errors },
      { status: 422 }
    );
  }

  const now = new Date();
  await prisma.scmShortageCase.update({
    where: { id: shortageCase.id },
    data: {
      status: "applied",
      decisionNote: body.decisionNote ?? null,
      approvedByName: actor.name,
      approvedAt: now,
    },
  });

  const auditRows: {
    action: string;
    field: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string | null;
  }[] = [
    {
      action: "approve",
      field: "status",
      oldValue: shortageCase.status,
      newValue: "applied",
      reason: body.decisionNote ?? "Cross-channel shortage approved",
    },
  ];

  for (const entry of merged) {
    const approved = round(entry.approvedQuantity!);
    await prisma.scmShortageAllocation.update({
      where: { id: entry.line.id },
      data: {
        approvedQuantity: approved,
        priority: entry.priority,
        reason: entry.reason ?? null,
      },
    });

    if (!entry.line.soLine) continue;

    const soLine = entry.line.soLine;
    const result = compareSoConfirmed(soLine.quantity, approved);

    // Write the sales review from the approved figure and close it: the
    // decision has already been made by someone entitled to make it.
    const existing = await prisma.scmSoPoRecon.findFirst({
      where: { soLineId: soLine.id, poLineId: shortageCase.poLineId },
    });
    const payload = {
      soLineId: soLine.id,
      poLineId: shortageCase.poLineId,
      productId: shortageCase.productId,
      soQuantity: soLine.quantity,
      confirmedQuantity: approved,
      diff: result.diff,
      diffPct: result.diffPct,
      diffStatus: result.diffStatus,
      status: "completed",
      decision: approved < soLine.quantity ? "reduce_so" : "keep_so",
      reason: `Cross-channel shortage ${shortageCase.caseNumber} — approved by ${actor.name}`,
      newSoQuantity: approved,
      reviewedByName: actor.name,
      reviewedAt: now,
    };
    if (existing) {
      await prisma.scmSoPoRecon.update({ where: { id: existing.id }, data: payload });
    } else {
      await prisma.scmSoPoRecon.create({ data: payload });
    }

    if (approved !== soLine.quantity) {
      auditRows.push({
        action: "update",
        field: `${soLine.so.soNumber} quantity`,
        oldValue: soLine.quantity,
        newValue: approved,
        reason: `${entry.line.channel?.code ?? "—"} · ${shortageCase.caseNumber}`,
      });
    }

    await prisma.scmSalesOrderLine.update({
      where: { id: soLine.id },
      data: {
        quantity: approved,
        confirmedQuantity: approved,
        status: "SALES_REVIEW_COMPLETED",
      },
    });
  }

  await recordAudit(context, auditRows);

  await resolveExceptions(
    { documentType: "shortage_case", documentId: shortageCase.id },
    {
      resolution: `Approved by ${actor.name}: ${merged
        .map(
          (entry) =>
            `${entry.line.channel?.code ?? "—"} ${entry.approvedQuantity}`
        )
        .join(", ")}`,
      resolvedByName: actor.name,
    }
  );

  if (shortageCase.poLine) {
    await syncPoStatuses(shortageCase.poLine.poId);
    await notify([
      {
        department: "sales",
        type: "shortage_approved",
        severity: "warning",
        title: `${shortageCase.caseNumber} approved — allocate the agreed quantities`,
        body: merged
          .map(
            (entry) =>
              `${entry.line.channel?.code ?? "—"} ${entry.line.customer?.name ?? ""}: ${entry.approvedQuantity} of ${entry.line.requestedQuantity}`
          )
          .join(" · "),
        documentType: "po",
        documentId: shortageCase.poLine.poId,
        documentNumber: shortageCase.poLine.po.poNumber,
        link: `/scm/sales/allocation?po=${shortageCase.poLine.poId}`,
      },
    ]);
  }

  return Response.json({
    ok: true,
    status: "applied",
    approvedTotal: validation.approvedTotal,
  });
}
