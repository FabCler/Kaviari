"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { assignSoSupplier, setRootCause, toggleResolution } from "./actions";
import { ROOT_CAUSES } from "@/lib/domain";

type LineRef = {
  shipmentId: string;
  supplierCode: string;
  itemKey: string;
};

export function ResolveBox({
  line,
  issueType,
  issueOwner,
  checked,
  detail,
  canAct,
}: {
  line: LineRef;
  issueType: string;
  issueOwner: string;
  checked: boolean;
  detail: string;
  canAct: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // The tick answers the click straight away and the server catches up; if the
  // write is refused the box goes back to what the workspace says.
  const [shown, setShown] = React.useState(checked);
  React.useEffect(() => setShown(checked), [checked]);

  return (
    <div className="my-1">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-[3px]"
          checked={shown}
          disabled={busy || !canAct}
          onChange={async (event) => {
            const next = event.target.checked;
            setShown(next);
            setBusy(true);
            setError(null);
            const result = await toggleResolution(
              line.shipmentId,
              line.supplierCode,
              line.itemKey,
              issueType,
              issueOwner
            );
            setBusy(false);
            if (!result.ok) {
              setShown(!next);
              setError(result.error);
            } else router.refresh();
          }}
        />
        <span>
          <span className="font-semibold">{issueType}</span>
          {shown ? <span className="pill pill-good ml-2">confirmed</span> : null}
          <span className="block text-[11px] text-muted">{detail}</span>
          {!canAct ? (
            <span className="block text-[11px] text-muted italic">
              {issueOwner} confirms this one.
            </span>
          ) : null}
          {error ? (
            <span className="block text-[11px] font-medium text-bad">{error}</span>
          ) : null}
        </span>
      </label>
    </div>
  );
}

export function RootCauseSelect({
  line,
  value,
}: {
  line: LineRef;
  value: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="mt-1 text-[11px]">
      <span className="mr-1 text-muted">Root cause:</span>
      <select
        className="field inline-block h-7 w-auto text-[11px]"
        value={value}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          setError(null);
          const result = await setRootCause(
            line.shipmentId,
            line.supplierCode,
            line.itemKey,
            e.target.value
          );
          setBusy(false);
          if (!result.ok) setError(result.error);
          else router.refresh();
        }}
      >
        <option value="">Select…</option>
        {ROOT_CAUSES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      {error ? <span className="ml-2 font-medium text-bad">{error}</span> : null}
    </div>
  );
}

export function SupplierAssign({
  soLineId,
  soNo,
  customerName,
  options,
}: {
  soLineId: string;
  soNo: string;
  customerName: string;
  options: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="mt-1 text-[11px]">
      SO {soNo} {customerName}:{" "}
      <select
        className="field inline-block h-7 w-auto text-[11px]"
        defaultValue=""
        disabled={busy}
        onChange={async (e) => {
          if (!e.target.value) return;
          setBusy(true);
          await assignSoSupplier(soLineId, e.target.value);
          setBusy(false);
          router.refresh();
        }}
      >
        <option value="">Assign supplier</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
