"use client";

import {
  Bell,
  Boxes,
  Building2,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Package,
  ScrollText,
  Settings,
  ShoppingBag,
  Tag,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SiteLogo } from "@/components/brand/site-logo";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  useMarkCategoryRead,
  useUnreadCounts,
  type NotificationCategory,
} from "@/lib/notifications";
import { usePagePermissions } from "@/lib/page-permissions";
import type { PageKey } from "@/lib/schemas/page-permissions";

import { useSidebar } from "./sidebar-context";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  /**
   * Notification category this tab represents. Drives the per-tab
   * unread-count badge in the sidebar. The `notifications` entry
   * itself uses the special token `__total__` so it lights up with
   * the bell's overall unread count, not a single category.
   */
  category?: NotificationCategory | "__total__";
  /**
   * Migration 0039 — the page-permission key that gates this item
   * for the ADMIN role. Items with a key are hidden when
   * permissions[key] is false. SUPER_ADMIN and the legacy admin
   * roles always see items (server returns all-true for them).
   */
  pageKey?: PageKey;
  /**
   * Migration 0039 — items reachable only by SUPER_ADMIN. Filtered
   * out for every other role. Used for the config editors that
   * never appear on the ADMIN registry (no page key can grant
   * them).
   */
  superAdminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, pageKey: "admin.dashboard" },
  // Phase H — SUPER_ADMIN-only platform dashboard (finance-sensitive
  // aggregates: revenue, wallet totals, warehouse KPIs).
  {
    href: "/admin/super-dashboard",
    label: "Super dashboard",
    icon: LayoutDashboard,
    superAdminOnly: true,
  },
  { href: "/admin/psn", label: "Receiving", icon: ClipboardCheck, category: "psn", pageKey: "admin.psn.read" },
  { href: "/admin/vendors", label: "Vendors", icon: Building2, category: "vendor", pageKey: "admin.vendors.read" },
  { href: "/admin/inventory", label: "Inventory", icon: Package, pageKey: "admin.inventory.read" },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList, category: "order", pageKey: "admin.orders.read" },
  // Migration 0042 — Fulfillment v2 pack queue. Same page-permission
  // gate as legacy orders because packing IS an order-write action;
  // any operator who can pick/pack today can also record v2 dimensions.
  { href: "/admin/pack", label: "Pack (v2)", icon: Boxes, pageKey: "admin.orders.write" },
  { href: "/admin/returns", label: "Returns", icon: Undo2, category: "return", pageKey: "admin.returns.read" },
  { href: "/admin/shopper", label: "Shopper", icon: ShoppingBag, category: "shopper", pageKey: "admin.shopper.read" },
  { href: "/admin/finance", label: "Finance", icon: CreditCard, category: "wallet", pageKey: "admin.finance.read" },
  {
    href: "/admin/notifications",
    label: "Notifications",
    icon: Bell,
    category: "__total__",
    pageKey: "admin.notifications.read",
  },
  // Migration 0039 — SUPER_ADMIN-only. Manages who has which admin
  // role, including promoting an operator to the new ADMIN role
  // whose per-page access is configured separately.
  {
    href: "/admin/users",
    label: "Admin users",
    icon: Building2,
    superAdminOnly: true,
  },
  // Migration 0039 — pricing / config editors are SUPER_ADMIN-only.
  // No page key on the ADMIN registry maps to these, so the sidebar
  // hides them entirely for other roles.
  { href: "/admin/config/fees", label: "Pricing (Fulfillment)", icon: Tag, superAdminOnly: true },
  // Shopper has its own commission + freight + tax editor — separate
  // from the fulfillment fee schedule above. Dedicated entry so admins don't
  // have to drill through the generic Config table to find it.
  { href: "/admin/config/shopper", label: "Pricing (Shopper)", icon: ShoppingBag, superAdminOnly: true },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText, pageKey: "admin.audit.read" },
  { href: "/admin/config", label: "Config", icon: Settings, superAdminOnly: true },
];

export function AdminSidebar(): JSX.Element {
  const pathname = usePathname();
  const { open, close } = useSidebar();
  // Unread counts power the per-tab badges. A query error hides every
  // badge silently — navigation still works, the badges are advisory.
  const countsQ = useUnreadCounts();
  const counts = countsQ.data;
  // Auto-ack: when the operator clicks a tab that has unread
  // notifications in its category, mark them read immediately. They're
  // about to be looking at the relevant page, so the unread state has
  // already served its purpose.
  const markCategoryRead = useMarkCategoryRead();

  // Migration 0039 — sidebar filtering. Two independent filters:
  //   1. `pageKey` items → hidden when permissions[key] is false.
  //      For non-ADMIN admin roles the server returns all-true so
  //      nothing gets hidden from them; for ADMIN the server maps
  //      the config row + defaults. Legacy sidebar behaviour is
  //      preserved for everyone except ADMIN.
  //   2. `superAdminOnly` items → hidden for every non-SUPER_ADMIN
  //      role. Pricing / config editors live here.
  // Items with neither flag are always shown.
  const { user } = useAuth();
  const { permissions } = usePagePermissions();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const visibleNav = NAV.filter((item) => {
    if (item.superAdminOnly && !isSuperAdmin) return false;
    if (item.pageKey && !permissions[item.pageKey]) return false;
    return true;
  });

  function badgeFor(item: NavItem): number {
    if (!item.category || !counts) return 0;
    if (item.category === "__total__") return counts.total;
    return counts.byCategory[item.category] ?? 0;
  }

  function handleNavClick(item: NavItem): void {
    // The "Notifications" tab uses __total__ — we don't auto-mark on
    // click because the notifications page itself is what the user
    // goes to *in order to* triage. Auto-clearing on entry would
    // remove the rows they came to look at.
    if (!item.category || item.category === "__total__") return;
    if (badgeFor(item) === 0) return;
    markCategoryRead.mutate(item.category);
  }

  return (
    <>
      {/* Backdrop — mobile only. Click-through closes the drawer.
          See vendor sidebar.tsx for the full design notes; the admin
          rail uses identical drawer semantics so admins on phones get
          the same hamburger-driven UX as vendors. */}
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
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-screen w-[17rem] max-w-[80vw] shrink-0 flex-col border-r border-line bg-ink text-text-inv transition-transform duration-200 ease-out md:pointer-events-auto md:static md:z-auto md:w-60 md:max-w-none md:translate-x-0",
          open ? "translate-x-0 shadow-2" : "pointer-events-none -translate-x-full md:pointer-events-auto",
        )}
      >
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
        <Link href="/admin" onClick={close} className="block" aria-label="USA Errands · Admin home">
          <SiteLogo tone="inverse" markClassName="h-6 w-6" />
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[1.6px] text-amber">
            Admin console
          </div>
        </Link>
        <button
          type="button"
          onClick={close}
          aria-label="Close sidebar"
          className="-mr-2 inline-flex h-9 w-9 items-center justify-center rounded-sm text-white/70 hover:bg-white/10 hover:text-text-inv md:hidden"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          // Exact match for /admin and the parent /admin/config item so
          // the dedicated child links (/admin/config/fees,
          // /admin/config/shopper) own the active highlight on their
          // own pages without /admin/config also lighting up.
          const exactOnly = item.href === "/admin" || item.href === "/admin/config";
          const active = exactOnly
            ? pathname === item.href
            : pathname?.startsWith(item.href);
          const disabledClass = item.disabled
            ? "pointer-events-none text-white/30"
            : "text-white/70 hover:bg-white/5 hover:text-text-inv";
          const activeClass = active && !item.disabled ? "bg-amber text-ink hover:bg-amber" : "";
          const badge = badgeFor(item);
          return (
            <Link
              key={item.href}
              href={item.disabled ? "#" : item.href}
              aria-disabled={item.disabled}
              tabIndex={item.disabled ? -1 : 0}
              onClick={() => {
                handleNavClick(item);
                close();
              }}
              className={cn(
                "mb-0.5 flex items-center gap-3 rounded-sm px-3 py-2 text-body-sm font-medium transition-colors duration-fast ease-out",
                disabledClass,
                activeClass,
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{item.label}</span>
              {item.disabled ? (
                <span className="ml-auto font-mono text-[9px] uppercase tracking-[1px] text-white/30">
                  Soon
                </span>
              ) : badge > 0 ? (
                <span
                  aria-label={`${badge} unread`}
                  className={cn(
                    "ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-semibold leading-none",
                    active ? "bg-ink text-text-inv" : "bg-error text-text-inv",
                  )}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-6 py-4 font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">
        v0.1 · P1
      </div>
      </aside>
    </>
  );
}
