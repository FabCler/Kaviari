"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  SECTION_LABELS,
  SECTION_PATHS,
  type Section,
} from "@/lib/permissions";

/**
 * The rail. It lists only the sections this account may open — and the server
 * checks the same list again on every page and every action, so hiding a link
 * is a convenience, not the control.
 */
export function AppShell({
  user,
  sections,
  children,
}: {
  user: { name: string; department: string; role: string };
  sections: Section[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  const initials =
    user.name
      .replace(/[^A-Za-z฀-๿ ]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "DC";

  return (
    <div className="flex min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-[214px] flex-col bg-gradient-to-b from-rail to-rail-deep px-3 pt-5">
        <div className="px-2 pb-4">
          <p className="text-[11px] font-extrabold tracking-[0.09em] text-white">
            DC2 RECEIVING
          </p>
          <p className="mt-[3px] text-[9px] text-white/50">
            Shipment Receiving Readiness
          </p>
        </div>
        <nav className="flex flex-1 flex-col justify-center gap-1 overflow-auto pb-4">
          {sections.map((s) => {
            const href = SECTION_PATHS[s];
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={s}
                href={href}
                className={`rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
                  active
                    ? "bg-rose text-rail-deep"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                {SECTION_LABELS[s]}
              </Link>
            );
          })}
        </nav>
        <div className="-mx-3 border-t border-white/10 bg-black/15 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-rose text-[11px] font-bold text-rail-deep">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-semibold text-white">
                {user.name}
              </span>
              <span className="block truncate text-[9px] text-white/50">
                {user.role === "owner" || user.role === "admin"
                  ? `${user.department || "Management"} · Administrator`
                  : user.department || "No department"}
              </span>
            </span>
          </div>
          <button
            className="mt-3 w-full rounded-lg border border-white/15 bg-white/10 py-1.5 text-[11px] font-semibold text-white/90 hover:bg-white/20 disabled:opacity-50"
            onClick={signOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>
      <main className="ml-[214px] flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
