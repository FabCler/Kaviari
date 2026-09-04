import Link from "next/link";
import { osms } from "@/lib/osms/db";
import { currentScope } from "@/lib/osms/guard";
import { can } from "@/lib/osms/permissions";
import { formatDate, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/osms/kpi-card";
import { NoAccess } from "@/components/osms/no-access";
import { ChannelBadge } from "@/components/osms/channel-filter";
import { ToneBadge, documentTone, humanize } from "@/components/osms/status-badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cross-channel shortage" };

/**
 * §20 / §45 — the shortage queue. Every case here is a delivery that cannot
 * cover the demand of more than one channel, waiting for a person to decide
 * who gets cut. The system proposes; it never applies.
 */
export default async function ShortagePage() {
  const context = await currentScope();
  if (!context) return <NoAccess what="cross-channel shortage" />;
  const { actor } = context;
  if (!can(actor, "sales.view") && !can(actor, "shortage.approve")) {
    return <NoAccess what="cross-channel shortage" />;
  }

  const cases = await osms.shortageCase.findMany({
    include: {
      product: true,
      poLine: { include: { po: true } },
      lines: { include: { channel: true, customer: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  const pending = cases.filter((entry) =>
    ["open", "pending_approval"].includes(entry.status)
  ).length;
  const shortTotal = cases
    .filter((entry) => ["open", "pending_approval"].includes(entry.status))
    .reduce((sum, entry) => sum + entry.shortageQuantity, 0);

  return (
    <div>
      <PageHeader
        title="Cross-channel shortage"
        description="One delivery, several channels, not enough to go round. The system lays out the shortfall and waits — it never reduces a customer on its own."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KpiCard label="Cases" value={cases.length} />
        <KpiCard
          label="Waiting for a decision"
          value={pending}
          tone={pending > 0 ? "danger" : "success"}
        />
        <KpiCard
          label="Total shortfall"
          value={formatNumber(shortTotal)}
          tone={shortTotal > 0 ? "warning" : "default"}
        />
      </div>

      <Card>
        <CardContent className="px-0">
          {cases.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No cross-channel shortage — every delivery covered the demand it
              was bought for.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Channels</TableHead>
                    <TableHead className="text-right">Demand</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Short</TableHead>
                    <TableHead>Delivery</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">
                        {entry.caseNumber}
                        <div className="text-xs text-muted-foreground">
                          {entry.poLine?.po.poNumber ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[16rem]">
                        <div className="truncate">{entry.product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.product.code}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {[
                            ...new Set(
                              entry.lines.map((line) => line.channel?.code ?? "—")
                            ),
                          ].map((code) => (
                            <ChannelBadge key={code} code={code} />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="tnum text-right">
                        {formatNumber(entry.totalSoQuantity)} {entry.unit}
                      </TableCell>
                      <TableCell className="tnum text-right font-medium">
                        {formatNumber(entry.actualQuantity)} {entry.unit}
                      </TableCell>
                      <TableCell className="tnum text-right text-destructive">
                        −{formatNumber(entry.shortageQuantity)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.deliveryDate ? formatDate(entry.deliveryDate) : "—"}
                      </TableCell>
                      <TableCell>
                        <ToneBadge tone={documentTone(entry.status)}>
                          {humanize(entry.status)}
                        </ToneBadge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/osms/sales/shortage/${entry.id}`}>
                            {["open", "pending_approval"].includes(entry.status)
                              ? "Decide"
                              : "Open"}
                          </Link>
                        </Button>
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
