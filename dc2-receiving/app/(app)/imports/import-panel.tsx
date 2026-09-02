"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  deleteBatch,
  importDocument,
  importParsedRows,
  parsePdf,
  type PdfPreviewRow,
} from "./actions";
import { num } from "@/lib/format";

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

type Preview = {
  source: string;
  docNo: string;
  supplierName: string;
  currency: string;
  lineCount: number;
  rows: (PdfPreviewRow & { keep: boolean })[];
  shipmentId: string;
  kind: string;
  supplierCode: string;
};

export function ImportPanel({ shipments }: { shipments: Shipment[] }) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [kind, setKind] = React.useState("po");
  const [isPdf, setIsPdf] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [message, setMessage] = React.useState<
    { tone: "good" | "bad" | "warn"; text: string } | null
  >(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const data = new FormData(event.currentTarget);

    // A spreadsheet is a table and goes straight in; a PDF is a drawing, so
    // what is read from it is proposed for checking first.
    if (isPdf) {
      const result = await parsePdf(data);
      setBusy(false);
      if (!result.ok) {
        setMessage({ tone: "bad", text: result.error });
        return;
      }
      setPreview({
        source: result.source,
        docNo: result.docNo,
        supplierName: result.supplierName,
        currency: result.currency,
        lineCount: result.lineCount,
        rows: result.rows.map((r) => ({ ...r, keep: true })),
        shipmentId: String(data.get("shipmentId") ?? ""),
        kind: String(data.get("kind") ?? ""),
        supplierCode: String(data.get("supplierCode") ?? ""),
      });
      return;
    }

    const result = await importDocument(data);
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "bad", text: result.error });
      return;
    }
    finish(result.rows, result.unmatched, result.source);
  }

  function finish(rows: number, unmatched: number, source: string) {
    setMessage({
      tone: unmatched ? "warn" : "good",
      text: unmatched
        ? `${rows} lines imported from ${source}. ${unmatched} did not match the item master — add them under Item Management, or link the supplier's own code.`
        : `${rows} lines imported from ${source}.`,
    });
    setPreview(null);
    formRef.current?.reset();
    setIsPdf(false);
    router.refresh();
  }

  return (
    <>
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
          <div>
            <label className="label">File</label>
            <input
              name="file"
              type="file"
              className="field py-1.5"
              accept=".xlsx,.xlsm,.xls,.csv,.tsv,.txt,.pdf"
              required
              onChange={(e) =>
                setIsPdf(/\.pdf$/i.test(e.target.files?.[0]?.name ?? ""))
              }
            />
          </div>
          <div className="flex items-end">
            <button className="btn w-full" disabled={busy}>
              {busy ? (isPdf ? "Reading…" : "Importing…") : isPdf ? "Read PDF" : "Import file"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          {HELP[kind]}{" "}
          {isPdf
            ? "A PDF is read line by line and opens a preview first — you confirm every row before it reaches the shipment."
            : null}
        </p>
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

      {preview ? (
        <PdfPreviewTable
          preview={preview}
          setPreview={setPreview}
          onDone={finish}
          onCancel={() => setPreview(null)}
        />
      ) : null}
    </>
  );
}

function PdfPreviewTable({
  preview,
  setPreview,
  onDone,
  onCancel,
}: {
  preview: Preview;
  setPreview: (p: Preview) => void;
  onDone: (rows: number, unmatched: number, source: string) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const set = (i: number, patch: Partial<Preview["rows"][number]>) =>
    setPreview({
      ...preview,
      rows: preview.rows.map((r, n) => (n === i ? { ...r, ...patch } : r)),
    });

  const keeping = preview.rows.filter((r) => r.keep);
  const unmatched = keeping.filter((r) => !r.barcode).length;

  return (
    <div className="card mt-3 border-info/40">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold">
          Read {preview.rows.length} line{preview.rows.length === 1 ? "" : "s"} from{" "}
          {preview.source}
        </h3>
        <span className="text-[11px] text-muted">
          {preview.docNo ? `document no. ${preview.docNo} · ` : ""}
          {preview.currency ? `${preview.currency} · ` : ""}
          {preview.supplierName ? `${preview.supplierName} · ` : ""}
          {preview.lineCount} text lines scanned
        </span>
      </div>
      <p className="mb-3 text-[11px] text-muted">
        Check every row before it reaches the shipment — a PDF has no columns,
        so these were worked out from the page. Correct anything that is wrong,
        untick what is not a document line, then import.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 46 }}>Use</th>
            <th style={{ width: 130 }}>CodeBars</th>
            <th style={{ width: 110 }}>Item code</th>
            <th>Description on the document</th>
            <th className="num" style={{ width: 110 }}>
              Qty
            </th>
            <th style={{ width: 80 }}>UOM</th>
            <th className="num" style={{ width: 110 }}>
              Unit price
            </th>
            <th className="num" style={{ width: 100 }}>
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((r, i) => (
            <tr key={i} className={r.keep ? undefined : "opacity-40"}>
              <td className="text-center">
                <input
                  type="checkbox"
                  checked={r.keep}
                  onChange={(e) => set(i, { keep: e.target.checked })}
                />
              </td>
              <td>
                <input
                  className={`field h-8 ${r.barcode ? "" : "border-warn"}`}
                  value={r.barcode}
                  placeholder="not matched"
                  onChange={(e) => set(i, { barcode: e.target.value })}
                />
              </td>
              <td>
                <input
                  className="field h-8"
                  value={r.itemCode}
                  onChange={(e) => set(i, { itemCode: e.target.value })}
                />
              </td>
              <td>
                <input
                  className="field h-8"
                  value={r.itemDesc}
                  onChange={(e) => set(i, { itemDesc: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.001"
                  className="field h-8 text-right"
                  value={r.qty}
                  onChange={(e) => set(i, { qty: num(e.target.value) })}
                />
              </td>
              <td>
                <input
                  className="field h-8"
                  value={r.uom}
                  onChange={(e) => set(i, { uom: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  className="field h-8 text-right"
                  value={r.price}
                  onChange={(e) => set(i, { price: num(e.target.value) })}
                />
              </td>
              <td className="num text-muted">{r.amount.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {unmatched ? (
        <p className="mt-3 rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
          {unmatched} of the {keeping.length} lines did not match the item master.
          They can still be imported — they will show on Validation as{" "}
          <em>not in Item Master</em> until the item or the supplier link is
          added.
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg bg-bad-bg px-3 py-2 text-xs font-medium text-bad">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex justify-end gap-2">
        <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn"
          disabled={busy || !keeping.length}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const result = await importParsedRows({
              shipmentId: preview.shipmentId,
              kind: preview.kind as "po" | "invoice" | "so",
              supplierCode: preview.supplierCode,
              docNo: preview.docNo,
              currency: preview.currency,
              source: preview.source,
              rows: keeping.map((r) => ({
                barcode: r.barcode,
                itemCode: r.itemCode,
                itemDesc: r.itemDesc,
                qty: r.qty,
                uom: r.uom,
                price: r.price,
              })),
            });
            setBusy(false);
            if (!result.ok) return setError(result.error);
            onDone(result.rows, result.unmatched, result.source);
          }}
        >
          {busy ? "Importing…" : `Import ${keeping.length} line${keeping.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
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
