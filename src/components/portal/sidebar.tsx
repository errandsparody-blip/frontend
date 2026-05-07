"use client";

import {
  Boxes,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Package,
  Settings,
  Truck,
  Undo2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Disabled until the relevant phase ships. */
  disabled?: boolean;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/psn", label: "Pre-Shipment Notices", icon: ClipboardList },
  { href: "/wallet", label: "Wallet", icon: CreditCard },
  { href: "/orders", label: "Orders", icon: Truck },
  { href: "/returns", label: "Returns", icon: Undo2 },
  { href: "/team", label: "Team", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar(): JSX.Element {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-line bg-cream-soft">
      <div className="border-b border-line px-6 py-5">
        <Link href="/dashboard" className="block">
          <div className="text-[16px] font-bold tracking-[0.5px] text-ink">USA ERRANDS</div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[1.6px] text-amber">
            Vendor portal
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/dashboard" ? pathname === "/dashboard" : pathname?.startsWith(item.href);
          const disabledClass = item.disabled
            ? "pointer-events-none text-text-subtle"
            : "text-text hover:bg-cream-deep";
          const activeClass = active && !item.disabled ? "bg-ink text-text-inv hover:bg-ink" : "";
          return (
            <Link
              key={item.href}
              href={item.disabled ? "#" : item.href}
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
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line px-6 py-4 font-mono text-[10px] uppercase tracking-[1.4px] text-text-subtle">
        v0.1 · P3
      </div>
    </aside>
  );
}
