"use client";

import { LogOut } from "lucide-react";

import { useAuth } from "@/lib/auth-context";

export function Topbar(): JSX.Element {
  const { user, logout } = useAuth();

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
    <header className="flex h-14 items-center justify-between border-b border-line bg-cream-soft px-6">
      <div className="font-mono text-mono-label uppercase text-text-muted">
        Inventory & Fulfillment Console
      </div>
      <div className="flex items-center gap-3">
        {user ? (
          <>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center bg-ink font-mono text-[10px] font-semibold uppercase text-text-inv">
                {initials}
              </div>
              <div className="text-body-sm">
                <div className="font-medium text-text">{user.email}</div>
                <div className="font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted">
                  {user.role.replace("_", " ")}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex h-9 items-center gap-2 rounded-sm border border-line-strong bg-white px-3 font-mono text-[11px] font-medium uppercase tracking-[1.2px] text-text hover:border-ink"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Sign out
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}
