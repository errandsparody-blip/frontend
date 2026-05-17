"use client";

/**
 * SidebarContext — shared open/close state for the portal + admin sidebars.
 *
 * Both layouts mount the sidebar (left rail) and the topbar (hamburger
 * trigger) as sibling components, so the only sensible way to share
 * drawer state is a lift-up via context. The provider lives at the
 * layout level so the state is co-extensive with the shell.
 *
 * Behaviour:
 *  - `open` defaults to `false` — the drawer is closed on first render
 *    on every viewport size. On desktop (md+) the sidebar uses static
 *    positioning and ignores the `open` state entirely, so this default
 *    is mobile-only in practice.
 *  - On every route change the drawer closes automatically. This keeps
 *    the next page paintable instead of dimming the user's first view
 *    of the destination.
 *  - On viewport resize across the md breakpoint the drawer closes so
 *    the off-canvas state never persists into the desktop layout
 *    (which would otherwise leave the static sidebar visible and the
 *    backdrop overlay covering content with no way to dismiss it).
 *  - Escape closes the drawer; body scroll is locked while open.
 *
 * The consumer hook throws if used outside a provider — that's the
 * intentional fail-loud signal that a sidebar/topbar was rendered
 * outside the portal/admin shell.
 */

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface SidebarContextValue {
  open: boolean;
  setOpen: (value: boolean) => void;
  toggle: () => void;
  close: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

// The breakpoint at which the sidebar becomes static. Mirror with the
// `md:` Tailwind utilities in the sidebar/topbar components.
const DESKTOP_BREAKPOINT_PX = 768;

export function SidebarProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Close on every route change so the destination page paints cleanly.
  // `pathname` is the cheapest dependency that flips on real navigation —
  // searchParams changes wouldn't normally warrant a drawer close, but
  // a route-tree navigation always should.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Body scroll lock + Escape-to-close — only attached while open so we
  // never leak listeners or freeze scroll on every render.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Auto-close on resize past the desktop breakpoint. Without this, a
  // user who opens the drawer on a phone then rotates to landscape (or
  // resizes their window) would end up with the static desktop sidebar
  // visible AND the mobile backdrop still active.
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`);
    const onChange = (e: MediaQueryListEvent): void => {
      if (e.matches) setOpen(false);
    };
    // Older Safari uses addListener; modern browsers use addEventListener.
    if (mql.addEventListener) {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  const value = useMemo<SidebarContextValue>(
    () => ({ open, setOpen, toggle, close }),
    [open, toggle, close],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    // Fail loud — this is the signal that a portal/admin component was
    // rendered outside its shell, which would silently lose drawer
    // behaviour otherwise.
    throw new Error("useSidebar must be used inside <SidebarProvider>.");
  }
  return ctx;
}
