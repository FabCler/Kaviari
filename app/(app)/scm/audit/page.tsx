import { prisma } from "@/lib/db";
import { currentActor } from "@/lib/scm/guard";
import { can } from "@/lib/scm/permissions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NoAccess } from "@/components/scm/no-access";
import { humanize } from "@/components/scm/status-badge";
import { AuditFilters } from "@/components/scm/audit-filters";
import { ExportButton } from "@/components/scm/export-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit trail — Kaviari Cellar" };

/** §12 — user, date, time, field, old value, new value, reason, document. */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; entity?: string; action?: string }>;
}) {
  const actor = (await currentActor())!;
  if (!can(actor, "audit.view")) return <NoAccess what="the audit trail" />;

  const filters = await searchParams;
  const entries = await prisma.scmAuditLog.findMany({
    where: {
      ...(filters.entity ? { entity: filters.entity } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.q
        ? {
            OR: [
              { documentNumber: { contains: filters.q } },
              { userName: { contains: filters.q } },
              { field: { contains: filters.q } },
              { newValue: { contains: filters.q } },
              { reason: { contains: filters.q } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const entities = await prisma.scmAuditLog.findMany({
    distinct: ["entity"],
    select: { entity: true },
    orderBy: { entity: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Audit trail"
        description="Every recorded change, newest first. Nothing is ever deleted — corrections are appended."
        actions={
          <ExportButton href="/api/scm/exports/audit" />
        }
      />

      <AuditFilters entities={entities.map((row) => row.entity)} />

      <Card className="mt-4">
        <CardContent className="px-0">
          {entries.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              Nothing recorded for these filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Old → new</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="tnum text-xs whitespace-nowrap">
                        {entry.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.userName ?? "system"}
                        <div className="text-xs text-muted-foreground">
                          {entry.department ?? ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.documentNumber ?? "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {humanize(entry.entity)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {humanize(entry.action)}
                      </TableCell>
                      <TableCell className="text-sm">{entry.field ?? "-"}</TableCell>
                      <TableCell className="max-w-[20rem] text-sm">
                        {entry.oldValue != null ? (
                          <span className="text-muted-foreground line-through">
                            {entry.oldValue}
                          </span>
                        ) : null}
                        {entry.oldValue != null && entry.newValue != null ? " → " : ""}
                        {entry.newValue ?? ""}
                      </TableCell>
                      <TableCell className="max-w-[18rem] text-xs text-muted-foreground">
                        {entry.reason ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
