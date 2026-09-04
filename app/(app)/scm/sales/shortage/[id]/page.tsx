import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentScope } from "@/lib/scm/guard";
import { can } from "@/lib/scm/permissions";
import { proposeShortageSplit } from "@/lib/scm/shortage";
import { auditTrailFor } from "@/lib/scm/audit";
import { formatDate, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NoAccess } from "@/components/scm/no-access";
import { ToneBadge, documentTone, humanize } from "@/components/scm/status-badge";
import { ShortageDecision } from "@/components/scm/sales/shortage-decision";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = await prisma.scmShortageCase.findUnique({
    where: { id },
    select: { caseNumber: true },
  });
  return { title: `${entry?.caseNumber ?? "Shortage"} — Kaviari Cellar` };
}

/**
 * §45 — the decision screen. It shows the demand per channel, the proposal
 * the channel priorities produce, and an editable column the approver signs.
 * Nothing here is applied until they do.
 */
export default async function ShortageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await currentScope();
  if (!context) return <NoAccess what="cross-channel shortage" />;
  const { actor } = context;

  const { id } = await params;
  const entry = await prisma.scmShortageCase.findUnique({
    where: { id },
    include: {
      product: true,
      poLine: { include: { po: { include: { supplier: true } } } },
      lines: {
        include: {
          channel: true,
          customer: true,
          soLine: { include: { so: true } },
        },
        orderBy: { priority: "asc" },
      },
    },
  });
  if (!entry) notFound();

  const audit = await auditTrailFor("shortage_case", id, 40);
  const decided = ["approved", "applied", "rejected"].includes(entry.status);

  // Recompute the proposal so the screen always opens with the split the
  // current channel priorities imply — a stored proposal would go stale the
  // moment someone reorders the channels.
  const proposal = proposeShortageSplit(
    entry.actualQuantity,
    entry.lines.map((line) => ({
      channelId: line.channelId,
      channelCode: line.channel?.code ?? "—",
      channelName: line.channel?.name ?? "Unassigned channel",
      defaultPriority: line.channel?.defaultPriority ?? line.priority,
      soLineId: line.soLineId ?? line.id,
      soNumber: line.soLine?.so.soNumber ?? "—",
      customerId: line.customerId ?? "",
      customerName: line.customer?.name ?? "—",
      requestedQuantity: line.requestedQuantity,
    }))
  );
  const proposedBySoLine = new Map(
    proposal.map((line) => [line.soLineId, line.proposedQuantity])
  );

  return (
    <div>
      <PageHeader
        title={entry.caseNumber}
        description={`${entry.product.name} · ${entry.poLine?.po.poNumber ?? "—"} · ${
          entry.poLine?.po.supplier.name ?? ""
        }${entry.deliveryDate ? ` · delivery ${formatDate(entry.deliveryDate)}` : ""}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/scm/sales/shortage">All cases</Link>
            </Button>
            {entry.poLine ? (
              <Button variant="outline" asChild>
                <Link href={`/scm/trace/po/${entry.poLine.poId}`}>
                  Document trace
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">The shortfall</CardTitle>
          <ToneBadge tone={documentTone(entry.status)}>
            {humanize(entry.status)}
          </ToneBadge>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <Figure
              label="Total ordered by customers"
              value={`${formatNumber(entry.totalSoQuantity)} ${entry.unit}`}
            />
            <Figure
              label="Actually available"
              value={`${formatNumber(entry.actualQuantity)} ${entry.unit}`}
            />
            <Figure
              label="Short"
              value={`${formatNumber(entry.shortageQuantity)} ${entry.unit}`}
              tone="danger"
            />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            The quantities below are a <strong>proposal</strong> derived from the
            channel priorities. No customer order has been changed. Approving
            writes exactly the numbers in the &ldquo;Approved&rdquo; column.
          </p>
        </CardContent>
      </Card>

      <ShortageDecision
        caseId={entry.id}
        caseNumber={entry.caseNumber}
        unit={entry.unit}
        actualQuantity={entry.actualQuantity}
        decided={decided}
        canApprove={can(actor, "shortage.approve")}
        decisionNote={entry.decisionNote}
        approvedByName={entry.approvedByName}
        approvedAt={entry.approvedAt ? formatDate(entry.approvedAt) : null}
        lines={entry.lines.map((line) => ({
          id: line.id,
          channelCode: line.channel?.code ?? "—",
          channelName: line.channel?.name ?? "Unassigned channel",
          customerName: line.customer?.name ?? "—",
          soNumber: line.soLine?.so.soNumber ?? "—",
          requestedQuantity: line.requestedQuantity,
          approvedQuantity: line.approvedQuantity,
          proposedQuantity:
            proposedBySoLine.get(line.soLineId ?? line.id) ?? 0,
          priority: line.priority,
          reason: line.reason,
        }))}
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing recorded yet — the case is still waiting for a decision.
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {audit.map((row) => (
                <li key={row.id}>
                  <span className="text-muted-foreground">
                    {formatDate(row.createdAt)} · {row.userName ?? "system"} ·{" "}
                    {humanize(row.action)}
                  </span>{" "}
                  {row.field ? (
                    <span>
                      <span className="font-medium">{row.field}</span>
                      {row.oldValue != null ? ` ${row.oldValue} →` : ""}{" "}
                      {row.newValue ?? ""}
                    </span>
                  ) : null}
                  {row.reason ? (
                    <span className="text-muted-foreground"> ({row.reason})</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div>
      <div className="text-[0.68rem] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={
          tone === "danger"
            ? "tnum mt-1 text-2xl font-medium text-destructive"
            : "tnum mt-1 text-2xl font-medium"
        }
      >
        {value}
      </div>
    </div>
  );
}
