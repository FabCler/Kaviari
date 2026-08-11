import { format } from "date-fns";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { AI_UNAVAILABLE_MESSAGE, isAiConfigured } from "@/lib/ai";
import { formatDate, shortProductName } from "@/lib/format";
import type {
  CampaignStatus,
  CampaignType,
  ContentType,
} from "@/lib/domain";
import { PageHeader } from "@/components/page-header";
import { MarketingView } from "@/components/marketing/marketing-view";
import type {
  AssetView,
  CampaignPrefill,
  CampaignView,
  ProductOption,
} from "@/components/marketing/types";

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; promoteLot?: string }>;
}) {
  const { month, promoteLot } = await searchParams;

  const [campaignRecords, productRecords, assetRecords, settings] =
    await Promise.all([
      prisma.campaign.findMany({
        include: { products: { include: { product: true } } },
        orderBy: { startDate: "desc" },
      }),
      prisma.product.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      }),
      prisma.contentAsset.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { campaign: { select: { name: true } } },
      }),
      getSettings(),
    ]);

  const campaigns: CampaignView[] = campaignRecords.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type as CampaignType,
    status: c.status as CampaignStatus,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate ? c.endDate.toISOString() : null,
    budget: c.budget,
    notes: c.notes,
    results: c.results,
    resultRevenue: c.resultRevenue,
    productIds: c.products.map((cp) => cp.productId),
    productNames: c.products.map((cp) => shortProductName(cp.product.name)),
  }));

  const products: ProductOption[] = productRecords.map((p) => ({
    id: p.id,
    name: p.name,
    shortName: shortProductName(p.name),
  }));

  const assets: AssetView[] = assetRecords.map((a) => ({
    id: a.id,
    type: a.type as ContentType,
    text: a.text,
    createdByAI: a.createdByAI,
    createdAt: a.createdAt.toISOString(),
    campaignId: a.campaignId,
    campaignName: a.campaign?.name ?? null,
  }));

  // Expiry-driven promo: ?promoteLot=<lotId> pre-fills a campaign dialog.
  let prefill: CampaignPrefill | null = null;
  if (promoteLot) {
    const lot = await prisma.stockLot.findUnique({
      where: { id: promoteLot },
      include: { product: true },
    });
    if (lot) {
      const productShort = shortProductName(lot.product.name);
      prefill = {
        name: `Last-days promotion — ${productShort}`,
        type: "promo",
        status: "planned",
        startDate: new Date().toISOString(),
        endDate: lot.expiryDate.toISOString(),
        productIds: [lot.productId],
        notes:
          `Move lot ${lot.lotNumber} before its DLC: ${lot.quantityTins} tins of ` +
          `${lot.product.name} (${lot.product.tinSizeGrams} g) expiring ${formatDate(lot.expiryDate)}.`,
        aiHint:
          `A short, tasteful last-days promotion for ${lot.product.name} — ` +
          `limited tins available until ${formatDate(lot.expiryDate)}. ` +
          "Convey rarity and freshness; do not mention expiry dates or lot numbers.",
      };
    }
  }

  const monthParam =
    month && /^\d{4}-\d{2}$/.test(month) ? month : format(new Date(), "yyyy-MM");

  return (
    <div>
      <PageHeader
        title="Marketing"
        description="Plan campaigns, keep the calendar full and draft copy worthy of the cellar"
      />
      <MarketingView
        campaigns={campaigns}
        products={products}
        assets={assets}
        currency={settings.currency}
        month={monthParam}
        prefill={prefill}
        aiConfigured={isAiConfigured()}
        aiUnavailableMessage={AI_UNAVAILABLE_MESSAGE}
      />
    </div>
  );
}
