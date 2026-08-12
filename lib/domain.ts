import { z } from "zod";

// String unions mirrored by the Prisma string columns (SQLite has no enums;
// keeping them here makes the Postgres switch trivial).

export const LOT_STATUSES = [
  "in_stock",
  "consumed",
  "expired",
  "written_off",
] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

export const MOVEMENT_TYPES = [
  "receipt",
  "consumption",
  "sale",
  "waste",
  "adjustment",
  "marketing_sample",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Movement types that remove stock (recorded with negative quantities). */
export const OUTBOUND_MOVEMENT_TYPES: readonly MovementType[] = [
  "consumption",
  "sale",
  "waste",
  "marketing_sample",
];

/** Movement types counted as demand when computing average daily usage. */
export const DEMAND_MOVEMENT_TYPES: readonly MovementType[] = [
  "consumption",
  "sale",
  "marketing_sample",
];

export const CHANNELS = ["food_service", "event", "training"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  food_service: "Food service",
  event: "Event",
  training: "Training",
};

export const PO_STATUSES = [
  "draft",
  "sent",
  "confirmed",
  "received",
  "cancelled",
] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

/** PO statuses that count as pipeline (on-order) stock. */
export const OPEN_PO_STATUSES: readonly PoStatus[] = ["sent", "confirmed"];

export const CAMPAIGN_TYPES = ["event", "promo", "tasting"] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

export const CAMPAIGN_STATUSES = [
  "planned",
  "active",
  "completed",
  "cancelled",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CONTENT_TYPES = [
  "caption",
  "email",
  "menu_description",
  "event_invite",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** Product categories from the product database workbook. */
export const PRODUCT_CATEGORIES = [
  "Caviar",
  "Fish Roe",
  "Fish",
  "Crab",
  "Marketing Tools",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const CAVIAR_TYPES = [
  "Kristal",
  "Oscietra",
  "Baeri",
  "Beluga",
  "Daurikus",
  "Transmontanus",
  "Baenki",
] as const;
export type CaviarType = (typeof CAVIAR_TYPES)[number];

export const PRODUCT_UNITS = ["Tin", "PC", "KG", "PK"] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export const USER_ROLES = ["owner", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["pending", "approved", "rejected"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

// zod schemas for API payload validation
export const movementTypeSchema = z.enum(MOVEMENT_TYPES);
export const channelSchema = z.enum(CHANNELS);
export const poStatusSchema = z.enum(PO_STATUSES);
export const campaignTypeSchema = z.enum(CAMPAIGN_TYPES);
export const campaignStatusSchema = z.enum(CAMPAIGN_STATUSES);
export const contentTypeSchema = z.enum(CONTENT_TYPES);
export const productCategorySchema = z.enum(PRODUCT_CATEGORIES);
export const lotStatusSchema = z.enum(LOT_STATUSES);
export const userStatusSchema = z.enum(USER_STATUSES);
