"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  BellRing,
  Boxes,
  ChartNoAxesColumn,
  CalendarClock,
  ClipboardList,
  Database,
  FileSearch,
  FileUp,
  Handshake,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Package,
  PackageCheck,
  ReceiptText,
  Scale,
  ScrollText,
  Settings,
  ShieldAlert,
  Sparkles,
  Truck,
  UtensilsCrossed,
  Workflow,
} from "lucide-react";
import {
  can,
  departmentOf,
  type Permission,
} from "@/lib/osms/permissions";
import { DEPARTMENT_LABELS } from "@/lib/osms/domain";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  ownerOnly?: boolean;
  /** Hidden unless the user's department holds this permission. */
  permission?: Permission;
}

interface NavSection {
  title: string | null;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: null,
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inventory", label: "Inventory", icon: Package },
      { href: "/consume", label: "Consumption", icon: UtensilsCrossed },
      { href: "/planner", label: "Order Planner", icon: CalendarClock },
      { href: "/purchase-orders", label: "Purchase Orders", icon: ScrollText },
      { href: "/import", label: "Import & Analyze", icon: FileUp },
      { href: "/marketing", label: "Marketing", icon: Megaphone },
      { href: "/assistant", label: "Assistant", icon: Sparkles },
    ],
  },
  {
    title: "Order & Supply",
    items: [
      {
        href: "/osms",
        label: "Workflow",
        icon: Workflow,
        permission: "dashboard.view",
      },
      {
        href: "/osms/import",
        label: "01 Import files",
        icon: FileUp,
        permission: "documents.view",
      },
      {
        href: "/osms/purchasing/orders",
        label: "02 Purchase planning",
        icon: ClipboardList,
        permission: "purchasing.view",
      },
      {
        href: "/osms/purchasing/summary",
        label: "Supplier summary",
        icon: Handshake,
        permission: "purchasing.view",
      },
      {
        href: "/osms/purchasing/invoices",
        label: "Supplier invoices",
        icon: ReceiptText,
        permission: "purchasing.view",
      },
      {
        href: "/osms/purchasing/po-invoice",
        label: "PO vs Invoice",
        icon: ArrowLeftRight,
        permission: "purchasing.view",
      },
      {
        href: "/osms/sales/review",
        label: "03 Sales review",
        icon: BellRing,
        permission: "sales.view",
      },
      {
        href: "/osms/sales/shortage",
        label: "Channel shortage",
        icon: Scale,
        permission: "sales.view",
      },
      {
        href: "/osms/sales/allocation",
        label: "Customer allocation",
        icon: Handshake,
        permission: "sales.view",
      },
      {
        href: "/osms/po-vs-so",
        label: "PO vs SO",
        icon: ArrowLeftRight,
        permission: "documents.view",
      },
      {
        href: "/osms/warehouse/receiving",
        label: "04 Receiving",
        icon: PackageCheck,
        permission: "warehouse.view",
      },
      {
        href: "/osms/warehouse/stock",
        label: "Warehouse stock",
        icon: Boxes,
        permission: "warehouse.stock",
      },
      {
        href: "/osms/warehouse/shipments",
        label: "Shipments",
        icon: Truck,
        permission: "warehouse.view",
      },
      {
        href: "/osms/exceptions",
        label: "05 Exception center",
        icon: ShieldAlert,
        permission: "documents.view",
      },
      {
        href: "/osms/reports",
        label: "Performance",
        icon: ChartNoAxesColumn,
        permission: "reports.view",
      },
      {
        href: "/osms/master-data",
        label: "Master data",
        icon: Database,
        permission: "master.manage",
      },
      {
        href: "/osms/audit",
        label: "Audit trail",
        icon: FileSearch,
        permission: "audit.view",
      },
    ],
  },
  {
    title: null,
    items: [
      { href: "/settings", label: "Settings", icon: Settings, ownerOnly: true },
    ],
  },
];

const ALL_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

export interface ShellUser {
  name: string;
  role: string;
  department: string;
  allChannels: boolean;
  /** Channel codes a scoped sales user may see — shown under their name. */
  channelCodes?: string[];
}

function Wordmark({ osms }: { osms: boolean }) {
  return (
    <div className="px-6 pt-7 pb-5">
      <div className="font-display text-[1.7rem] leading-none tracking-[0.18em] text-pearl">
        {osms ? "OSMS" : "KAVIARI"}
      </div>
      <div className="mt-1.5 text-[0.65rem] font-medium tracking-[0.42em] text-gold uppercase">
        {osms ? "Order & Supply" : "Cellar"}
      </div>
      <div className="gold-rule mt-4 opacity-70" />
    </div>
  );
}

function NavLinks({
  onNavigate,
  user,
}: {
  onNavigate?: () => void;
  user: ShellUser;
}) {
  const pathname = usePathname();
  const isOwner = user.role === "owner";

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.ownerOnly && !isOwner) return false;
      if (item.permission && !can(user, item.permission)) return false;
      return true;
    }),
  })).filter((section) => section.items.length > 0);

  return (
    <nav className="flex flex-col gap-4 px-3" aria-label="Main navigation">
      {sections.map((section, index) => (
        <div key={section.title ?? `section-${index}`} className="flex flex-col gap-0.5">
          {section.title ? (
            <div className="px-3 pt-1 pb-1.5 text-[0.6rem] font-medium tracking-[0.2em] text-gold/70 uppercase">
              {section.title}
            </div>
          ) : null}
          {section.items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-white/5 hover:text-pearl"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  className={cn("size-4 shrink-0", active && "text-gold")}
                  aria-hidden
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/**
 * "/osms" must not light up for "/osms/import", and the Cellar dashboard "/"
 * must only match itself — so the longest matching href wins.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (pathname !== href && !pathname.startsWith(`${href}/`)) return false;
  const better = ALL_ITEMS.some(
    (item) =>
      item.href !== href &&
      item.href.length > href.length &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`))
  );
  return !better;
}

function UserFooter({ user }: { user: ShellUser }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }
  return (
    <div className="border-t border-sidebar-border px-6 py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm text-pearl">{user.name}</div>
          <div className="text-[0.65rem] tracking-wider text-sidebar-foreground/60 uppercase">
            {user.role === "owner"
              ? "Owner · Admin"
              : `${DEPARTMENT_LABELS[departmentOf(user)]}${
                  departmentOf(user) === "sales"
                    ? user.allChannels
                      ? " · all channels"
                      : user.channelCodes?.length
                        ? ` · ${user.channelCodes.join(" ")}`
                        : " · no channel"
                    : ""
                }`}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={logout}
          aria-label="Sign out"
          className="text-sidebar-foreground hover:bg-white/10 hover:text-pearl"
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: ShellUser;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();
  // OSMS is its own system with its own palette; the Cellar keeps hers. One
  // class on the shell swaps the whole token set (see .osms-theme in
  // globals.css) — no component knows which system it is being rendered in.
  const osms = pathname === "/osms" || pathname.startsWith("/osms/");
  const current =
    ALL_ITEMS.find((item) => isActive(pathname, item.href))?.label ??
    (osms ? "Order & Supply Management" : "Kaviari Cellar");

  return (
    <div className={cn("flex min-h-dvh w-full", osms && "osms-theme")}>
      {/* Desktop sidebar */}
      <aside className="pearl-dots fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sidebar lg:flex">
        <Wordmark osms={osms} />
        <div className="flex-1 overflow-y-auto pb-6">
          <NavLinks user={user} />
        </div>
        <UserFooter user={user} />
      </aside>

      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-pearl hover:bg-white/10 hover:text-pearl"
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="pearl-dots w-72 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Wordmark osms={osms} />
            <div className="flex-1 overflow-y-auto pb-6">
              <NavLinks user={user} onNavigate={() => setMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        <div className="font-display text-lg tracking-[0.14em] text-pearl">
          {osms ? "OSMS" : "KAVIARI"}
        </div>
        <span className="text-sidebar-foreground/50">·</span>
        <div className="truncate text-sm text-sidebar-foreground">{current}</div>
      </header>

      {/* Content */}
      <main className="min-w-0 flex-1 pt-14 lg:pt-0 lg:pl-60">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
