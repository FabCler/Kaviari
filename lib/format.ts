const currencyFormatters = new Map<string, Intl.NumberFormat>();

/** Whole units for large amounts, cents for small ones. */
export function formatMoney(amount: number, currency = "EUR"): string {
  const wantsCents = Math.abs(amount) < 1000;
  const cacheKey = `${currency}:${wantsCents ? 2 : 0}`;
  let formatter = currencyFormatters.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: wantsCents ? 2 : 0,
      maximumFractionDigits: wantsCents ? 2 : 0,
    });
    currencyFormatters.set(cacheKey, formatter);
  }
  return formatter.format(amount);
}

export function formatGrams(grams: number): string {
  if (Math.abs(grams) >= 1000) {
    const kg = grams / 1000;
    return `${kg.toLocaleString("en-GB", { maximumFractionDigits: 1 })} kg`;
  }
  return `${grams.toLocaleString("en-GB", { maximumFractionDigits: 0 })} g`;
}

export function formatTins(tins: number): string {
  const rounded = Math.round(tins * 10) / 10;
  return `${rounded.toLocaleString("en-GB")} ${rounded === 1 ? "tin" : "tins"}`;
}

/** Quantity in the product's stock unit: "12 tins", "3 pc", "2.5 kg". */
export function formatUnits(quantity: number, unit: string): string {
  const rounded = Math.round(quantity * 10) / 10;
  const n = rounded.toLocaleString("en-GB");
  switch (unit) {
    case "Tin":
      return `${n} ${rounded === 1 ? "tin" : "tins"}`;
    case "PC":
      return `${n} pc`;
    case "KG":
      return `${n} kg`;
    case "PK":
      return `${n} pk`;
    default:
      return `${n} ${unit.toLowerCase()}`;
  }
}

/** Weeks of cover: "6.2 wks". */
export function formatWeeks(weeks: number | null): string {
  if (weeks == null) return "∞";
  return `${weeks.toLocaleString("en-GB", { maximumFractionDigits: 1 })} wk${weeks >= 2 ? "s" : ""}`;
}

export function formatNumber(n: number, maxFractionDigits = 1): string {
  return n.toLocaleString("en-GB", { maximumFractionDigits: maxFractionDigits });
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function daysUntil(date: Date | string, from = new Date()): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.ceil((d.getTime() - from.getTime()) / 86_400_000);
}

/** Strip the redundant "Kaviari Caviar " prefix for tighter table rows. */
export function shortProductName(name: string): string {
  return name.replace(/^Kaviari\s+(Caviar\s+)?/i, "").trim();
}
