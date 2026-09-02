"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { saveAllocation } from "./actions";
import { fmt, fmt2, num, pct, r2 } from "@/lib/format";
import { StatusPill } from "@/components/ui";

export type SoRowView = {
  id: string;
  soNo: string;
  customer: string;
  qty: number;
  revisedQty: number;
  sapUpdated: boolean;
  uom: string;
};

export type AllocationRow = {
  shipmentId: string;
  tolerance: number;
  key: string;
  itemKey: string;
  supplierCode: string;
  supplierName: string;
  shipmentCode: string;
  mainCode: string;
  itemDesc: string;
  status: string;
  uom: string;
  invQty: number;
  soQty: number;
  revisedSoQty: number;
  freeQty: number;
  balance: number;
  soVar: number;
  pendingSap: number;
  soRows: SoRowView[];
};

/**
 * The allocation is edited in a draft and written once, on Confirm — the same
 * rule the desks worked to in the previous version: numbers on screen are not
 * in the workspace until somebody says so.
 */
export function AllocationList({ rows }: { rows: AllocationRow[] }) {
  const [open, setOpen] = React.useState<string | null>(null);
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={`${row.shipmentId}-${row.key}`} className="card p-0">
          <button
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
            onClick={() => setOpen(open === row.key ? null : row.key)}
          >
            <span className="text-muted">{open === row.key ? "−" : "+"}</span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{row.mainCode}</span>{" "}
              <span className="text-[11px] text-muted">{row.itemDesc}</span>
              <span className="block text-[11px] text-muted">
                {row.shipmentCode} · {row.supplierCode} {row.supplierName}
              </span>
            </span>
            <span className="hidden gap-6 text-[11px] md:flex">
              <Figure label="Invoice" value={`${fmt2(row.invQty)} ${row.uom}`} />
              <Figure label="Revised SO" value={fmt(row.revisedSoQty)} />
              <Figure
                label="Remaining"
                value={fmt2(r2(row.balance))}
                tone={Math.abs(row.balance) < 0.01 ? "good" : "bad"}
              />
              <Figure
                label="SAP pending"
                value={String(row.pendingSap)}
                tone={row.pendingSap ? "bad" : "good"}
              />
            </span>
            <span className="w-[110px] text-right">
              <StatusPill status={row.status} />
            </span>
          </button>
          {open === row.key ? <AllocationEditor row={row} /> : null}
        </div>
      ))}
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <span className="block">
      <em className="block text-[9px] font-semibold tracking-wide text-muted uppercase not-italic">
        {label}
      </em>
      <strong
        className={
          tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : undefined
        }
      >
        {value}
      </strong>
    </span>
  );
}

function AllocationEditor({ row }: { row: AllocationRow }) {
  const router = useRouter();
  const [draft, setDraft] = React.useState(() => ({
    free: row.freeQty,
    rows: Object.fromEntries(
      row.soRows.map((r) => [r.id, { revisedQty: r.revisedQty, sapUpdated: r.sapUpdated }])
    ) as Record<string, { revisedQty: number; sapUpdated: boolean }>,
  }));
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const revisedTotal = row.soRows.reduce(
    (a, r) => a + num(draft.rows[r.id]?.revisedQty),
    0
  );
  const balance = r2(row.invQty - revisedTotal - num(draft.free));
  const changed = row.soRows.filter(
    (r) => Math.abs(num(draft.rows[r.id]?.revisedQty) - r.qty) > 0.0001
  );
  const pending = changed.filter((r) => !draft.rows[r.id]?.sapUpdated);
  const dirty =
    Math.abs(num(draft.free) - row.freeQty) > 0.0001 ||
    row.soRows.some(
      (r) =>
        Math.abs(num(draft.rows[r.id]?.revisedQty) - r.revisedQty) > 0.0001 ||
        !!draft.rows[r.id]?.sapUpdated !== r.sapUpdated
    );

  const setRow = (id: string, patch: Partial<{ revisedQty: number; sapUpdated: boolean }>) =>
    setDraft((d) => ({
      ...d,
      rows: { ...d.rows, [id]: { ...d.rows[id], ...patch } },
    }));

  async function confirm() {
    setBusy(true);
    setMessage(null);
    const result = await saveAllocation({
      shipmentId: row.shipmentId,
      supplierCode: row.supplierCode,
      itemKey: row.itemKey,
      freeStockQty: num(draft.free),
      rows: row.soRows.map((r) => ({
        id: r.id,
        revisedQty: num(draft.rows[r.id]?.revisedQty),
        sapUpdated: !!draft.rows[r.id]?.sapUpdated,
      })),
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setMessage(
      Math.abs(result.balance) < 0.01
        ? "Allocation saved. The line is balanced."
        : `Allocation saved with ${fmt2(result.balance)} ${row.uom} still unallocated — the line stays on Sale Review until the balance is zero.`
    );
    router.refresh();
  }

  return (
    <div className="border-t border-line px-4 py-4">
      <p className="mb-3 text-[11px] text-muted">
        {Math.abs(row.invQty - row.soQty) < 0.0001 ? (
          <>
            <span className="pill pill-good">No original variance</span> The SO
            total already matches the invoice.
          </>
        ) : Math.abs(row.soVar) <= row.tolerance ? (
          <>
            <span className="pill pill-warn">CS ≤ {fmt(row.tolerance)}%</span>{" "}
            Customer Service can adjust directly. The gap is {pct(row.soVar)} of
            the confirmed invoice quantity.
          </>
        ) : (
          <>
            <span className="pill pill-bad">Sales approval</span> The variance is
            beyond tolerance; CS can prepare the change but release waits for
            Sales.
          </>
        )}
      </p>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-6">
        <Tile label="Supplier Invoice" value={`${fmt2(row.invQty)} ${row.uom}`} />
        <Tile label="Original SO Total" value={fmt(row.soQty)} />
        <Tile label="Revised SO Total" value={fmt(revisedTotal)} />
        <div className="rounded-lg border border-line bg-[#f9fafb] p-2.5">
          <span className="block text-[10px] text-muted">
            Sales-approved Free Stock
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            className="field mt-1 h-8 text-right"
            value={draft.free}
            onChange={(e) => setDraft({ ...draft, free: num(e.target.value) })}
          />
        </div>
        <Tile
          label="Remaining to Allocate"
          value={fmt2(balance)}
          tone={Math.abs(balance) < 0.01 ? "good" : "bad"}
        />
        <Tile
          label="SAP Updates Pending"
          value={String(pending.length)}
          tone={pending.length ? "bad" : "good"}
        />
      </div>

      {dirty ? (
        <p className="mb-3 rounded-lg bg-bad-bg px-3 py-2 text-xs text-bad">
          <strong>Not saved yet.</strong> These quantities are only on this
          screen — press <em>Confirm allocation</em> to write them.
        </p>
      ) : null}

      <table className="data-table">
        <thead>
          <tr>
            <th>SO</th>
            <th>Customer</th>
            <th className="num">Original SO Qty</th>
            <th className="num">Revised SO Qty</th>
            <th className="num">Adjustment +/-</th>
            <th>UOM</th>
            <th className="text-center">SAP Updated</th>
          </tr>
        </thead>
        <tbody>
          {row.soRows.map((r) => {
            const rev = num(draft.rows[r.id]?.revisedQty);
            const delta = r2(rev - r.qty);
            const rowChanged = Math.abs(delta) > 0.0001;
            return (
              <tr key={r.id} className={rowChanged && draft.rows[r.id]?.sapUpdated ? "bg-good-bg" : ""}>
                <td className="font-semibold">{r.soNo}</td>
                <td>{r.customer}</td>
                <td className="num">{fmt(r.qty)}</td>
                <td className="num">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="field h-8 w-28 text-right"
                    value={rev}
                    onChange={(e) => setRow(r.id, { revisedQty: num(e.target.value) })}
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    step="0.01"
                    className={`field h-8 w-24 text-right font-semibold ${
                      delta > 0 ? "text-bad" : delta < 0 ? "text-info" : ""
                    }`}
                    value={delta}
                    onChange={(e) =>
                      setRow(r.id, { revisedQty: r2(r.qty + num(e.target.value)) })
                    }
                  />
                </td>
                <td>{r.uom}</td>
                <td className="text-center">
                  {rowChanged ? (
                    <label className="text-[11px] font-medium">
                      <input
                        type="checkbox"
                        checked={!!draft.rows[r.id]?.sapUpdated}
                        onChange={(e) => setRow(r.id, { sapUpdated: e.target.checked })}
                      />{" "}
                      Yes
                    </label>
                  ) : (
                    <span className="text-[11px] text-muted">Not required</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {message ? (
          <span className="mr-auto text-xs font-medium text-muted">{message}</span>
        ) : null}
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() =>
            setDraft({
              free: 0,
              rows: Object.fromEntries(
                row.soRows.map((r) => [r.id, { revisedQty: r.qty, sapUpdated: false }])
              ),
            })
          }
        >
          Reset to original SOs
        </button>
        <button className="btn btn-good" onClick={confirm} disabled={busy}>
          {busy ? "Saving…" : dirty ? "Confirm allocation •" : "Confirm allocation"}
        </button>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-lg border border-line bg-[#f9fafb] p-2.5">
      <span className="block text-[10px] text-muted">{label}</span>
      <strong
        className={`mt-1 block text-lg ${
          tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""
        }`}
      >
        {value}
      </strong>
    </div>
  );
}
