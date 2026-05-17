"use client";

import {
  Bell,
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
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SiteLogo } from "@/components/brand/site-logo";
import { cn } from "@/lib/utils";
import {
  useMarkCategoryRead,
  useUnreadCounts,
  type NotificationCategory,
} from "@/lib/notifications";

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
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/psn", label: "Receiving", icon: ClipboardCheck, category: "psn" },
  { href: "/admin/vendors", label: "Vendors", icon: Building2, category: "vendor" },
  { href: "/admin/inventory", label: "Inventory", icon: Package },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList, category: "order" },
  { href: "/admin/returns", label: "Returns", icon: Undo2, category: "return" },
  { href: "/admin/shopper", label: "Shopper", icon: ShoppingBag, category: "shopper" },
  { href: "/admin/finance", label: "Finance", icon: CreditCard, category: "wallet" },
  {
    href: "/admin/notifications",
    label: "Notifications",
    icon: Bell,
    category: "__total__",
  },
  { href: "/admin/config/fees", label: "Pricing ()", icon: Tag },
  // Shopper has its own commission + freight + tax editor — separate
  // from the  fee schedule above. Dedicated entry so admins don't
  // have to drill through the generic Config table to find it.
  { href: "/admin/config/shopper", label: "Pricing (Shopper)", icon: ShoppingBag },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  { href: "/admin/config", label: "Config", icon: Settings },
];

export function AdminSidebar(): JSX.Element {
  const pathname = usePathname();
  // Unread counts power the per-tab badges. A query error hides every
  // badge silently — navigation still works, the badges are advisory.
  const countsQ = useUnreadCounts();
  const counts = countsQ.data;
  // Auto-ack: when the operator clicks a tab that has unread
  // notifications in its category, mark them read immediately. They're
  // about to be looking at the relevant page, so the unread state has
  // already served its purpose.
  const markCategoryRead = useMarkCategoryRead();

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
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-line bg-ink text-text-inv">
      <div className="border-b border-white/10 px-6 py-5">
        <Link href="/admin" className="block" aria-label="USA Errands · Admin home">
          <SiteLogo tone="inverse" markClassName="h-6 w-6" />
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[1.6px] text-amber">
            Admin console
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV.map((item) => {
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
              onClick={() => handleNavClick(item)}
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
  );
}
