import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { canSee } from "@/lib/permissions";
import { loadAllLines } from "@/lib/workspace";
import { shipmentStatus } from "@/lib/domain";
import { fmtDate } from "@/lib/format";
import { Empty, PageHeader, StatusPill } from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const workspaces = await loadAllLines();
  const all = workspaces.flatMap((w) => w.lines);
  const openExceptions = all.reduce((n, l) => n + l.unresolved.length, 0);
  const pending = all.filter((l) => l.status !== "READY").length;
  const readySuppliers = new Set(
    all.filter((l) => l.status === "READY").map((l) => `${l.shipmentCode}|${l.supplierCode}`)
  ).size;

  const metrics: { label: string; value: number; href: string; hint: string }[] = [
    {
      label: "Active shipments",
      value: workspaces.length,
      href: "/shipments",
      hint: "View all shipments",
    },
    {
      label: "Pending validations",
      value: pending,
      href: "/validation",
      hint: "Go to Validation",
    },
    {
      label: "Open exceptions",
      value: openExceptions,
      href: "/exceptions",
      hint: "View exceptions",
    },
    {
      label: "Supplier lines ready",
      value: readySuppliers,
      href: "/receiving",
      hint: "Go to Receiving",
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome back, ${user.name.split(" ")[0]}. Here is where DC2 receiving stands.`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="card">
            <p className="text-[10px] font-bold tracking-wide text-muted uppercase">
              {m.label}
            </p>
            <p className="mt-1 text-3xl font-bold">{m.value}</p>
            {canSee(user, sectionOf(m.href)) ? (
              <Link className="mt-1 block text-[11px] font-semibold text-rose-deep" href={m.href}>
                {m.hint} →
              </Link>
            ) : null}
          </div>
        ))}
      </div>

      <h2 className="mb-2 text-sm font-bold">Shipment overview</h2>
      {workspaces.length === 0 ? (
        <Empty>
          No shipments yet.{" "}
          {canSee(user, "shipments") ? (
            <Link className="font-semibold text-rose-deep" href="/shipments">
              Create the first one
            </Link>
          ) : (
            "Purchasing creates them under Shipment Setup."
          )}
        </Empty>
      ) : (
        <div className="space-y-2">
          {workspaces.map((w) => {
            const suppliers = new Set(w.lines.map((l) => l.supplierCode));
            const exceptions = w.lines.reduce((n, l) => n + l.unresolved.length, 0);
            const ready = [...suppliers].filter((code) =>
              w.lines
                .filter((l) => l.supplierCode === code)
                .every((l) => l.status === "READY")
            ).length;
            return (
              <div key={w.shipment.id} className="card flex flex-wrap items-center gap-4">
                <div className="min-w-[210px] flex-1">
                  <p className="font-semibold">{w.shipment.code}</p>
                  <p className="text-[11px] text-muted">
                    ETA {fmtDate(w.shipment.eta) || "—"} · {w.shipment.mode}
                  </p>
                </div>
                <Stat label="Suppliers" value={suppliers.size} />
                <Stat label="Items" value={w.lines.length} />
                <Stat label="Exceptions" value={exceptions} tone={exceptions ? "bad" : "good"} />
                <Stat label="Ready" value={`${ready} of ${suppliers.size}`} />
                <StatusPill status={shipmentStatus(w.lines)} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "good" | "bad";
}) {
  return (
    <div className="min-w-[92px]">
      <p className="text-[9px] font-bold tracking-wide text-muted uppercase">{label}</p>
      <p
        className={`text-sm font-semibold ${
          tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function sectionOf(href: string) {
  return href === "/shipments"
    ? "shipments"
    : href === "/validation"
      ? "validation"
      : href === "/exceptions"
        ? "exceptions"
        : "receiving";
}
