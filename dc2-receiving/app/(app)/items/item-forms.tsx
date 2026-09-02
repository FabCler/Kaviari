"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { deleteItem, deleteLink, importMaster, saveItem, saveLink } from "./actions";

/**
 * The two entry forms and their row actions. Editing loads the row into the
 * form above the table rather than opening a dialog, which keeps one place
 * where an item is written.
 */

type Values = Record<string, string>;

export function ItemEntry() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [values, setValues] = React.useState<Values>({});
  const [editingId, setEditingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        kind: string;
        id: string;
        values: Values;
      };
      if (detail.kind !== "item") return;
      setEditingId(detail.id);
      setValues(detail.values);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("dc2:edit", handler);
    return () => window.removeEventListener("dc2:edit", handler);
  }, []);

  return (
    <form
      className="card mb-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const result = await saveItem(editingId, new FormData(event.currentTarget));
        setBusy(false);
        if (!result.ok) return setError(result.error);
        setEditingId(null);
        setValues({});
        (event.target as HTMLFormElement).reset();
        router.refresh();
      }}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Field name="barcode" label="CodeBars" values={values} setValues={setValues} required />
        <Field name="itemCode" label="ItemCode" values={values} setValues={setValues} />
        <Field name="nameTh" label="Item Name TH" values={values} setValues={setValues} />
        <Field name="nameEn" label="Item Name ENG" values={values} setValues={setValues} />
        <Field name="uom" label="InventoryUOM" values={values} setValues={setValues} />
        <div className="flex items-end gap-2">
          <button className="btn w-full" disabled={busy}>
            {editingId ? "Save item" : "Add item"}
          </button>
        </div>
      </div>
      {editingId ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm mt-3"
          onClick={() => {
            setEditingId(null);
            setValues({});
          }}
        >
          Cancel edit
        </button>
      ) : null}
      {error ? <p className="mt-2 text-xs font-medium text-bad">{error}</p> : null}
      <p className="mt-2 text-[11px] text-muted">
        <strong>CodeBars is the master key.</strong> Documents that carry only an
        ItemCode are matched through it.
      </p>
    </form>
  );
}

export function LinkEntry() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [values, setValues] = React.useState<Values>({});
  const [editingId, setEditingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        kind: string;
        id: string;
        values: Values;
      };
      if (detail.kind !== "link") return;
      setEditingId(detail.id);
      setValues(detail.values);
    };
    window.addEventListener("dc2:edit", handler);
    return () => window.removeEventListener("dc2:edit", handler);
  }, []);

  return (
    <form
      className="card mb-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const result = await saveLink(editingId, new FormData(event.currentTarget));
        setBusy(false);
        if (!result.ok) return setError(result.error);
        setEditingId(null);
        setValues({});
        (event.target as HTMLFormElement).reset();
        router.refresh();
      }}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Field name="supplierCode" label="Supplier Code" values={values} setValues={setValues} />
        <Field name="supplierItemCode" label="Supplier Item Code" values={values} setValues={setValues} />
        <Field name="supplierItemName" label="Supplier Item Name" values={values} setValues={setValues} />
        <Field name="supplierUom" label="Supplier UOM" values={values} setValues={setValues} />
        <Field name="itemRef" label="CodeBars" values={values} setValues={setValues} required />
        <div className="flex items-end">
          <button className="btn w-full" disabled={busy}>
            {editingId ? "Save link" : "Add link"}
          </button>
        </div>
      </div>
      {editingId ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm mt-3"
          onClick={() => {
            setEditingId(null);
            setValues({});
          }}
        >
          Cancel edit
        </button>
      ) : null}
      {error ? <p className="mt-2 text-xs font-medium text-bad">{error}</p> : null}
    </form>
  );
}

function Field({
  name,
  label,
  values,
  setValues,
  required,
}: {
  name: string;
  label: string;
  values: Values;
  setValues: (v: Values) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        name={name}
        className="field"
        required={required}
        value={values[name] ?? ""}
        onChange={(e) => setValues({ ...values, [name]: e.target.value })}
      />
    </div>
  );
}

export function RowActions({
  kind,
  id,
  values,
}: {
  kind: "item" | "link";
  id: string;
  values: Values;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="flex justify-end gap-2">
      <button
        className="btn btn-secondary btn-sm"
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent("dc2:edit", { detail: { kind, id, values } })
          )
        }
      >
        Edit
      </button>
      <button
        className="btn btn-bad btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          if (kind === "item") await deleteItem(id);
          else await deleteLink(id);
          setBusy(false);
          router.refresh();
        }}
      >
        Delete
      </button>
    </div>
  );
}

export function MasterImport() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "good" | "bad"; text: string } | null>(
    null
  );
  return (
    <form
      className="card"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage(null);
        const result = await importMaster(new FormData(event.currentTarget));
        setBusy(false);
        setMessage(
          result.ok
            ? { tone: "good", text: result.message ?? "Imported." }
            : { tone: "bad", text: result.error }
        );
        if (result.ok) {
          (event.target as HTMLFormElement).reset();
          router.refresh();
        }
      }}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <label className="label">Data</label>
          <select name="kind" className="field">
            <option value="item">Item master</option>
            <option value="link">Supplier code mapping</option>
          </select>
        </div>
        <div className="md:col-span-2">
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
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
      {message ? (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
            message.tone === "bad" ? "bg-bad-bg text-bad" : "bg-good-bg text-good"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}

export function Pager({
  param,
  page,
  pageSize,
  total,
  label,
}: {
  param: string;
  page: number;
  pageSize: number;
  total: number;
  label: string;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  if (total <= pageSize) return null;
  const pages = Math.ceil(total / pageSize);
  const href = (p: number) => {
    const next = new URLSearchParams(search.toString());
    next.set(param, String(p));
    return `${pathname}?${next.toString()}`;
  };
  return (
    <div className="mt-2 flex items-center gap-2 text-xs">
      <Link
        className={`btn btn-secondary btn-sm ${page === 0 ? "pointer-events-none opacity-40" : ""}`}
        href={href(Math.max(0, page - 1))}
      >
        Previous
      </Link>
      <span className="text-muted">
        Showing {page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} of{" "}
        {total.toLocaleString()} {label}
      </span>
      <Link
        className={`btn btn-secondary btn-sm ${page + 1 >= pages ? "pointer-events-none opacity-40" : ""}`}
        href={href(Math.min(pages - 1, page + 1))}
      >
        Next
      </Link>
    </div>
  );
}
