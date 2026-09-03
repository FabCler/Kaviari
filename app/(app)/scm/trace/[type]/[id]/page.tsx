import Link from "next/link";
import { notFound } from "next/navigation";
import { currentActor } from "@/lib/scm/guard";
import { auditTrailForDocument } from "@/lib/scm/audit";
import { tracePo, tracePr, traceSo, type TraceKind } from "@/lib/scm/trace";
import { formatDate, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge, ToneBadge, documentTone, humanize } from "@/components/scm/status-badge";
import { WorkflowStepper } from "@/components/scm/workflow-stepper";

export const dynamic = "force-dynamic";
export const metadata = { title: "Document trace — Kaviari Cellar" };

const CHAIN: { kind: TraceKind; label: string }[] = [
  { kind: "so", label: "Sales order" },
  { kind: "pr", label: "Purchase request" },
  { kind: "po", label: "Purchase order" },
  { kind: "invoice", label: "Invoice" },
  { kind: "receiving", label: "Receiving" },
  { kind: "allocation", label: "Allocation" },
  { kind: "shipment", label: "Shipment" },
];

/**
 * §13 — the whole chain around one document:
 * Customer → SO → PR → PO → Invoice → Receiving → Allocation → Shipment.
 */
export default async function TracePage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  await currentActor();
  const { type, id } = await params;

  const trace =
    type === "po"
      ? await tracePo(id)
      : type === "so"
        ? await traceSo(id)
        : type === "pr"
          ? await tracePr(id)
          : null;
  if (!trace) notFound();

  const audit = await auditTrailForDocument(trace.root.number, 60);
  const worstStatus =
    trace.lines.find((line) => line.status === "BLOCKED")?.status ??
    trace.lines[0]?.status ??
    "IMPORTED";

  return (
    <div>
      <PageHeader
        title={trace.root.title}
        description={[
          trace.root.subtitle,
          trace.root.date ? formatDate(trace.root.date) : null,
          trace.customers.map((customer) => customer.name).join(", ") || null,
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkflowStepper status={worstStatus} />
        </CardContent>
      </Card>

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {CHAIN.map((step) => {
          const nodes = trace.nodes[step.kind];
          return (
            <Card key={step.kind}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{step.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {nodes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Not started</p>
                ) : (
                  nodes.map((node) => (
                    <div key={`${node.kind}-${node.id}`} className="text-sm">
                      <Link
                        href={node.href}
                        className="font-medium hover:text-gold-deep hover:underline"
                      >
                        {node.number}
                      </Link>
                      <div className="flex items-center gap-1.5">
                        <ToneBadge tone={documentTone(node.status)}>
                          {humanize(node.status)}
                        </ToneBadge>
                        {node.date ? (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(node.date)}
                          </span>
                        ) : null}
                      </div>
                      {node.subtitle ? (
                        <div className="text-xs text-muted-foreground">
                          {node.subtitle}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Quantities through the chain</CardTitle>
          <p className="text-sm text-muted-foreground">
            The confirmed quantity — not the ordered one — drives everything
            after the reconciliation.
          </p>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">SO</TableHead>
                  <TableHead className="text-right">PO</TableHead>
                  <TableHead className="text-right">Invoice</TableHead>
                  <TableHead className="text-right">Confirmed</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trace.lines.map((line, index) => (
                  <TableRow key={`${line.productCode}-${index}`}>
                    <TableCell className="max-w-[18rem]">
                      <div className="truncate">{line.productName}</div>
                      <div className="text-xs text-muted-foreground">
                        {line.productCode} · {line.unit}
                      </div>
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {line.soQuantity == null ? "-" : formatNumber(line.soQuantity)}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {line.poQuantity == null ? "-" : formatNumber(line.poQuantity)}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {line.invoiceQuantity == null
                        ? "-"
                        : formatNumber(line.invoiceQuantity)}
                    </TableCell>
                    <TableCell className="tnum text-right font-medium">
                      {line.confirmedQuantity == null
                        ? "-"
                        : formatNumber(line.confirmedQuantity)}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {line.receivedQuantity == null
                        ? "-"
                        : formatNumber(line.receivedQuantity)}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {line.allocatedQuantity == null
                        ? "-"
                        : formatNumber(line.allocatedQuantity)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={line.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit trail for {trace.root.number}</CardTitle>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {audit.map((entry) => (
                <li key={entry.id}>
                  <span className="text-muted-foreground">
                    {formatDate(entry.createdAt)} · {entry.userName ?? "system"} ·{" "}
                    {humanize(entry.action)}
                  </span>{" "}
                  {entry.field ? (
                    <span>
                      <span className="font-medium">{entry.field}</span>{" "}
                      {entry.oldValue != null ? (
                        <span className="line-through opacity-60">
                          {entry.oldValue}
                        </span>
                      ) : null}
                      {entry.newValue != null ? ` → ${entry.newValue}` : ""}
                    </span>
                  ) : null}
                  {entry.reason ? (
                    <span className="text-muted-foreground"> ({entry.reason})</span>
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
