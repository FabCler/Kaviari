import { z } from "zod";
import { prisma } from "@/lib/db";
import { completeJson } from "@/lib/ai";
import type { Product } from "@prisma/client";
import { renderContentForPrompt, type ParsedContent } from "@/lib/import/parse";
import {
  aiPriceListSchema,
  aiSalesSchema,
  aiStockTakeSchema,
  summarizeIssues,
} from "@/lib/import/schemas";
import {
  buildUserPrompt,
  priceListSystemPrompt,
  salesExportSystemPrompt,
  stockTakeSystemPrompt,
} from "@/lib/import/prompts";
import { isMonthPeriod } from "@/lib/import/period";
import type {
  AnalysisResult,
  ImportMode,
  PriceListPreviewRow,
  SalesPreviewRow,
  StockTakePreviewRow,
  UnmatchedRow,
} from "@/lib/import/types";

/** Thrown when the AI's answer does not fit the schema; maps to a 422. */
export class ImportAnalysisError extends Error {
  issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(message);
    this.issues = issues;
  }
}

const UNREADABLE_MESSAGE =
  "The file was read, but its contents could not be understood for this import mode. Check that you picked the right mode and that the file contains the expected columns.";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function askAi<T>(
  system: string,
  parsed: ParsedContent,
  filename: string,
  catalog: unknown,
  schema: z.ZodType<T>
): Promise<T> {
  const raw = await completeJson({
    system,
    prompt: buildUserPrompt({
      catalogJson: JSON.stringify(catalog),
      fileContent: renderContentForPrompt(parsed),
      filename,
    }),
    maxTokens: 32_000,
  });
  const validated = schema.safeParse(raw);
  if (!validated.success) {
    throw new ImportAnalysisError(
      UNREADABLE_MESSAGE,
      summarizeIssues(validated.error.issues)
    );
  }
  return validated.data;
}

// ---------------------------------------------------------------- price list

async function analyzePriceList(
  parsed: ParsedContent,
  filename: string,
  notices: string[]
): Promise<AnalysisResult> {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
  });
  const catalog = products.map((p) => ({
    id: p.id,
    prCode: p.prCode,
    name: p.name,
    species: p.caviarType,
    grade: p.caviarType,
    gramsPerUnit: p.gramsPerUnit,
    unitCost: p.unitCost,
    currency: p.currency,
  }));

  const ai = await askAi(
    priceListSystemPrompt(),
    parsed,
    filename,
    catalog,
    aiPriceListSchema
  );

  const byId = new Map(products.map((p) => [p.id, p]));
  const byCode = new Map(
    products.map((p) => [p.prCode.trim().toLowerCase(), p])
  );
  const byNameSize = new Map<string, Product>();
  for (const p of products) {
    byNameSize.set(`${normalizeName(p.name)}|${p.gramsPerUnit}`, p);
  }

  const rows: PriceListPreviewRow[] = ai.rows.map((row) => {
    // Server-side match: code first, then name+size, then the AI's claim
    // (only if it points at a real product with the same tin size).
    let match: Product | undefined;
    if (row.prCode) {
      match = byCode.get(row.prCode.trim().toLowerCase());
    }
    if (!match) {
      match = byNameSize.get(`${normalizeName(row.name)}|${row.gramsPerUnit}`);
    }
    if (!match && row.matchedProductId) {
      const claimed = byId.get(row.matchedProductId);
      if (claimed && claimed.gramsPerUnit === row.gramsPerUnit) {
        match = claimed;
      }
    }

    const change: PriceListPreviewRow["change"] = !match
      ? "new"
      : Math.abs(match.unitCost - row.unitCost) > 0.005
        ? "price_change"
        : "unchanged";

    return {
      prCode: row.prCode?.trim() || null,
      name: row.name.trim(),
      caviarType: row.caviarType,
      gramsPerUnit: row.gramsPerUnit,
      unitCost: round2(row.unitCost),
      currency: row.currency.toUpperCase(),
      matchedProductId: match?.id ?? null,
      matchedProductName: match?.name ?? null,
      change,
      oldUnitCost: match ? match.unitCost : null,
    };
  });

  if (rows.length === 0 && ai.unmatched.length === 0) {
    throw new ImportAnalysisError(UNREADABLE_MESSAGE);
  }

  return { mode: "price_list", rows, unmatched: ai.unmatched, notices };
}

// ---------------------------------------------------------------- stock take

async function analyzeStockTake(
  parsed: ParsedContent,
  filename: string,
  notices: string[]
): Promise<AnalysisResult> {
  const [products, lots] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.stockLot.findMany({
      where: { status: "in_stock", quantityTins: { gt: 0 } },
    }),
  ]);
  const systemByProduct = new Map<string, number>();
  for (const lot of lots) {
    systemByProduct.set(
      lot.productId,
      (systemByProduct.get(lot.productId) ?? 0) + lot.quantityTins
    );
  }
  const catalog = products.map((p) => ({
    id: p.id,
    prCode: p.prCode,
    name: p.name,
    gramsPerUnit: p.gramsPerUnit,
    systemTins: round2(systemByProduct.get(p.id) ?? 0),
  }));

  const ai = await askAi(
    stockTakeSystemPrompt(),
    parsed,
    filename,
    catalog,
    aiStockTakeSchema
  );

  const byId = new Map(products.map((p) => [p.id, p]));
  const byCode = new Map(
    products.map((p) => [p.prCode.trim().toLowerCase(), p])
  );
  const unmatched: UnmatchedRow[] = [...ai.unmatched];

  // Server-side matching: the product code from the FILE is authoritative;
  // the AI's productId claim is only a fallback for rows without a code.
  // Duplicate product rows (counted in several locations) are summed.
  const countedByProduct = new Map<string, number>();
  for (const row of ai.rows) {
    const codeMatch = row.prCode
      ? byCode.get(row.prCode.trim().toLowerCase())
      : undefined;
    const product =
      codeMatch ?? (row.productId ? byId.get(row.productId) : undefined);
    if (!product) {
      unmatched.push({
        label: `Counted ${row.countedTins} tins (${row.prCode ? `code ${row.prCode}` : `product id ${row.productId ?? "?"}`})`,
        reason: row.prCode
          ? "Product code not found in the catalog"
          : "Not a known product in the catalog",
      });
      continue;
    }
    countedByProduct.set(
      product.id,
      (countedByProduct.get(product.id) ?? 0) + row.countedTins
    );
  }

  const rows: StockTakePreviewRow[] = [...countedByProduct.entries()].map(
    ([productId, counted]) => {
      const product = byId.get(productId)!;
      const systemTins = round2(systemByProduct.get(productId) ?? 0);
      const countedTins = round2(counted);
      return {
        productId,
        productName: product.name,
        gramsPerUnit: product.gramsPerUnit,
        countedTins,
        systemTins,
        deltaTins: round2(countedTins - systemTins),
      };
    }
  );

  if (rows.length === 0 && unmatched.length === 0) {
    throw new ImportAnalysisError(UNREADABLE_MESSAGE);
  }

  return { mode: "stock_take", rows, unmatched, notices };
}

// -------------------------------------------------------------- sales export

async function analyzeSalesExport(
  parsed: ParsedContent,
  filename: string,
  notices: string[],
  now: Date
): Promise<AnalysisResult> {
  const products = await prisma.product.findMany({ orderBy: { name: "asc" } });
  const catalog = products.map((p) => ({
    id: p.id,
    prCode: p.prCode,
    name: p.name,
    gramsPerUnit: p.gramsPerUnit,
  }));

  const ai = await askAi(
    salesExportSystemPrompt(isoDay(now)),
    parsed,
    filename,
    catalog,
    aiSalesSchema
  );

  const byId = new Map(products.map((p) => [p.id, p]));
  const unmatched: UnmatchedRow[] = [...ai.unmatched];
  let badDates = 0;
  let futureMonths = 0;
  const currentMonth = isoDay(now).slice(0, 7);

  const rows: SalesPreviewRow[] = [];
  for (const row of ai.rows) {
    const product = byId.get(row.productId);
    if (!product) {
      unmatched.push({
        label: `${row.tins} tins in ${row.period} (product id ${row.productId})`,
        reason: "Not a known product in the catalog",
      });
      continue;
    }
    const raw = row.period.trim();
    let period: string;
    if (isMonthPeriod(raw)) {
      // Whole-month total. Past months (back to the first movements) are
      // fine; a month cannot lie in the future — clamp to the current month
      // (the current, still-running month itself is allowed).
      period = raw > currentMonth ? currentMonth : raw;
      if (raw > currentMonth) futureMonths += 1;
    } else {
      let date = raw.slice(0, 10);
      const time = Date.parse(date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(time)) {
        date = isoDay(now);
        badDates += 1;
      } else if (time > now.getTime()) {
        // A sales export cannot contain future dates — clamp to today.
        date = isoDay(now);
        badDates += 1;
      }
      period = date;
    }
    rows.push({
      productId: product.id,
      productName: product.name,
      gramsPerUnit: product.gramsPerUnit,
      period,
      tins: round2(row.tins),
      channel: row.channel,
      note: row.note?.trim() ? row.note.trim() : null,
    });
  }
  if (badDates > 0) {
    notices.push(
      `${badDates} row${badDates === 1 ? "" : "s"} had a missing, invalid or future date and ${badDates === 1 ? "was" : "were"} set to today.`
    );
  }
  if (futureMonths > 0) {
    notices.push(
      `${futureMonths} monthly row${futureMonths === 1 ? "" : "s"} pointed at a future month and ${futureMonths === 1 ? "was" : "were"} moved to the current month.`
    );
  }
  const monthlyRows = rows.filter((row) => isMonthPeriod(row.period)).length;
  if (monthlyRows > 0) {
    notices.push(
      `${monthlyRows} row${monthlyRows === 1 ? " is a" : "s are"} monthly total${monthlyRows === 1 ? "" : "s"} — each will be spread across the weeks of its month when written.`
    );
  }

  if (rows.length === 0 && unmatched.length === 0) {
    throw new ImportAnalysisError(UNREADABLE_MESSAGE);
  }

  // "yyyy-mm" sorts before any "yyyy-mm-dd" inside the same month.
  rows.sort((a, b) => a.period.localeCompare(b.period));
  return { mode: "sales_export", rows, unmatched, notices };
}

// -------------------------------------------------------------------- router

export async function analyzeImport(options: {
  mode: ImportMode;
  parsed: ParsedContent;
  filename: string;
  notices: string[];
  now?: Date;
}): Promise<AnalysisResult> {
  const now = options.now ?? new Date();
  const notices = [...options.notices];
  switch (options.mode) {
    case "price_list":
      return analyzePriceList(options.parsed, options.filename, notices);
    case "stock_take":
      return analyzeStockTake(options.parsed, options.filename, notices);
    case "sales_export":
      return analyzeSalesExport(options.parsed, options.filename, notices, now);
  }
}
