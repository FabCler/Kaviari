import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { shortProductName } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PoStatusBadge } from "@/components/purchase-orders/po-status-badge";
import { PoDetailClient } from "@/components/purchase-orders/po-detail-client";
import type {
  PoDto,
  ProductOptionDto,
} from "@/components/purchase-orders/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Purchase Order — Kaviari Cellar" };

export default async function PurchaseOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ receive?: string }>;
}) {
  const [{ id }, { receive }] = await Promise.all([params, searchParams]);

  const [po, settings, products] = await Promise.all([
    prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        lines: { include: { product: true } },
      },
    }),
    getSettings(),
    prisma.product.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
  ]);

  if (!po) notFound();

  const dto: PoDto = {
    id: po.id,
    reference: po.reference,
    status: po.status,
    orderDate: po.orderDate.toISOString(),
    expectedDeliveryDate: po.expectedDeliveryDate.toISOString(),
    receivedDate: po.receivedDate ? po.receivedDate.toISOString() : null,
    notes: po.notes,
    lines: po.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      productName: shortProductName(line.product.name),
      tinSizeGrams: line.product.tinSizeGrams,
      quantityTins: line.quantityTins,
      unitCost: line.unitCost,
    })),
  };

  const productOptions: ProductOptionDto[] = products.map((product) => ({
    id: product.id,
    name: shortProductName(product.name),
    tinSizeGrams: product.tinSizeGrams,
    unitCost: product.unitCost,
  }));

  return (
    <div>
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {po.reference}
            <PoStatusBadge status={po.status} />
          </span>
        }
        description={
          po.status === "draft"
            ? "Draft order — adjust the lines, then mark it as sent to start the next review cycle."
            : po.status === "received"
              ? "This delivery has been received into stock."
              : po.status === "cancelled"
                ? "This order was cancelled and no longer counts as pipeline stock."
                : "Open order — its lines count as pipeline stock in the planner."
        }
        actions={
          <Button variant="ghost" asChild>
            <Link href="/purchase-orders">
              <ArrowLeft aria-hidden /> All orders
            </Link>
          </Button>
        }
      />

      <PoDetailClient
        po={dto}
        products={productOptions}
        currency={settings.currency}
        autoOpenReceive={receive === "1"}
      />
    </div>
  );
}
