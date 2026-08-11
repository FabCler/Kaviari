import { prisma } from "@/lib/db";

export interface AppSettings {
  reviewPeriodDays: number;
  leadTimeDays: number;
  safetyStockDays: number;
  aduWindowDays: number;
  currency: string;
  expiryAlertDays: number;
  /** ISO date of the last order that started the current review cycle. */
  lastOrderDate: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  reviewPeriodDays: 15,
  leadTimeDays: 21,
  safetyStockDays: 15,
  aduWindowDays: 42,
  currency: "EUR",
  expiryAlertDays: 14,
  lastOrderDate: null,
};

const NUMERIC_KEYS = [
  "reviewPeriodDays",
  "leadTimeDays",
  "safetyStockDays",
  "aduWindowDays",
  "expiryAlertDays",
] as const;

export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const settings: AppSettings = { ...DEFAULT_SETTINGS };
  for (const key of NUMERIC_KEYS) {
    const raw = map.get(key);
    if (raw != null) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) settings[key] = n;
    }
  }
  const currency = map.get("currency");
  if (currency) settings.currency = currency;
  const lastOrderDate = map.get("lastOrderDate");
  if (lastOrderDate) settings.lastOrderDate = lastOrderDate;
  return settings;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
