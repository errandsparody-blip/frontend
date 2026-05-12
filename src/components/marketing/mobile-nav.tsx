"use client";

/**
 * MobileNav — hamburger + slide-down drawer for the marketing header.
 *
 * Visible only below the `md` breakpoint (the desktop nav handles ≥ md).
 * Exposes every link the desktop nav has (How it works, Pricing, Shop
 * for me, Integrations, Security) plus Log in, so vendors and buyers
 * on phones can actually reach those pages.
 *
 * Behaviour:
 *   - Clicking the hamburger toggles the drawer.
 *   - Clicking any link inside closes it (so the next page paints
 *     without the drawer covering it).
 *   - Pressing Escape closes it.
 *   - Clicking the dim backdrop closes it.
 *   - While open, body scroll is locked so the drawer doesn't scroll
 *     past content underneath.
 *   - The hamburger is `aria-expanded` + `aria-controls` linked to the
 *     drawer, and the drawer is `role="dialog" aria-modal="true"` for
 *     screen-reader correctness.
 *
 * Pure CSS / Tailwind, no third-party drawer lib — keeps the marketing
 * bundle small.
 */

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { homeForRole, useAuth } from "@/lib/auth-context";

// Same surface area as the desktop nav, flattened so phone users get
// a single scroll list instead of a nested dropdown. Order mirrors the
// desktop bar: About → Services → How it works → Pricing → Contact →
// Shop for me (CTA). Integrations + Security have moved off the top
// nav and live under About; they appear at the bottom of the drawer
// so they're still reachable.
const NAV_LINKS: ReadonlyArray<{ href: string; label: string; accent?: boolean }> = [
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
  // Personal Shopper gets the amber accent treatment to match the
  // desktop pill, since it's a distinct consumer-direct product.
  { href: "/shopper", label: "Shop for me", accent: true },
  { href: "/integrations", label: "Integrations" },
  { href: "/security", label: "Security" },
];

export function MobileNav(): JSX.Element {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const drawerId = useId();
  const { user } = useAuth();
  // Pre-compute the portal href so the drawer can show "Open portal"
  // (admin or vendor) instead of "Log in" once the user is signed in.
  const portalHref = user ? homeForRole(user) : null;
  const portalLabel = portalHref === "/admin" ? "Open admin" : "Open dashboard";

  // Close the drawer whenever the route changes — covers both clicks
  // on a link inside (instant) and back/forward nav (in case the user
  // taps a system back button while the drawer is open).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape-to-close + body-scroll lock while open. Both effects only
  // attach when actually open so we don't leak listeners or freeze
  // scroll on every render.
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

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls={drawerId}
        onClick={() => setOpen((v) => !v)}
        className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-sm text-ink hover:bg-ink/5 md:hidden"
      >
        {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
      </button>

      {/* Backdrop + drawer · only mounted while open so the rest of
          the page stays interactive when closed. */}
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-[72px] z-40 bg-ink/35 md:hidden"
          />
          <div
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label="Site navigation"
            className="fixed inset-x-0 top-[72px] z-50 border-b border-line bg-cream-soft px-6 py-6 shadow-2 md:hidden"
          >
            <ul className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => {
                const active = pathname?.startsWith(link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={[
                        "flex items-center justify-between rounded-sm px-3 py-3 font-mono text-[13px] uppercase tracking-[1.2px] transition-colors",
                        link.accent
                          ? "border border-amber/40 bg-amber/10 text-amber hover:bg-amber/20"
                          : active
                            ? "bg-ink/5 text-ink"
                            : "text-text hover:bg-ink/5 hover:text-ink",
                      ].join(" ")}
                    >
                      <span>{link.label}</span>
                      <span aria-hidden className="font-mono text-text-subtle">→</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {/* Account-area block — switches based on auth state.
                Signed-out shows Log in, signed-in shows the portal
                shortcut so the drawer never invites a logged-in user
                back to a login page. */}
            <div className="mt-6 border-t border-line pt-6">
              {portalHref ? (
                <Link
                  href={portalHref}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-sm border border-amber/40 bg-amber/10 px-3 py-3 font-mono text-[13px] uppercase tracking-[1.2px] text-amber hover:bg-amber/20"
                >
                  <span>{portalLabel}</span>
                  <span aria-hidden className="font-mono">→</span>
                </Link>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-sm px-3 py-3 font-mono text-[13px] uppercase tracking-[1.2px] text-text hover:bg-ink/5 hover:text-ink"
                >
                  <span>Log in</span>
                  <span aria-hidden className="font-mono text-text-subtle">→</span>
                </Link>
              )}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
