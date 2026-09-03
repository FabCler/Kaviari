import { prisma } from "@/lib/db";

/**
 * Document relationship trace (§13). Open any document and see the whole
 * chain it belongs to:
 *
 *   Customer → SO → PR → PO → Invoice → Receiving → Allocation → Shipment
 *
 * Every node carries its own status so the detail page can draw the stepper
 * without a second query per stage.
 */

export type TraceKind =
  | "so"
  | "pr"
  | "po"
  | "invoice"
  | "receiving"
  | "allocation"
  | "shipment";

export interface TraceNode {
  kind: TraceKind;
  id: string;
  number: string;
  title: string;
  subtitle?: string | null;
  status: string;
  date: Date | null;
  href: string;
}

export interface TraceResult {
  root: TraceNode;
  customers: { id: string; code: string; name: string }[];
  nodes: Record<TraceKind, TraceNode[]>;
  lines: {
    productCode: string;
    productName: string;
    soQuantity: number | null;
    poQuantity: number | null;
    invoiceQuantity: number | null;
    confirmedQuantity: number | null;
    receivedQuantity: number | null;
    allocatedQuantity: number | null;
    unit: string;
    status: string;
  }[];
}

const emptyNodes = (): Record<TraceKind, TraceNode[]> => ({
  so: [],
  pr: [],
  po: [],
  invoice: [],
  receiving: [],
  allocation: [],
  shipment: [],
});

function poNode(po: {
  id: string;
  poNumber: string;
  status: string;
  orderDate: Date;
  supplier: { name: string };
}): TraceNode {
  return {
    kind: "po",
    id: po.id,
    number: po.poNumber,
    title: `Purchase order ${po.poNumber}`,
    subtitle: po.supplier.name,
    status: po.status,
    date: po.orderDate,
    href: `/scm/trace/po/${po.id}`,
  };
}

/**
 * Resolve the full chain around a purchase order — the hub of the model,
 * which is why every other entry point resolves to its PO first.
 */
export async function tracePo(poId: string): Promise<TraceResult | null> {
  const po = await prisma.scmPurchaseOrder.findUnique({
    where: { id: poId },
    include: {
      supplier: true,
      invoices: { include: { lines: true } },
      lines: {
        include: {
          product: true,
          recons: true,
          demandLinks: {
            include: {
              soLine: { include: { so: { include: { customer: true } } } },
              prLine: { include: { pr: true } },
            },
          },
          receivingLines: { include: { receiving: true } },
          allocations: {
            include: {
              lines: {
                include: {
                  customer: true,
                  shipmentLines: { include: { shipment: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!po) return null;

  const nodes = emptyNodes();
  nodes.po.push(poNode(po));

  const customers = new Map<string, { id: string; code: string; name: string }>();
  const seen = new Set<string>();
  const push = (node: TraceNode) => {
    const key = `${node.kind}:${node.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    nodes[node.kind].push(node);
  };

  for (const invoice of po.invoices) {
    push({
      kind: "invoice",
      id: invoice.id,
      number: invoice.invoiceNumber,
      title: `Invoice ${invoice.invoiceNumber}`,
      subtitle: invoice.supplierNameRaw ?? po.supplier.name,
      status: invoice.status,
      date: invoice.invoiceDate,
      href: `/scm/purchasing/invoices/${invoice.id}`,
    });
  }

  const lines: TraceResult["lines"] = [];

  for (const line of po.lines) {
    for (const link of line.demandLinks) {
      if (link.soLine) {
        const so = link.soLine.so;
        customers.set(so.customerId, {
          id: so.customer.id,
          code: so.customer.code,
          name: so.customer.name,
        });
        push({
          kind: "so",
          id: so.id,
          number: so.soNumber,
          title: `Sales order ${so.soNumber}`,
          subtitle: so.customer.name,
          status: so.status,
          date: so.orderDate,
          href: `/scm/trace/so/${so.id}`,
        });
      }
      if (link.prLine) {
        push({
          kind: "pr",
          id: link.prLine.pr.id,
          number: link.prLine.pr.prNumber,
          title: `Purchase request ${link.prLine.pr.prNumber}`,
          subtitle: link.prLine.pr.requester,
          status: link.prLine.pr.status,
          date: link.prLine.pr.requestDate,
          href: `/scm/trace/pr/${link.prLine.pr.id}`,
        });
      }
    }

    for (const receivingLine of line.receivingLines) {
      push({
        kind: "receiving",
        id: receivingLine.receiving.id,
        number: receivingLine.receiving.receiptNumber,
        title: `Receiving ${receivingLine.receiving.receiptNumber}`,
        status: receivingLine.receiving.status,
        date: receivingLine.receiving.receivedDate,
        href: `/scm/warehouse/receiving/${receivingLine.receiving.id}`,
      });
    }

    for (const allocation of line.allocations) {
      push({
        kind: "allocation",
        id: allocation.id,
        number: allocation.allocationNumber,
        title: `Allocation ${allocation.allocationNumber}`,
        subtitle: `${allocation.allocatedQuantity} to customers · ${allocation.warehouseQuantity} to stock`,
        status: allocation.status,
        date: allocation.createdAt,
        href: `/scm/sales/allocation/${allocation.id}`,
      });
      for (const allocationLine of allocation.lines) {
        if (allocationLine.customer) {
          customers.set(allocationLine.customer.id, {
            id: allocationLine.customer.id,
            code: allocationLine.customer.code,
            name: allocationLine.customer.name,
          });
        }
        for (const shipmentLine of allocationLine.shipmentLines) {
          push({
            kind: "shipment",
            id: shipmentLine.shipment.id,
            number: shipmentLine.shipment.shipmentNumber,
            title: `Shipment ${shipmentLine.shipment.shipmentNumber}`,
            status: shipmentLine.shipment.status,
            date: shipmentLine.shipment.shipDate,
            href: `/scm/warehouse/shipments/${shipmentLine.shipment.id}`,
          });
        }
      }
    }

    const recon = line.recons[0];
    const soQuantity = line.demandLinks.reduce(
      (sum, link) => sum + (link.soLine ? link.quantity : 0),
      0
    );
    const received = line.receivingLines.reduce(
      (sum, rl) => sum + rl.actualQuantity,
      0
    );
    const allocated = line.allocations.reduce(
      (sum, a) => sum + a.allocatedQuantity + a.warehouseQuantity,
      0
    );

    lines.push({
      productCode: line.product.prCode,
      productName: line.product.name,
      soQuantity: soQuantity || null,
      poQuantity: line.baseQuantity,
      invoiceQuantity: recon?.invoiceQuantity ?? null,
      confirmedQuantity: line.correctedQuantity ?? recon?.correctedQuantity ?? null,
      receivedQuantity: received || null,
      allocatedQuantity: allocated || null,
      unit: line.product.unit,
      status: line.status,
    });
  }

  return {
    root: poNode(po),
    customers: [...customers.values()],
    nodes,
    lines,
  };
}

/** Entry points that resolve to the PO chain. */
export async function traceSo(soId: string): Promise<TraceResult | null> {
  const so = await prisma.scmSalesOrder.findUnique({
    where: { id: soId },
    include: {
      customer: true,
      lines: { include: { demandLinks: true } },
    },
  });
  if (!so) return null;

  const poLineIds = so.lines.flatMap((line) =>
    line.demandLinks.map((link) => link.poLineId)
  );
  const poLine = poLineIds.length
    ? await prisma.scmPurchaseOrderLine.findFirst({
        where: { id: { in: poLineIds } },
        select: { poId: true },
      })
    : null;

  if (poLine) {
    const trace = await tracePo(poLine.poId);
    if (trace) {
      return {
        ...trace,
        root: {
          kind: "so",
          id: so.id,
          number: so.soNumber,
          title: `Sales order ${so.soNumber}`,
          subtitle: so.customer.name,
          status: so.status,
          date: so.orderDate,
          href: `/scm/trace/so/${so.id}`,
        },
      };
    }
  }

  // No PO yet: the chain stops at the sales order.
  const nodes = emptyNodes();
  const root: TraceNode = {
    kind: "so",
    id: so.id,
    number: so.soNumber,
    title: `Sales order ${so.soNumber}`,
    subtitle: so.customer.name,
    status: so.status,
    date: so.orderDate,
    href: `/scm/trace/so/${so.id}`,
  };
  nodes.so.push(root);
  const full = await prisma.scmSalesOrder.findUnique({
    where: { id: soId },
    include: { lines: { include: { product: true } } },
  });
  return {
    root,
    customers: [
      { id: so.customer.id, code: so.customer.code, name: so.customer.name },
    ],
    nodes,
    lines:
      full?.lines.map((line) => ({
        productCode: line.product.prCode,
        productName: line.product.name,
        soQuantity: line.baseQuantity,
        poQuantity: null,
        invoiceQuantity: null,
        confirmedQuantity: line.confirmedQuantity,
        receivedQuantity: null,
        allocatedQuantity: null,
        unit: line.product.unit,
        status: line.status,
      })) ?? [],
  };
}

export async function tracePr(prId: string): Promise<TraceResult | null> {
  const pr = await prisma.scmPurchaseRequest.findUnique({
    where: { id: prId },
    include: {
      lines: { include: { demandLinks: true, product: true, soLine: true } },
    },
  });
  if (!pr) return null;

  const poLineIds = pr.lines.flatMap((line) =>
    line.demandLinks.map((link) => link.poLineId)
  );
  const poLine = poLineIds.length
    ? await prisma.scmPurchaseOrderLine.findFirst({
        where: { id: { in: poLineIds } },
        select: { poId: true },
      })
    : null;

  const root: TraceNode = {
    kind: "pr",
    id: pr.id,
    number: pr.prNumber,
    title: `Purchase request ${pr.prNumber}`,
    subtitle: pr.requester,
    status: pr.status,
    date: pr.requestDate,
    href: `/scm/trace/pr/${pr.id}`,
  };

  if (poLine) {
    const trace = await tracePo(poLine.poId);
    if (trace) return { ...trace, root };
  }

  const nodes = emptyNodes();
  nodes.pr.push(root);
  return {
    root,
    customers: [],
    nodes,
    lines: pr.lines.map((line) => ({
      productCode: line.product.prCode,
      productName: line.product.name,
      soQuantity: line.soLine ? line.baseQuantity : null,
      poQuantity: null,
      invoiceQuantity: null,
      confirmedQuantity: null,
      receivedQuantity: null,
      allocatedQuantity: null,
      unit: line.product.unit,
      status: line.status,
    })),
  };
}
