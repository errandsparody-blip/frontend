"use client";

import { Search, ShoppingBag, User, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";

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

// href null → not a link; rendered as a button (e.g. Return Policy opens a modal).
const FOOTER_LINKS: ReadonlyArray<{ href: string | null; label: string }> = [
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/security", label: "Security" },
  { href: "/about", label: "About Us" },
  { href: null, label: "Return Policy" },
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
  const [showPolicy, setShowPolicy] = useState(false);
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
            <p className="mt-3 max-w-md text-[14px] leading-relaxed text-cream-soft">
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
            {FOOTER_LINKS.map((l) =>
              l.href ? (
                <Link
                  key={l.label}
                  href={l.href}
                  className="text-[13px] text-cream-soft transition-colors hover:underline"
                >
                  {l.label}
                </Link>
              ) : (
                <button
                  key={l.label}
                  type="button"
                  onClick={() => setShowPolicy(true)}
                  className="text-[13px] text-cream-soft transition-colors hover:underline"
                >
                  {l.label}
                </button>
              ),
            )}
          </nav>
        </div>
        <div className="mt-8 text-[12px] text-cream-soft">© 2026 USA Errands</div>
      </div>

      <ReturnPolicyModal open={showPolicy} onClose={() => setShowPolicy(false)} />
    </footer>
  );
}

/** Return Policy pop-up — opened from the footer "Return Policy" link. */
function ReturnPolicyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Lock body scroll + Escape to close while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 text-ink sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[2.4px] text-ink">Policies</div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">Return Policy</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink hover:bg-ink/5"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4 text-[14px] leading-relaxed text-ink">
            <p>
              Eligible items may be returned within the window set by that store&apos;s own return
              policy, for a refund to your original payment method — less the original shipping,
              handling fees and the platform processing fee. We offer returns only, not exchanges, and
              shipping fees on an order that has already shipped are not refundable. Final sale items,
              gift cards, and damaged or altered items aren&apos;t eligible for return.
            </p>
            <p>
              Items must be returned in their original condition — unworn, unwashed, and unaltered,
              with all tags attached. Shoes must be returned in their original box; please don&apos;t
              attach the return label directly to the shoe box — use a separate outer package instead.
            </p>
            <p>
              We don&apos;t provide prepaid return labels. You&apos;re responsible for arranging your
              own return shipping, and for its tracking and accuracy — we recommend asking your carrier
              about insurance and keeping your shipping records, as neither USA Errands nor the store is
              responsible for independently mailed packages and cannot reimburse shipping costs.
            </p>
            <p>
              If your order has items from multiple stores, each is returned separately under that
              store&apos;s own policy. Hit the <strong>Start a Return</strong> button to get started.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-cream-soft px-6 py-4">
          <span className="text-[12px] text-ink">
            Last updated: September 2026 · Questions?{" "}
            <a href="mailto:hello@myusaerrands.com" className="underline">hello@myusaerrands.com</a>
          </span>
          <Link
            href="/marketplace/returns"
            onClick={onClose}
            className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-cream-soft transition-transform hover:-translate-y-0.5"
          >
            Start a Return
          </Link>
        </div>
      </div>
    </div>,
    document.body,
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
          <span className="hidden font-mono text-[12px] uppercase tracking-[1.5px] text-ink sm:inline">
            Marketplace
          </span>
        </Link>

        {/* Search — products or vendors. */}
        <form onSubmit={submit} className="relative min-w-0 flex-1" role="search">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink"
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
