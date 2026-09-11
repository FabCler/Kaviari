import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { CustomersView } from "@/components/customers/customers-view";
import { UploadDialog } from "@/components/customers/upload-dialog";
import type {
  CustomerSaleEntry,
  CustomerSalesMeta,
} from "@/components/customers/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Customers consumption — Kaviari Cellar",
};

export default async function CustomersPage() {
  const [sales, products, metaRow] = await Promise.all([
    prisma.customerSale.findMany({
      orderBy: [{ year: "asc" }, { month: "asc" }],
    }),
    prisma.product.findMany({
      select: { prCode: true, name: true, caviarType: true, category: true },
    }),
    prisma.setting.findUnique({ where: { key: "customerSalesMeta" } }),
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

  return (
    <div>
      <PageHeader
        title="Customers consumption"
        description="Top 90% sales — quantities by customer, product and month, compared with the previous year. Updated from the bi-monthly Excel export."
        actions={<UploadDialog meta={meta} />}
      />
      {entries.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          No customer data yet — upload the &ldquo;Top 90% sales&rdquo; Excel
          export with the button above.
        </div>
      ) : (
        <CustomersView entries={entries} years={years} />
      )}
    </div>
  );
}
