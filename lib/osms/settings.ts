import { osms } from "@/lib/osms/db";
import {
  DEFAULT_PRICE_TOLERANCE_PCT,
  DEFAULT_QTY_TOLERANCE_PCT,
} from "@/lib/osms/domain";

/**
 * Module settings, stored in the shared `Setting` key/value table so admins
 * can tune the tolerances without a deploy (§10 — "Manage Tolerance").
 */

export interface Settings {
  /** Quantity difference below this % counts as a match. */
  qtyTolerancePct: number;
  /** Price difference below this % counts as a match. */
  priceTolerancePct: number;
  /** Warn this many days before the expected delivery date. */
  deliveryWarningDays: number;
  /** Default storage location offered for leftover stock. */
  defaultStorageLocation: string;
}

export const SCM_SETTING_KEYS = {
  qtyTolerancePct: "qtyTolerancePct",
  priceTolerancePct: "priceTolerancePct",
  deliveryWarningDays: "deliveryWarningDays",
  defaultStorageLocation: "defaultStorageLocation",
} as const;

export const SCM_DEFAULTS: Settings = {
  qtyTolerancePct: DEFAULT_QTY_TOLERANCE_PCT,
  priceTolerancePct: DEFAULT_PRICE_TOLERANCE_PCT,
  deliveryWarningDays: 3,
  defaultStorageLocation: "MAIN-COLD",
};

function num(value: string | undefined, fallback: number): number {
  if (value == null) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getScmSettings(): Promise<Settings> {
  const rows = await osms.setting.findMany({
    where: { key: { in: Object.values(SCM_SETTING_KEYS) } },
  });
  const map = new Map(rows.map((row) => [row.key, row.value]));
  return {
    qtyTolerancePct: num(
      map.get(SCM_SETTING_KEYS.qtyTolerancePct),
      SCM_DEFAULTS.qtyTolerancePct
    ),
    priceTolerancePct: num(
      map.get(SCM_SETTING_KEYS.priceTolerancePct),
      SCM_DEFAULTS.priceTolerancePct
    ),
    deliveryWarningDays: num(
      map.get(SCM_SETTING_KEYS.deliveryWarningDays),
      SCM_DEFAULTS.deliveryWarningDays
    ),
    defaultStorageLocation:
      map.get(SCM_SETTING_KEYS.defaultStorageLocation) ??
      SCM_DEFAULTS.defaultStorageLocation,
  };
}

export async function saveScmSettings(
  patch: Partial<Settings>
): Promise<void> {
  const entries = Object.entries(patch).filter(([, value]) => value != null);
  for (const [key, value] of entries) {
    const settingKey = SCM_SETTING_KEYS[key as keyof Settings];
    if (!settingKey) continue;
    await osms.setting.upsert({
      where: { key: settingKey },
      create: { key: settingKey, value: String(value) },
      update: { value: String(value) },
    });
  }
}
