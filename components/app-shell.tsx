"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  FileUp,
  LayoutDashboard,
  Megaphone,
  Menu,
  Package,
  ScrollText,
  Settings,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/consume", label: "Log Consumption", icon: UtensilsCrossed },
  { href: "/planner", label: "Order Planner", icon: CalendarClock },
  { href: "/purchase-orders", label: "Purchase Orders", icon: ScrollText },
  { href: "/import", label: "Import & Analyze", icon: FileUp },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function Wordmark() {
  return (
    <div className="px-6 pt-7 pb-5">
      <div className="font-display text-[1.7rem] leading-none tracking-[0.18em] text-pearl">
        KAVIARI
      </div>
      <div className="mt-1.5 text-[0.65rem] font-medium tracking-[0.42em] text-gold uppercase">
        Cellar
      </div>
      <div className="gold-rule mt-4 opacity-70" />
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Main navigation">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
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
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();
  const current =
    NAV_ITEMS.find((item) =>
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
    )?.label ?? "Kaviari Cellar";

  return (
    <div className="flex min-h-dvh w-full">
      {/* Desktop sidebar */}
      <aside className="pearl-dots fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sidebar lg:flex">
        <Wordmark />
        <div className="flex-1 overflow-y-auto pb-6">
          <NavLinks />
        </div>
        <div className="border-t border-sidebar-border px-6 py-4 text-[0.65rem] tracking-wider text-sidebar-foreground/60 uppercase">
          Sourced from Kaviari, Paris
        </div>
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
            <Wordmark />
            <div className="flex-1 overflow-y-auto pb-6">
              <NavLinks onNavigate={() => setMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        <div className="font-display text-lg tracking-[0.14em] text-pearl">
          KAVIARI
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
