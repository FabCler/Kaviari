import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { loadAllLines } from "@/lib/workspace";
import { fmt, fmt2 } from "@/lib/format";
import { Empty, OwnerPill, PageHeader } from "@/components/ui";

export const metadata = { title: "Exceptions" };

export default async function ExceptionsPage() {
  const user = await requireSection("exceptions");
  const workspaces = await loadAllLines();
  const rows = workspaces.flatMap((w) =>
    w.lines.flatMap((line) =>
      line.unresolved.map((issue) => ({ line, issue, shipmentId: w.shipment.id }))
    )
  );
  // A desk sees its own queue first; administrators see everything as it is.
  const mine = rows.filter(
    (r) =>
      r.issue.owner === user.department ||
      (r.issue.owner === "Sales/CS" &&
        (user.department === "Sales" || user.department === "Customer Service"))
  );
  const ordered = [...mine, ...rows.filter((r) => !mine.includes(r))];

  return (
    <>
      <PageHeader
        title="Exception Action Queue"
        subtitle="Only unresolved exceptions appear here. Confirm them on the Validation screen, where the numbers they refer to are on the same row."
      />
      {ordered.length === 0 ? (
        <Empty>No open exceptions.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Owner</th>
                <th>Shipment</th>
                <th>Supplier</th>
                <th>CodeBars</th>
                <th>Exception</th>
                <th className="num">Invoice</th>
                <th className="num">Original SO</th>
                <th className="num">Revised SO</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ordered.map(({ line, issue, shipmentId }) => (
                <tr key={`${shipmentId}-${line.key}-${issue.type}`}>
                  <td>
                    <OwnerPill owner={issue.owner} />
                  </td>
                  <td className="whitespace-nowrap">{line.shipmentCode}</td>
                  <td>
                    {line.supplierCode}{" "}
                    <span className="text-muted">{line.supplierName}</span>
                  </td>
                  <td>
                    <span className="font-semibold">{line.mainCode}</span>
                    <span className="block text-[10px] text-muted">{line.itemDesc}</span>
                  </td>
                  <td>
                    <span className="font-semibold">{issue.type}</span>
                    <span className="block text-[11px] text-muted">{issue.detail}</span>
                  </td>
                  <td className="num">{fmt2(line.invQty)}</td>
                  <td className="num">{fmt(line.soQty)}</td>
                  <td className="num">{fmt(line.revisedSoQty)}</td>
                  <td>
                    <div className="flex justify-end">
                      <Link
                        className="btn btn-secondary btn-sm"
                        href={
                          issue.manual
                            ? `/validation?shipment=${shipmentId}&status=${encodeURIComponent(line.status)}`
                            : `/so-adjustment?shipment=${shipmentId}`
                        }
                      >
                        {issue.manual ? "Open validation" : "Open SO adjustment"}
                      </Link>
                    </div>
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
