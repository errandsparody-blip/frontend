"use client";

import { LogOut, Menu } from "lucide-react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/lib/auth-context";

import { NotificationBell } from "./notification-bell";
import { useSidebar } from "./sidebar-context";

export function Topbar(): JSX.Element {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const { toggle, open } = useSidebar();
  // Admin pages live under /admin; everything else is the vendor portal.
  // The bell needs the right "See all" target so clicking through lands
  // on the matching notifications route for whichever console is active.
  const isAdmin = pathname?.startsWith("/admin") ?? false;
  const seeAllHref = isAdmin ? "/admin/notifications" : "/notifications";
  // Console subtitle. The vendor wording ("Inventory & Fulfillment")
  // doesn't make sense for admin operators staring at the receiving
  // queue, so we switch it. Kept short so the topbar still fits on
  // narrow phones once the hamburger + avatar take their slots.
  const consoleLabel = isAdmin ? "Admin console" : "Inventory & Fulfillment";

  const initials = user?.email
    ? user.email
        .split("@")[0]
        ?.split(/[._-]/)
        .map((s) => s[0]?.toUpperCase())
        .filter(Boolean)
        .slice(0, 2)
        .join("") ?? "U"
    : "U";

  return (
    <header className="flex h-14 items-center justify-between gap-2 border-b border-line bg-cream-soft px-3 sm:px-6">
      {/* Left cluster — hamburger (mobile only) + console subtitle.
          The hamburger toggles the sidebar context state and is hidden
          on md+ where the static sidebar is already visible. The label
          truncates on narrow phones so a long email/role on the right
          never gets crowded off the screen. */}
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={open ? "Close sidebar" : "Open sidebar"}
          aria-expanded={open}
          aria-controls="portal-sidebar"
          className="-ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm text-text hover:bg-ink/5 md:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <div className="truncate font-mono text-mono-label uppercase text-text-muted">
          {consoleLabel}
        </div>
      </div>

      {/* Right cluster — bell, identity, sign out. Identity collapses
          to just the avatar on phones (the email + role lines re-appear
          at sm+). Sign-out collapses to icon-only on phones; the label
          rejoins at sm+. Order is bell → identity → sign-out so the
          interactive controls sit closest to the thumb on phones. */}
      <div className="flex items-center gap-2 sm:gap-3">
        {user ? (
          <>
            <NotificationBell seeAllHref={seeAllHref} />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-ink font-mono text-[10px] font-semibold uppercase text-text-inv">
                {initials}
              </div>
              <div className="hidden text-body-sm sm:block">
                <div className="max-w-[14rem] truncate font-medium text-text">{user.email}</div>
                <div className="font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted">
                  {user.role.replace("_", " ")}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              aria-label="Sign out"
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-sm border border-line-strong bg-white px-2 sm:px-3 font-mono text-[11px] font-medium uppercase tracking-[1.2px] text-text hover:border-ink"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}
