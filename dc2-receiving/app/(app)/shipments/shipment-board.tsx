"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { deleteShipment, saveShipment } from "./actions";

export type ShipmentRow = {
  id: string;
  code: string;
  eta: string;
  mode: string;
  tolerancePct: number;
  notes: string;
  po: number;
  invoice: number;
  so: number;
};

const blank = { code: "", eta: "", mode: "Container", tolerancePct: "10", notes: "" };

export function ShipmentBoard({ shipments }: { shipments: ShipmentRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ ...blank });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<ShipmentRow | null>(null);

  function startEdit(s: ShipmentRow) {
    setEditing(s.id);
    setForm({
      code: s.code,
      eta: s.eta,
      mode: s.mode,
      tolerancePct: String(s.tolerancePct),
      notes: s.notes,
    });
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const result = await saveShipment(editing, data);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(null);
    setForm({ ...blank });
    router.refresh();
  }

  return (
    <>
      <form onSubmit={submit} className="card mb-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div>
            <label className="label">Shipment ID</label>
            <input
              name="code"
              className="field"
              placeholder="EU-2026-09-04-01"
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </div>
          <div>
            <label className="label">ETA</label>
            <input
              name="eta"
              type="date"
              className="field"
              value={form.eta}
              onChange={(e) => setForm({ ...form, eta: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Transport</label>
            <select
              name="mode"
              className="field"
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value })}
            >
              <option>Container</option>
              <option>Air</option>
              <option>Truck</option>
            </select>
          </div>
          <div>
            <label className="label">CS tolerance %</label>
            <input
              name="tolerancePct"
              type="number"
              step="0.1"
              min="0"
              max="100"
              className="field"
              value={form.tolerancePct}
              onChange={(e) => setForm({ ...form, tolerancePct: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Notes</label>
            <input
              name="notes"
              className="field"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button className="btn" disabled={busy}>
            {editing ? "Save shipment" : "Add shipment"}
          </button>
          {editing ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setEditing(null);
                setForm({ ...blank });
              }}
            >
              Cancel edit
            </button>
          ) : null}
          {error ? <span className="text-xs font-medium text-bad">{error}</span> : null}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Customer Service may settle a difference within the tolerance;
          anything beyond it waits for Sales.
        </p>
      </form>

      {shipments.length === 0 ? (
        <div className="rounded-xl border border-line bg-white px-6 py-10 text-center text-sm text-muted">
          No shipments yet. Add the first one above.
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Shipment</th>
              <th>ETA</th>
              <th>Transport</th>
              <th className="num">Tolerance</th>
              <th className="num">PO lines</th>
              <th className="num">Invoice lines</th>
              <th className="num">SO lines</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shipments.map((s) => (
              <tr key={s.id}>
                <td className="font-semibold">{s.code}</td>
                <td>{s.eta || "—"}</td>
                <td>{s.mode}</td>
                <td className="num">{s.tolerancePct}%</td>
                <td className="num">{s.po}</td>
                <td className="num">{s.invoice}</td>
                <td className="num">{s.so}</td>
                <td className="text-muted">{s.notes}</td>
                <td>
                  <div className="flex justify-end gap-2">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => startEdit(s)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-bad btn-sm"
                      onClick={() => setConfirmDelete(s)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {confirmDelete ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h2 className="text-sm font-bold">Delete {confirmDelete.code}?</h2>
            <p className="mt-2 text-xs text-muted">
              Its {confirmDelete.po} PO, {confirmDelete.invoice} invoice and{" "}
              {confirmDelete.so} SO lines go with it, together with every
              confirmation recorded against them. This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmDelete(null)}
              >
                Keep it
              </button>
              <button
                className="btn btn-bad"
                onClick={async () => {
                  const target = confirmDelete;
                  setConfirmDelete(null);
                  setBusy(true);
                  const result = await deleteShipment(target.id);
                  setBusy(false);
                  if (!result.ok) setError(result.error);
                  router.refresh();
                }}
              >
                Delete shipment
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
