import { requireSection } from "@/lib/auth";
import { loadAllLines } from "@/lib/workspace";
import { fmt, fmt2, fmtDate } from "@/lib/format";
import { Callout, Empty, PageHeader, StatusPill } from "@/components/ui";

export const metadata = { title: "Receiving Release" };

export default async function ReceivingPage() {
  await requireSection("receiving");
  const workspaces = await loadAllLines();
  const rows = workspaces.flatMap((w) =>
    w.lines.map((line) => ({ line, eta: fmtDate(w.shipment.eta) }))
  );

  return (
    <>
      <PageHeader
        title="DC2 Receiving Release"
        subtitle="DC2 uses this page as the pre-arrival receiving instruction."
      />
      <Callout>
        <strong>Receiving scope only:</strong> this screen stops at physical
        receiving. QC, put-away and pick &amp; pack are outside this app.
      </Callout>

      {rows.length === 0 ? (
        <Empty>No data to release.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table" style={{ tableLayout: "fixed", minWidth: 1040 }}>
            <colgroup>
              {[
                "11.5%",
                "7.5%",
                "9%",
                "11.5%",
                "9.5%",
                "5%",
                "12%",
                "9.5%",
                "12%",
                "12.5%",
              ].map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>Shipment</th>
                <th>ETA</th>
                <th>Supplier</th>
                <th>CodeBars</th>
                <th className="num">Invoice QTY</th>
                <th>UOM</th>
                <th className="num">Revised SO QTY</th>
                <th className="num">Free Stock</th>
                <th>Status</th>
                <th>Instruction</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ line, eta }) => (
                <tr key={`${line.shipmentCode}-${line.key}`}>
                  <td className="whitespace-nowrap">{line.shipmentCode}</td>
                  <td className="whitespace-nowrap">{eta || "—"}</td>
                  <td>
                    <span className="font-semibold">{line.supplierCode}</span>
                    <span className="block text-[10px] text-muted">
                      {line.supplierName}
                    </span>
                  </td>
                  <td>
                    <span className="font-semibold break-all">{line.mainCode}</span>
                    <span className="block text-[10px] break-words text-muted">
                      {line.itemDesc}
                    </span>
                  </td>
                  <td className="num font-bold">{fmt2(line.invQty)}</td>
                  <td>{line.uom}</td>
                  <td className="num">{fmt(line.revisedSoQty)}</td>
                  <td className="num">{fmt(line.freeQty)}</td>
                  <td className="whitespace-nowrap">
                    <StatusPill status={line.status} />
                  </td>
                  <td className="text-[11px] leading-snug">
                    {line.status === "READY" ? (
                      <strong className="text-good">READY TO RECEIVE</strong>
                    ) : (
                      <>
                        <strong>HOLD</strong>{" "}
                        <span className="text-muted">
                          {line.unresolved
                            .map((i) => `${i.owner}: ${i.type}`)
                            .join("; ")}
                        </span>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
