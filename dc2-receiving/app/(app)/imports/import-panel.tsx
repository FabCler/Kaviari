"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { deleteBatch, importDocument } from "./actions";

type Shipment = { id: string; code: string };

const KINDS = [
  { value: "po", label: "Purchase Orders" },
  { value: "invoice", label: "Supplier / A/P Invoices" },
  { value: "so", label: "Customer Sales Orders" },
];

const HELP: Record<string, string> = {
  po: "Import the PO first: its vendor and unit prices are what later invoices are matched against.",
  invoice:
    "Name the supplier this invoice belongs to, so its lines meet the right PO.",
  so: "Customer orders aligned to this shipment. A Supplier Code column is optional but useful when the same item comes from more than one supplier.",
};

export function ImportPanel({ shipments }: { shipments: Shipment[] }) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [kind, setKind] = React.useState("po");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<
    { tone: "good" | "bad" | "warn"; text: string } | null
  >(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await importDocument(new FormData(event.currentTarget));
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "bad", text: result.error });
      return;
    }
    setMessage({
      tone: result.unmatched ? "warn" : "good",
      text: result.unmatched
        ? `${result.rows} lines imported from ${result.source}. ${result.unmatched} did not match the item master — add them under Item Management, or link the supplier's own code.`
        : `${result.rows} lines imported from ${result.source}.`,
    });
    formRef.current?.reset();
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={submit} className="card">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <div>
          <label className="label">Data type</label>
          <select
            name="kind"
            className="field"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Shipment</label>
          <select name="shipmentId" className="field" required>
            <option value="">Select…</option>
            {shipments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Supplier</label>
          <input
            name="supplierCode"
            className="field"
            placeholder={kind === "so" ? "optional" : "VO00132"}
          />
        </div>
        <div className="md:col-span-1">
          <label className="label">File</label>
          <input
            name="file"
            type="file"
            className="field py-1.5"
            accept=".xlsx,.xlsm,.xls,.csv,.tsv,.txt"
            required
          />
        </div>
        <div className="flex items-end">
          <button className="btn w-full" disabled={busy}>
            {busy ? "Importing…" : "Import file"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted">{HELP[kind]}</p>
      {message ? (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
            message.tone === "bad"
              ? "bg-bad-bg text-bad"
              : message.tone === "warn"
                ? "bg-warn-bg text-warn"
                : "bg-good-bg text-good"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}

export function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [asking, setAsking] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  if (!asking)
    return (
      <div className="flex justify-end">
        <button className="btn btn-secondary btn-sm" onClick={() => setAsking(true)}>
          Remove
        </button>
      </div>
    );
  return (
    <div className="flex justify-end gap-2">
      <button className="btn btn-secondary btn-sm" onClick={() => setAsking(false)}>
        Keep
      </button>
      <button
        className="btn btn-bad btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await deleteBatch(id);
          setBusy(false);
          router.refresh();
        }}
      >
        Delete import
      </button>
    </div>
  );
}
