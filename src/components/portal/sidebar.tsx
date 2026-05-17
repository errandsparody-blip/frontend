"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  Bell,
  Boxes,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Package,
  Repeat,
  Settings,
  Truck,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { api } from "@/lib/api-client";
import {
  useMarkCategoryRead,
  useUnreadCounts,
  type NotificationCategory,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

import { useSidebar } from "./sidebar-context";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Disabled until the relevant phase ships. */
  disabled?: boolean;
  /**
   * If set, renders a small amber dot when the test returns true. Used to
   * draw the vendor's eye to a navigation entry that's awaiting their
   * action — like KYC verification when the account is still PENDING.
   */
  needsAttention?: (ctx: { kycStatus?: string }) => boolean;
  /**
   * Notification category this tab represents. Drives the per-tab
   * unread-count badge. The Notifications entry uses `__total__` so it
   * mirrors the bell's count.
   */
  category?: NotificationCategory | "__total__";
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  {
    href: "/verification",
    label: "Verification",
    icon: BadgeCheck,
    needsAttention: ({ kycStatus }) => kycStatus !== "APPROVED",
    category: "verification",
  },
  { href: "/products", label: "Products", icon: Package },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/psn", label: "Pre-Shipment Notices", icon: ClipboardList, category: "psn" },
  { href: "/wallet", label: "Wallet", icon: CreditCard, category: "wallet" },
  { href: "/wallet/recurring", label: "Recurring storage", icon: Repeat },
  { href: "/orders", label: "Orders", icon: Truck, category: "order" },
  { href: "/returns", label: "Returns", icon: Undo2, category: "return" },
  { href: "/notifications", label: "Notifications", icon: Bell, category: "__total__" },
  // { href: "/team", label: "Team", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface VendorMeForSidebar {
  kycStatus: string;
}

export function Sidebar(): JSX.Element {
  const pathname = usePathname();
  const { open, close } = useSidebar();

  // The vendor profile is already cached by other portal pages — this query
  // hits the cache when warm and only fires on initial portal mount.
  const meQ = useQuery({
    queryKey: ["vendor", "me"],
    queryFn: () => api.get<VendorMeForSidebar>("/vendors/me"),
    staleTime: 30_000,
    // Don't fail loud in the sidebar — if the request errors, just hide the
    // attention dot. The page-level pages will surface the error properly.
    retry: false,
  });
  const kycStatus = meQ.data?.kycStatus;

  // Unread counts → per-tab badges. Same 30 s poll as the bell so the
  // sidebar and the dropdown stay in sync.
  const countsQ = useUnreadCounts();
  const counts = countsQ.data;
  // Auto-ack on click: clicking a tab with unread notifications drops
  // the badge to zero immediately. The Notifications tab itself
  // (category __total__) is exempt — that's where users go *to look at*
  // notifications, so clearing them on entry would defeat the point.
  const markCategoryRead = useMarkCategoryRead();

  function badgeFor(item: NavItem): number {
    if (!item.category || !counts) return 0;
    if (item.category === "__total__") return counts.total;
    return counts.byCategory[item.category] ?? 0;
  }

  function handleNavClick(item: NavItem): void {
    if (!item.category || item.category === "__total__") return;
    if (badgeFor(item) === 0) return;
    markCategoryRead.mutate(item.category);
  }

  return (
    <>
      {/* Backdrop — only paints when the drawer is open AND we're on
          mobile (md:hidden so it never blocks clicks on desktop, where
          the sidebar is part of the static grid). Click-through closes
          the drawer; the aria-label gives keyboard/screen-reader users
          a discoverable dismissal target. */}
      <button
        type="button"
        aria-label="Close sidebar"
        onClick={close}
        className={cn(
          "fixed inset-0 z-30 bg-ink/40 transition-opacity duration-200 ease-out md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        tabIndex={open ? 0 : -1}
      />

      <aside
        id="portal-sidebar"
        // Mobile: off-canvas drawer (fixed, translate-x). Desktop:
        // static rail (md:translate-x-0, md:static, md:z-auto). Width is
        // capped at 80vw so on very narrow phones the drawer never
        // covers the whole screen — there's always a visible strip of
        // the dimmed page behind it as a "tap here to dismiss" hint.
        // On desktop md+ we always restore pointer-events so the static
        // rail is fully interactive regardless of the `open` state.
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-screen w-[17rem] max-w-[80vw] shrink-0 flex-col border-r border-line bg-cream-soft transition-transform duration-200 ease-out md:pointer-events-auto md:static md:z-auto md:w-60 md:max-w-none md:translate-x-0",
          open ? "translate-x-0 shadow-2" : "pointer-events-none -translate-x-full md:pointer-events-auto",
        )}
      >
      <div className="flex items-center justify-between border-b border-line px-6 py-5">
        <Link href="/dashboard" onClick={close} className="block">
          <div className="text-[16px] font-bold tracking-[0.5px] text-ink">USA ERRANDS</div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[1.6px] text-amber">
            Vendor portal
          </div>
        </Link>
        {/* Close button — only on mobile. The hamburger in the topbar
            opens the drawer; this gives a symmetric close affordance
            without forcing users to find the backdrop. */}
        <button
          type="button"
          onClick={close}
          aria-label="Close sidebar"
          className="-mr-2 inline-flex h-9 w-9 items-center justify-center rounded-sm text-text hover:bg-ink/5 md:hidden"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV.map((item) => {
          const Icon = item.icon;
          // The "Wallet" parent entry has sub-pages (/wallet/recurring,
          // /wallet/fund, /wallet/statements) that each get their own
          // sidebar row, so we need an exact-match for /wallet to avoid
          // lighting up both rows when the user is on a sub-page.
          // Same rule for /dashboard which has no sub-pages but shouldn't
          // match anything that starts with /dashboard.
          const exactOnly = item.href === "/dashboard" || item.href === "/wallet";
          const active = exactOnly
            ? pathname === item.href
            : pathname?.startsWith(item.href);
          const disabledClass = item.disabled
            ? "pointer-events-none text-text-subtle"
            : "text-text hover:bg-cream-deep";
          const activeClass = active && !item.disabled ? "bg-ink text-text-inv hover:bg-ink" : "";
          const attention = item.needsAttention?.({ kycStatus }) ?? false;
          const badge = badgeFor(item);
          return (
            <Link
              key={item.href}
              href={item.disabled ? "#" : item.href}
              onClick={() => {
                handleNavClick(item);
                close();
              }}
              className={cn(
                "mb-0.5 flex items-center gap-3 rounded-sm px-3 py-2 text-body-sm font-medium transition-colors duration-fast ease-out",
                disabledClass,
                activeClass,
              )}
              aria-disabled={item.disabled}
              tabIndex={item.disabled ? -1 : 0}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{item.label}</span>
              {item.disabled ? (
                <span className="ml-auto font-mono text-[9px] uppercase tracking-[1px] text-text-subtle">
                  Soon
                </span>
              ) : badge > 0 ? (
                <span
                  aria-label={`${badge} unread`}
                  className={cn(
                    "ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-semibold leading-none",
                    active ? "bg-text-inv text-ink" : "bg-error text-text-inv",
                  )}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : attention ? (
                <span
                  aria-label="Action needed"
                  className="ml-auto h-2 w-2 shrink-0 rounded-full bg-amber"
                />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line px-6 py-4 font-mono text-[10px] uppercase tracking-[1.4px] text-text-subtle">
      </div>
      </aside>
    </>
  );
}
