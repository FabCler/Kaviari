import { PageHeader } from "@/components/page-header";
import { CustomersView } from "@/components/customers/customers-view";
import { UploadDialog } from "@/components/customers/upload-dialog";
import { loadCustomerSalesEntries } from "@/components/customers/data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Customers consumption — Kaviari Cellar",
};

export default async function CustomersPage() {
  const { entries, years, meta } = await loadCustomerSalesEntries();

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
