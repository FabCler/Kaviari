import type { CampaignStatus, CampaignType, ContentType } from "@/lib/domain";

/** Serializable campaign shape passed from server pages to client components. */
export interface CampaignView {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  /** ISO strings at the server/client boundary. */
  startDate: string;
  endDate: string | null;
  budget: number | null;
  notes: string | null;
  results: string | null;
  resultRevenue: number | null;
  productIds: string[];
  productNames: string[];
}

export interface ProductOption {
  id: string;
  name: string;
  shortName: string;
}

export interface AssetView {
  id: string;
  type: ContentType;
  text: string;
  createdByAI: boolean;
  createdAt: string;
  campaignId: string | null;
  campaignName: string | null;
}

/** Pre-filled campaign form values (expiry-driven promo flow). */
export interface CampaignPrefill {
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  startDate: string;
  endDate: string | null;
  notes: string;
  productIds: string[];
  /** Extra context handed to the AI copy draft. */
  aiHint: string;
}

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  event: "Event",
  promo: "Promo",
  tasting: "Tasting",
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  planned: "Planned",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  caption: "Social caption",
  email: "Email",
  menu_description: "Menu description",
  event_invite: "Event invite",
};

/** Campaign type -> chart token colors for calendar pills. */
export const CAMPAIGN_TYPE_COLORS: Record<
  CampaignType,
  { pill: string; dot: string }
> = {
  event: { pill: "bg-chart-3 text-white", dot: "bg-chart-3" },
  promo: { pill: "bg-chart-4 text-white", dot: "bg-chart-4" },
  tasting: { pill: "bg-chart-1 text-white", dot: "bg-chart-1" },
};

export const STATUS_BADGE_VARIANT: Record<
  CampaignStatus,
  "gold" | "success" | "secondary" | "outline"
> = {
  planned: "gold",
  active: "success",
  completed: "secondary",
  cancelled: "outline",
};
