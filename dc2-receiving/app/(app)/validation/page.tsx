import { prisma } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { canResolve } from "@/lib/permissions";
import { loadAllLines } from "@/lib/workspace";
import { fmt, fmt2, pct, r2 } from "@/lib/format";
import type { Line } from "@/lib/domain";
import { Empty, PageHeader, StatusPill } from "@/components/ui";
import { ResolveBox, RootCauseSelect, SupplierAssign } from "./lane-controls";

export const metadata = { title: "Validation" };

const LANES = [
  {
    status: "HOLD" as const,
    title: "Hold",
    blurb:
      "Waiting for paperwork: a line stays here until its PO, supplier invoice and customer SO are all in.",
  },
  {
    status: "PURCHASE REVIEW" as const,
    title: "Purchase Review",
    blurb:
      "PO against supplier invoice, compared to two decimals, and the root cause for any gap. A line whose PO and invoice agree skips this step.",
  },
  {
    status: "SALE REVIEW" as const,
    title: "Sale Review",
    blurb:
      "Invoice against customer demand. Only what Sales and Customer Service have to confirm is listed here.",
  },
  {
    status: "READY" as const,
    title: "Ready",
    blurb: "Both desks have confirmed — released to DC2 receiving.",
  },
];

export default async function ValidationPage({
  searchParams,
}: {
  searchParams: Promise<{ shipment?: string; status?: string }>;
}) {
  const user = await requireSection("validation");
  const params = await searchParams;

  const shipments = await prisma.shipment.findMany({
    orderBy: [{ eta: "asc" }, { code: "asc" }],
  });
  const workspaces = await loadAllLines(
    params.shipment && params.shipment !== "all" ? params.shipment : undefined
  );
  const lines = workspaces.flatMap((w) =>
    w.lines.map((l) => ({ line: l, shipmentId: w.shipment.id }))
  );

  const shown = params.status
    ? LANES.filter((l) => l.status === params.status)
    : LANES;

  return (
    <>
      <PageHeader
        title="Shipment Validation"
        subtitle="Core control: PO ↔ supplier invoice ↔ customer SO by shipment, supplier and item."
      />

      <form className="card mb-5 flex flex-wrap gap-3" method="get">
        <div>
          <label className="label">Shipment</label>
          <select name="shipment" className="field w-56" defaultValue={params.shipment ?? "all"}>
            <option value="all">All shipments</option>
            {shipments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select name="status" className="field w-56" defaultValue={params.status ?? ""}>
            <option value="">All statuses</option>
            {LANES.map((l) => (
              <option key={l.status} value={l.status}>
                {l.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn btn-secondary">Apply</button>
        </div>
      </form>

      {shown.map((lane, index) => {
        const rows = lines.filter((r) => r.line.status === lane.status);
        return (
          <section key={lane.status} className="mb-7">
            <div className="mb-2 flex items-baseline gap-2">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-rail text-[10px] font-bold text-white">
                {LANES.findIndex((l) => l.status === lane.status) + 1}
              </span>
              <h2 className="text-sm font-bold">{lane.title}</h2>
              <span className="pill pill-info">{rows.length}</span>
            </div>
            <p className="mb-2 text-[11px] text-muted">{lane.blurb}</p>
            {rows.length === 0 ? (
              <Empty>Nothing at this stage.</Empty>
            ) : (
              <LaneTable
                lane={lane.status}
                rows={rows}
                user={{ role: user.role, department: user.department, status: user.status }}
                allLines={lines}
              />
            )}
            {index < shown.length - 1 ? null : null}
          </section>
        );
      })}
    </>
  );
}

type Row = { line: Line; shipmentId: string };

function LaneTable({
  lane,
  rows,
  user,
  allLines,
}: {
  lane: "HOLD" | "PURCHASE REVIEW" | "SALE REVIEW" | "READY";
  rows: Row[];
  user: { role: string; department: string; status: string };
  allLines: Row[];
}) {
  const head =
    lane === "PURCHASE REVIEW"
      ? ["Status", "Shipment", "Supplier", "CodeBars", "PO Qty", "Invoice Qty", "Balance Inv − PO", "PO/Inv Gap", "Exception / action"]
      : lane === "SALE REVIEW"
        ? ["Status", "Shipment", "Supplier", "CodeBars", "Invoice Qty", "Original SO", "Revised SO", "Free Stock", "Balance Inv − SO", "Inv/SO Gap", "Exception / action"]
        : [
            "Status",
            "Shipment",
            "Supplier",
            "CodeBars",
            "PO Qty",
            "Invoice Qty",
            "Original SO",
            "Revised SO",
            "Free Stock",
            "Balance Inv − SO",
            "Inv/SO Gap",
            ...(lane === "HOLD" ? ["Waiting for"] : []),
          ];

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className={/qty|balance|gap|so$|stock/i.test(h) ? "num" : ""}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ line, shipmentId }) => {
            const balPo = r2(line.invQty - line.poQty);
            return (
              <tr key={`${shipmentId}-${line.key}`}>
                <td>
                  <StatusPill status={line.status} />
                </td>
                <td className="whitespace-nowrap">{line.shipmentCode}</td>
                <td>
                  <span className="font-semibold">{line.supplierCode}</span>
                  <span className="block text-[10px] text-muted">{line.supplierName}</span>
                </td>
                <td>
                  <span className="font-semibold">{line.mainCode}</span>
                  <span className="block text-[10px] text-muted">{line.itemDesc}</span>
                </td>
                {lane === "PURCHASE REVIEW" ? (
                  <>
                    <td className="num">{fmt(line.poQty)}</td>
                    <td className="num">{fmt2(line.invQty)}</td>
                    <td className="num">
                      <strong className={balPo === 0 ? "text-good" : "text-bad"}>
                        {fmt2(balPo)}
                      </strong>
                    </td>
                    <td className="num">{pct(line.poInvVar)}</td>
                  </>
                ) : lane === "SALE REVIEW" ? (
                  <>
                    <td className="num">{fmt2(line.invQty)}</td>
                    <td className="num">{fmt(line.soQty)}</td>
                    <td className="num">{fmt(line.revisedSoQty)}</td>
                    <td className="num">{fmt(line.freeQty)}</td>
                    <td className="num">
                      <strong
                        className={
                          Math.abs(line.allocationBalance) < 0.01 ? "text-good" : "text-bad"
                        }
                      >
                        {fmt2(r2(line.allocationBalance))}
                      </strong>
                    </td>
                    <td className="num">{pct(line.soVar)}</td>
                  </>
                ) : (
                  <>
                    <td className="num">{fmt(line.poQty)}</td>
                    <td className="num">{fmt2(line.invQty)}</td>
                    <td className="num">{fmt(line.soQty)}</td>
                    <td className="num">{fmt(line.revisedSoQty)}</td>
                    <td className="num">{fmt(line.freeQty)}</td>
                    <td className="num">
                      <strong
                        className={
                          Math.abs(line.allocationBalance) < 0.01 ? "text-good" : "text-bad"
                        }
                      >
                        {fmt2(r2(line.allocationBalance))}
                      </strong>
                    </td>
                    <td className="num">{pct(line.soVar)}</td>
                  </>
                )}
                {lane === "HOLD" ? (
                  <td>
                    {line.missingDocs.length ? (
                      <span className="pill pill-bad">
                        waiting for {line.missingDocs.join(" + ")}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted">Waiting on paperwork.</span>
                    )}
                  </td>
                ) : null}
                {lane === "PURCHASE REVIEW" || lane === "SALE REVIEW" ? (
                  <td className="min-w-[280px]">
                    <IssueBlock
                      line={line}
                      shipmentId={shipmentId}
                      lane={lane === "PURCHASE REVIEW" ? "po" : "so"}
                      user={user}
                      allLines={allLines}
                    />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IssueBlock({
  line,
  shipmentId,
  lane,
  user,
  allLines,
}: {
  line: Line;
  shipmentId: string;
  lane: "po" | "so";
  user: { role: string; department: string; status: string };
  allLines: Row[];
}) {
  const mine = line.issues.filter((i) => i.lane === lane);
  const resolvedTypes = new Set(
    line.issues.filter((i) => !line.unresolved.includes(i)).map((i) => i.type)
  );
  const ref = {
    shipmentId,
    supplierCode: line.supplierCode,
    itemKey: line.itemKey,
  };
  const supplierOptions = [
    ...new Set(
      allLines
        .filter((r) => r.line.itemKey === line.itemKey && r.shipmentId === shipmentId)
        .map((r) => r.line.supplierCode)
    ),
  ];

  return (
    <div>
      {mine.length === 0 ? (
        <span className="text-[11px] text-muted">Nothing for this desk.</span>
      ) : (
        mine.map((issue) =>
          issue.manual ? (
            <ResolveBox
              key={issue.type}
              line={ref}
              issueType={issue.type}
              issueOwner={issue.owner}
              checked={resolvedTypes.has(issue.type)}
              detail={issue.detail}
              canAct={canResolve(user, issue.owner)}
            />
          ) : (
            <div key={issue.type} className="my-1">
              <span
                className={`pill ${
                  issue.owner === "Purchasing"
                    ? "pill-warn"
                    : issue.owner === "Sales"
                      ? "pill-info"
                      : "pill-good"
                }`}
              >
                {issue.owner}
              </span>{" "}
              <span className="font-semibold">{issue.type}</span>
              <span className="block text-[11px] text-muted">{issue.detail}</span>
            </div>
          )
        )
      )}
      {lane === "po" && line.poDiffers && line.invQty > line.soQty + 0.01 ? (
        <RootCauseSelect line={ref} value={line.rootCause} />
      ) : null}
      {line.ambiguousSo.map((so) => (
        <SupplierAssign
          key={so.id}
          soLineId={so.id}
          soNo={so.soNo}
          customerName={so.customerName || so.customerCode}
          options={supplierOptions}
        />
      ))}
      {!line.inMaster ? (
        <div className="mt-1 text-[11px]">
          <span className="pill pill-warn">not in Item Master</span>{" "}
          <span className="text-muted">
            Add {line.mainCode} under Item Management so future documents match.
          </span>
        </div>
      ) : null}
    </div>
  );
}
