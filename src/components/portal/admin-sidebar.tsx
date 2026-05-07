"use client";

import {
  Building2,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Package,
  ScrollText,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/psn", label: "Receiving", icon: ClipboardCheck },
  { href: "/admin/vendors", label: "Vendors", icon: Building2 },
  { href: "/admin/inventory", label: "Inventory", icon: Package, disabled: true },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList },
  { href: "/admin/finance", label: "Finance", icon: CreditCard },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  { href: "/admin/config", label: "Config", icon: Settings },
];

export function AdminSidebar(): JSX.Element {
  const pathname = usePathname();
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-line bg-ink text-text-inv">
      <div className="border-b border-white/10 px-6 py-5">
        <Link href="/admin" className="block">
          <div className="text-[16px] font-bold tracking-[0.5px] text-text-inv">USA ERRANDS</div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[1.6px] text-amber">
            Admin console
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(item.href);
          const disabledClass = item.disabled
            ? "pointer-events-none text-white/30"
            : "text-white/70 hover:bg-white/5 hover:text-text-inv";
          const activeClass = active && !item.disabled ? "bg-amber text-ink hover:bg-amber" : "";
          return (
            <Link
              key={item.href}
              href={item.disabled ? "#" : item.href}
              aria-disabled={item.disabled}
              tabIndex={item.disabled ? -1 : 0}
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
