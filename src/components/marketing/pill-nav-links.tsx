"use client";

/**
 * PillNavLinks — the centered link cluster inside the floating pill
 * header (Cillo-inspired). The active route gets a solid pill; the rest
 * are quiet until hover. Split into its own client component so the
 * marketing layout can stay a server component — only this small piece
 * needs `usePathname` to know which link is active.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { JSX } from "react";

const LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

export function PillNavLinks(): JSX.Element {
  const pathname = usePathname();

  return (
    <div className="hidden items-center gap-1 md:flex">
      {LINKS.map((l, i) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            // Staggered rise-in after the bar drops, plus a slick hover lift.
            style={{ animationDelay: `${180 + i * 70}ms` }}
            className={
              "ue-rise-in rounded-full px-4 py-2 text-body-sm transition-all duration-300 ease-out hover:-translate-y-0.5 " +
              (active
                ? "bg-white font-medium text-ink shadow-1"
                : "text-text-2 hover:text-ink")
            }
          >
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}
