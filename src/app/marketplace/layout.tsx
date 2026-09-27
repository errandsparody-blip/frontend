"use client";

import { Search, ShoppingBag, User } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { MarketplaceCartProvider, useMarketplaceCart } from "./cart-context";

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketplaceCartProvider>
      <div className="min-h-screen bg-cream-soft text-ink">
        <AnnouncementBar />
        <Suspense fallback={<div className="h-[72px] border-b border-line bg-cream-soft" />}>
          <MarketplaceHeader />
        </Suspense>
        <main className="mx-auto w-full max-w-6xl px-5 pb-12 md:px-8">{children}</main>
        <MarketplaceFooter />
      </div>
    </MarketplaceCartProvider>
  );
}

const FOOTER_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/security", label: "Security" },
  { href: "/about", label: "About Us" },
  { href: "/marketplace/returns", label: "Return Policy" },
  { href: "/signup", label: "Sell With Us" },
  { href: "/marketplace/returns", label: "Start a Return" },
  { href: "/contact", label: "Contact" },
  { href: "/track", label: "Track Your Order" },
];

/**
 * Marketplace footer (from the approved concept): a "new drop" newsletter band
 * + the site footer links. Black-and-white to match the marketplace palette.
 *
 * NOTE: the newsletter sign-up is currently client-side only — it acknowledges
 * the address but does not yet persist it. Wire it to an email-capture endpoint
 * (Resend audience or a DB table) to actually collect subscribers.
 */
function MarketplaceFooter() {
  const [email, setEmail] = useState("");
  const [signedUp, setSignedUp] = useState(false);
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const onSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid) return;
    setSignedUp(true);
  };

  return (
    <footer className="mt-8 bg-ink text-cream-soft">
      {/* Newsletter band. */}
      <div className="border-b border-white/10">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-14 md:grid-cols-2 md:items-center md:px-8">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-cream-soft md:text-3xl">
              Never miss a new drop
            </h2>
            <p className="mt-3 max-w-md text-[14px] leading-relaxed text-cream-soft/70">
              Be the first to know when a new store joins, fresh arrivals land, or a deal&apos;s too
              good to sit on. No spam — just the good stuff, straight to your inbox.
            </p>
          </div>
          {signedUp ? (
            <p className="text-[14px] font-medium text-cream-soft md:justify-self-end">
              You&apos;re on the list — thanks!
            </p>
          ) : (
            <form onSubmit={onSignup} className="flex w-full max-w-md gap-2 md:justify-self-end">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                className="h-11 min-w-0 flex-1 rounded-full border border-white/20 bg-transparent px-4 text-[14px] text-cream-soft outline-none transition-colors placeholder:text-cream-soft/40 focus:border-cream-soft"
              />
              <button
                type="submit"
                className="shrink-0 rounded-full bg-cream-soft px-6 py-2.5 text-[13px] font-semibold text-ink transition-transform hover:-translate-y-0.5"
              >
                Sign up
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Links + copyright. */}
      <div className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <Link href="/marketplace" className="text-[17px] font-semibold tracking-tight text-cream-soft">
            USA Errands
          </Link>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {FOOTER_LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="text-[13px] text-cream-soft/70 transition-colors hover:text-cream-soft"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-8 text-[12px] text-cream-soft/50">© 2026 USA Errands</div>
      </div>
    </footer>
  );
}

/** Full-bleed notice bar, editorial style (scrolls away above the sticky header). */
function AnnouncementBar() {
  return (
    <div className="bg-ink px-4 py-2.5 text-center">
      <span className="font-mono text-[10px] uppercase tracking-[1.6px] text-cream-soft md:text-[11px]">
        Orders shipping to Canada may attract duties and taxes upon delivery.
      </span>
    </div>
  );
}

const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/marketplace#products", label: "Shop all" },
  { href: "/marketplace#categories", label: "Categories" },
  { href: "/marketplace#vendors", label: "Vendors" },
  { href: "/signup", label: "Sell with us" },
];

function MarketplaceHeader() {
  const { count } = useMarketplaceCart();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState("");

  // Keep the field in sync with the URL (so a shared /marketplace?q= link fills it).
  useEffect(() => {
    setQ(searchParams.get("q") ?? "");
  }, [searchParams]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    router.push(query ? `/marketplace?q=${encodeURIComponent(query)}#products` : "/marketplace");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-cream-soft/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5 py-3.5 md:gap-5 md:px-8">
        {/* Wordmark. */}
        <Link href="/marketplace" className="flex shrink-0 items-baseline gap-1.5 leading-none">
          <span className="text-[17px] font-semibold tracking-tight text-ink">USA Errands</span>
          <span className="hidden font-mono text-[12px] uppercase tracking-[1.5px] text-text-muted sm:inline">
            Marketplace
          </span>
        </Link>

        {/* Search — products or vendors. */}
        <form onSubmit={submit} className="relative min-w-0 flex-1" role="search">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle"
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products or vendors"
            aria-label="Search products or vendors"
            className="h-11 w-full rounded-full border border-line-strong bg-white pl-10 pr-4 text-body-sm text-ink outline-none transition-colors placeholder:text-text-subtle focus:border-ink"
          />
        </form>

        {/* Nav — hidden on small screens (search stays; links live in the page). */}
        <nav className="hidden items-center gap-6 lg:flex">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-[13px] font-medium text-ink hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Account + cart. */}
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href="/account"
            aria-label="Your account"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-ink/5"
          >
            <User className="h-5 w-5" aria-hidden />
          </Link>
          <Link
            href="/marketplace/cart"
            aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-ink/5"
          >
            <ShoppingBag className="h-5 w-5" aria-hidden />
            {count > 0 ? (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold text-cream-soft">
                {count}
              </span>
            ) : null}
          </Link>
        </div>
      </div>
    </header>
  );
}
