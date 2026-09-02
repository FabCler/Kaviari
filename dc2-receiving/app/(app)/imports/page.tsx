import { prisma } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { Callout, Empty, PageHeader } from "@/components/ui";
import { DeleteButton, ImportPanel } from "./import-panel";

export const metadata = { title: "SAP Imports" };

export default async function ImportsPage() {
  await requireSection("imports");
  const [shipments, batches, counts] = await Promise.all([
    prisma.shipment.findMany({ orderBy: [{ eta: "asc" }, { code: "asc" }] }),
    prisma.importBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { shipment: true, importedBy: true },
    }),
    Promise.all([
      prisma.poLine.count(),
      prisma.invoiceLine.count(),
      prisma.soLine.count(),
    ]),
  ]);

  return (
    <>
      <PageHeader
        title="SAP Imports"
        subtitle="Bring the SAP purchase orders, supplier invoices and customer sales orders into a shipment."
      />
      <Callout>
        <strong>Import formats:</strong> Excel (<strong>.xlsx</strong>),{" "}
        <strong>PDF</strong>, CSV and tab-separated text. Column headers are
        matched by name, so an export that says <em>Vendor Code</em> and one
        that says <em>Supplier Code</em> both land in the right place. A PDF has
        no columns at all, so it is read line by line and always opens a preview
        first — you confirm every row before it reaches the shipment.
      </Callout>

      <ImportPanel
        shipments={shipments.map((s) => ({ id: s.id, code: s.code }))}
      />

      <div className="mt-6 mb-3 grid grid-cols-3 gap-3">
        {[
          ["PO lines", counts[0]],
          ["Invoice lines", counts[1]],
          ["SO lines", counts[2]],
        ].map(([label, value]) => (
          <div key={String(label)} className="card">
            <p className="text-[10px] font-bold tracking-wide text-muted uppercase">
              {label}
            </p>
            <p className="mt-1 text-2xl font-bold">{Number(value).toLocaleString()}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-6 mb-2 text-sm font-bold">Imported files</h2>
      {batches.length === 0 ? (
        <Empty>No files imported yet.</Empty>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Imported</th>
              <th>Type</th>
              <th>Shipment</th>
              <th>Supplier</th>
              <th>File</th>
              <th>By</th>
              <th className="num">Lines</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td className="whitespace-nowrap">
                  <span className="font-semibold">
                    {b.createdAt.toISOString().slice(0, 10)}
                  </span>
                  <span className="block text-[10px] text-muted">
                    {b.createdAt.toISOString().slice(11, 16)}
                  </span>
                </td>
                <td className="uppercase">{b.kind}</td>
                <td>{b.shipment.code}</td>
                <td>{b.supplierCode || "—"}</td>
                <td className="max-w-[220px] truncate" title={b.source}>
                  {b.source}
                </td>
                <td className="text-muted">{b.importedBy?.name ?? "—"}</td>
                <td className="num">{b.rows}</td>
                <td>
                  <DeleteButton id={b.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
