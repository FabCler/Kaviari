import { prisma } from "@/lib/db";
import { currentActor } from "@/lib/scm/guard";
import { can } from "@/lib/scm/permissions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/scm/kpi-card";
import { ExceptionBoard } from "@/components/scm/exception-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Exceptions — Kaviari Cellar" };

/**
 * §15 — every exception carries a reason, a responsible department, an
 * action, a due date and a status. This is the queue those five fields feed.
 */
export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; dept?: string }>;
}) {
  const actor = (await currentActor())!;
  const filters = await searchParams;

  const exceptions = await prisma.scmException.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.dept ? { responsibleDept: filters.dept } : {}),
    },
    orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }],
    take: 300,
  });

  const open = exceptions.filter((row) => row.status === "open").length;
  const inProgress = exceptions.filter((row) => row.status === "in_progress").length;
  const overdue = exceptions.filter(
    (row) =>
      row.dueDate != null &&
      row.dueDate < new Date() &&
      ["open", "in_progress"].includes(row.status)
  ).length;

  return (
    <div>
      <PageHeader
        title="Exception management"
        description="Short and over deliveries, price and unit mismatches, orphan documents, excess stock — each with an owner and an action."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Open" value={open} tone={open > 0 ? "danger" : "success"} />
        <KpiCard label="In progress" value={inProgress} tone="warning" />
        <KpiCard label="Overdue" value={overdue} tone={overdue > 0 ? "danger" : "default"} />
        <KpiCard label="Total listed" value={exceptions.length} />
      </div>

      {exceptions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No exception matches these filters.
          </CardContent>
        </Card>
      ) : (
        <ExceptionBoard
          canManage={can(actor, "exceptions.manage")}
          rows={exceptions.map((row) => ({
            id: row.id,
            code: row.code,
            type: row.type,
            severity: row.severity,
            documentNumber: row.documentNumber,
            documentType: row.documentType,
            description: row.description,
            reason: row.reason,
            responsibleDept: row.responsibleDept,
            action: row.action,
            dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
            status: row.status,
            resolution: row.resolution,
            resolvedByName: row.resolvedByName,
            createdAt: row.createdAt.toISOString(),
          }))}
        />
      )}
    </div>
  );
}
