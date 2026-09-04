import Link from "next/link";
import { osms } from "@/lib/osms/db";
import { currentActor } from "@/lib/osms/guard";
import { can } from "@/lib/osms/permissions";
import { gateForPo } from "@/lib/osms/workflow";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { ToneBadge, documentTone, humanize } from "@/components/osms/status-badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Receiving" };

/**
 * §7 — the warehouse queue. Every purchase order is evaluated against the
 * six checks; only READY TO RECEIVE orders open a receipt.
 */
export default async function ReceivingPage() {
  const actor = (await currentActor())!;
  if (!can(actor, "warehouse.view")) return <NoAccess what="warehouse receiving" />;

  const orders = await osms.purchaseOrder.findMany({
    where: { status: { notIn: ["draft", "cancelled"] } },
    include: {
      supplier: true,
      lines: { include: { product: true } },
      receivings: true,
    },
    orderBy: { expectedDeliveryDate: "asc" },
    take: 100,
  });

  const evaluated = await Promise.all(
    orders.map(async (po) => ({ po, gate: await gateForPo(po.id) }))
  );

  const ready = evaluated.filter(
    (entry) => entry.gate?.ready && entry.po.receivings.length === 0
  );
  const blocked = evaluated.filter(
    (entry) => !entry.gate?.ready && entry.po.receivings.length === 0
  );
  const done = evaluated.filter((entry) => entry.po.receivings.length > 0);

  return (
    <div>
      <PageHeader
        title="Warehouse receiving"
        description="Only orders that cleared all six checks can be received."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KpiCard label="Ready to receive" value={ready.length} tone="success" />
        <KpiCard
          label="Blocked"
          value={blocked.length}
          tone={blocked.length > 0 ? "danger" : "default"}
        />
        <KpiCard label="Received" value={done.length} />
      </div>

      <Card>
        <CardContent className="px-0">
          {evaluated.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No purchase order has reached the warehouse yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Gate</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evaluated.map(({ po, gate }) => {
                    const receipt = po.receivings[0] ?? null;
                    return (
                      <TableRow key={po.id}>
                        <TableCell>
                          <Link
                            href={`/osms/trace/po/${po.id}`}
                            className="font-medium hover:text-gold-deep hover:underline"
                          >
                            {po.poNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">{po.supplier.name}</TableCell>
                        <TableCell className="text-sm">
                          {formatDate(po.expectedDeliveryDate)}
                        </TableCell>
                        <TableCell className="tnum text-right">
                          {po.lines.length}
                        </TableCell>
                        <TableCell className="text-sm">
                          {receipt ? (
                            <Link
                              href={`/osms/warehouse/receiving/${receipt.id}`}
                              className="hover:text-gold-deep hover:underline"
                            >
                              {receipt.receiptNumber}
                            </Link>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          {receipt ? (
                            <ToneBadge tone={documentTone(receipt.status)}>
                              {humanize(receipt.status)}
                            </ToneBadge>
                          ) : gate?.ready ? (
                            <ToneBadge tone="done">Ready to receive</ToneBadge>
                          ) : (
                            <>
                              <ToneBadge tone="blocked">Blocked</ToneBadge>
                              <div className="mt-0.5 max-w-[22rem] text-xs text-muted-foreground">
                                {gate?.blockedReason}
                              </div>
                            </>
                          )}
                        </TableCell>
                        <TableCell>
                          {receipt ? (
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/osms/warehouse/receiving/${receipt.id}`}>
                                Open
                              </Link>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant={gate?.ready ? "gold" : "outline"}
                              asChild
                            >
                              <Link href={`/osms/warehouse/receiving/new?po=${po.id}`}>
                                {gate?.ready ? "Receive" : "Why blocked?"}
                              </Link>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
