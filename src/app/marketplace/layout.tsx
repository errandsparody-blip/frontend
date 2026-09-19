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
        <main className="mx-auto w-full max-w-6xl px-5 pb-24 md:px-8">{children}</main>
      </div>
    </MarketplaceCartProvider>
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
          <span className="hidden font-mono text-[10px] uppercase tracking-[2px] text-amber sm:inline">
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
            <Link key={l.href} href={l.href} className="text-[13px] font-medium text-ink hover:text-amber">
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
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber px-1 text-[10px] font-semibold text-ink">
                {count}
              </span>
            ) : null}
          </Link>
        </div>
      </div>
    </header>
  );
}
