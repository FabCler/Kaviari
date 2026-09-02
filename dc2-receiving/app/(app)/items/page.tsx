import { prisma } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { Callout, Empty, PageHeader } from "@/components/ui";
import {
  ItemEntry,
  LinkEntry,
  MasterImport,
  Pager,
  RowActions,
} from "./item-forms";

export const metadata = { title: "Item Management" };

const PAGE = 10;

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; lpage?: string }>;
}) {
  await requireSection("items");
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const page = Math.max(0, Number(params.page ?? 0) || 0);
  const lpage = Math.max(0, Number(params.lpage ?? 0) || 0);

  const where = q
    ? {
        OR: [
          { barcode: { contains: q } },
          { itemCode: { contains: q } },
          { nameEn: { contains: q } },
          { nameTh: { contains: q } },
        ],
      }
    : {};

  const [items, itemCount, links, linkCount] = await Promise.all([
    prisma.item.findMany({
      where,
      orderBy: { barcode: "asc" },
      skip: page * PAGE,
      take: PAGE,
      include: { _count: { select: { links: true } } },
    }),
    prisma.item.count({ where }),
    prisma.supplierLink.findMany({
      orderBy: [{ supplierCode: "asc" }, { supplierItemName: "asc" }],
      skip: lpage * PAGE,
      take: PAGE,
      include: { item: true },
    }),
    prisma.supplierLink.count(),
  ]);

  return (
    <>
      <PageHeader
        title="Item Management"
        subtitle="The SAP item, its CodeBars, and each supplier's own product code mapped onto it."
      />
      <Callout>
        <strong>Why this matters:</strong> suppliers invoice under their own
        product names — a Culmarex invoice says <em>DORADA 500-600 10K</em> where
        SAP says item <em>8831</em>. Link them once here and every future PO,
        invoice and SO import matches automatically.
      </Callout>

      <MasterImport />

      <h2 className="mt-6 mb-2 text-sm font-bold">Item Master</h2>
      <ItemEntry />
      <form className="mb-2 flex gap-2" method="get">
        <input
          name="q"
          className="field w-64"
          placeholder="Search CodeBars, code or name"
          defaultValue={q}
        />
        <button className="btn btn-secondary">Search</button>
      </form>
      {items.length === 0 ? (
        <Empty>{q ? "No item matches that search." : "No items yet."}</Empty>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 120 }}>CodeBars</th>
              <th style={{ width: 110 }}>ItemCode</th>
              <th>Item Name TH</th>
              <th>Item Name ENG</th>
              <th style={{ width: 70 }}>UOM</th>
              <th className="num" style={{ width: 70 }}>
                Links
              </th>
              <th style={{ width: 140 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td className="font-semibold">{i.barcode}</td>
                <td>{i.itemCode || "—"}</td>
                <td>{i.nameTh || "—"}</td>
                <td>{i.nameEn || "—"}</td>
                <td>{i.uom}</td>
                <td className="num">{i._count.links}</td>
                <td>
                  <RowActions
                    kind="item"
                    id={i.id}
                    values={{
                      barcode: i.barcode,
                      itemCode: i.itemCode,
                      nameTh: i.nameTh,
                      nameEn: i.nameEn,
                      uom: i.uom,
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager
        param="page"
        page={page}
        pageSize={PAGE}
        total={itemCount}
        label="items"
      />

      <h2 className="mt-8 mb-2 text-sm font-bold">Supplier Item Links</h2>
      <LinkEntry />
      {links.length === 0 ? (
        <Empty>No supplier links yet.</Empty>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 120 }}>CodeBars</th>
              <th style={{ width: 110 }}>ItemCode</th>
              <th style={{ width: 150 }}>Supplier Item Code</th>
              <th>Supplier Item Name</th>
              <th style={{ width: 80 }}>Supplier UOM</th>
              <th style={{ width: 110 }}>Supplier Code</th>
              <th style={{ width: 140 }} />
            </tr>
          </thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.id}>
                <td className="font-semibold">{l.item.barcode}</td>
                <td>{l.item.itemCode || "—"}</td>
                <td>{l.supplierItemCode || "—"}</td>
                <td>{l.supplierItemName || "—"}</td>
                <td>{l.supplierUom || "—"}</td>
                <td>{l.supplierCode || "any"}</td>
                <td>
                  <RowActions
                    kind="link"
                    id={l.id}
                    values={{
                      supplierCode: l.supplierCode,
                      supplierItemCode: l.supplierItemCode,
                      supplierItemName: l.supplierItemName,
                      supplierUom: l.supplierUom,
                      itemRef: l.item.barcode,
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager
        param="lpage"
        page={lpage}
        pageSize={PAGE}
        total={linkCount}
        label="links"
      />
    </>
  );
}
