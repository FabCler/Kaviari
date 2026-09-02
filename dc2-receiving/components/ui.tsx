import * as React from "react";
import type { Status } from "@/lib/domain";

/** One place decides what a status looks like, on every screen. */
export function StatusPill({ status }: { status: Status | string }) {
  const cls =
    status === "READY"
      ? "pill-good"
      : status === "HOLD"
        ? "pill-bad"
        : status === "PURCHASE REVIEW"
          ? "pill-warn"
          : "pill-info";
  return <span className={`pill ${cls}`}>{status}</span>;
}

export function OwnerPill({ owner }: { owner: string }) {
  const cls =
    owner === "Purchasing"
      ? "pill-warn"
      : owner === "Sales"
        ? "pill-info"
        : owner === "Customer Service"
          ? "pill-good"
          : "pill-bad";
  return <span className={`pill ${cls}`}>{owner}</span>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-lg font-bold">{title}</h1>
        {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white px-6 py-10 text-center text-sm text-muted">
      {children}
    </div>
  );
}

export function Callout({
  tone = "info",
  children,
}: {
  tone?: "info" | "bad" | "good" | "warn";
  children: React.ReactNode;
}) {
  const cls =
    tone === "bad"
      ? "border-bad/30 bg-bad-bg"
      : tone === "good"
        ? "border-good/30 bg-good-bg"
        : tone === "warn"
          ? "border-warn/30 bg-warn-bg"
          : "border-info/25 bg-info-bg";
  return (
    <div className={`mb-4 rounded-xl border px-4 py-3 text-xs ${cls}`}>
      {children}
    </div>
  );
}
