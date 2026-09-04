import { osms } from "@/lib/osms/db";
import { currentScope } from "@/lib/osms/guard";
import { narrowScope } from "@/lib/osms/channels";
import { can } from "@/lib/osms/permissions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/osms/kpi-card";
import { ExceptionBoard } from "@/components/osms/exception-board";
import { NoAccess } from "@/components/osms/no-access";
import { ChannelFilter } from "@/components/osms/channel-filter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Exception center" };

/**
 * §15 — every exception carries a reason, a responsible department, an
 * action, a due date and a status. This is the queue those five fields feed.
 */
export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; dept?: string; channel?: string }>;
}) {
  const context = await currentScope();
  if (!context) return <NoAccess what="the exception center" />;
  const { actor, scope } = context;
  const filters = await searchParams;
  const visible = narrowScope(scope, filters.channel);

  const exceptions = await osms.exception.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.dept ? { responsibleDept: filters.dept } : {}),
      // An exception with no channel belongs to the whole business and is
      // shown to everyone; a channel-tagged one follows the user's scope.
      ...(visible.all
        ? {}
        : { OR: [{ channelId: null }, { channelId: { in: visible.ids } }] }),
    },
    orderBy: [{ status: "asc" }, { priority: "desc" }, { dueDate: "asc" }],
    take: 300,
  });
  const channelById = new Map(
    scope.channels.map((channel) => [channel.id, channel])
  );

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
        title="Exception center"
        description="Short and over deliveries, price and unit mismatches, orphan documents, excess stock — each with an owner and an action."
      />

      <div className="mb-4">
        <ChannelFilter channels={scope.channels} />
      </div>

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
            priority: row.priority,
            ownerName: row.ownerName,
            channelCode: row.channelId
              ? (channelById.get(row.channelId)?.code ?? null)
              : null,
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
