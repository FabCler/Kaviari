import { prisma } from "@/lib/db";
import type {
  CustomerSaleEntry,
  CustomerSalesMeta,
} from "@/components/customers/types";

/**
 * Server-side loader shared by the Customers page and the Excel export so
 * both see identical, catalog-enriched rows.
 */
export async function loadCustomerSalesEntries(): Promise<{
  entries: CustomerSaleEntry[];
  years: number[];
  meta: CustomerSalesMeta;
  /** customerCode → assigned sales rep. */
  reps: Record<string, string>;
}> {
  const [sales, products, metaRow, repRows] = await Promise.all([
    prisma.customerSale.findMany({
      orderBy: [{ year: "asc" }, { month: "asc" }],
    }),
    prisma.product.findMany({
      select: { prCode: true, name: true, caviarType: true, category: true },
    }),
    prisma.setting.findUnique({ where: { key: "customerSalesMeta" } }),
    prisma.customerRep.findMany(),
  ]);

  // Enrich each sale with the catalog product (matched by PR code) so the
  // caviar-type filter and product names stay consistent with the rest of
  // the app; unmatched codes keep the file's own description.
  const byCode = new Map(products.map((p) => [p.prCode, p]));
  const entries: CustomerSaleEntry[] = sales.map((sale) => {
    const product = sale.prCode ? byCode.get(sale.prCode) : undefined;
    return {
      customerCode: sale.customerCode,
      customerName: sale.customerName,
      prCode: sale.prCode,
      productName: product?.name ?? sale.productName,
      caviarType: product?.caviarType ?? null,
      category: product?.category ?? null,
      year: sale.year,
      month: sale.month,
      quantity: sale.quantity,
    };
  });
  const years = [...new Set(entries.map((e) => e.year))].sort((a, b) => a - b);

  let meta: CustomerSalesMeta = { fileName: null, uploadedAt: null };
  if (metaRow) {
    try {
      const parsed = JSON.parse(metaRow.value);
      meta = {
        fileName: typeof parsed.fileName === "string" ? parsed.fileName : null,
        uploadedAt:
          typeof parsed.uploadedAt === "string" ? parsed.uploadedAt : null,
      };
    } catch {
      // Malformed meta only hides the "last updated" caption.
    }
  }

  const reps = Object.fromEntries(
    repRows.map((row) => [row.customerCode, row.repName])
  );

  return { entries, years, meta, reps };
}
