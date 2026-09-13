"use client";

import Link from "next/link";

import { MarketplaceCartProvider, useMarketplaceCart } from "./cart-context";

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketplaceCartProvider>
      <div className="min-h-screen bg-cream-soft text-ink">
        <AnnouncementBar />
        <MarketplaceHeader />
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
        USA &amp; international orders: duties and taxes may apply upon delivery.
      </span>
    </div>
  );
}

function MarketplaceHeader() {
  const { count } = useMarketplaceCart();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-cream-soft/85 backdrop-blur-md">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-5 py-4 md:px-8">
        {/* Left — country / region (display for now; single US/USD region). */}
        <div className="hidden items-center md:flex">
          <span className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-white px-3 py-1.5 font-mono text-[10px] uppercase tracking-[1.4px] text-text-muted">
            United States | USD $
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>

        {/* Center — wordmark. */}
        <Link href="/marketplace" className="flex flex-col items-center justify-center leading-none">
          <span className="text-[17px] font-semibold uppercase tracking-[3px] text-ink">USA Errands</span>
          <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[3.4px] text-text-subtle">Marketplace</span>
        </Link>

        {/* Right — cart. */}
        <div className="flex items-center justify-end">
          <Link
            href="/marketplace/cart"
            className="relative flex items-center gap-2 rounded-full border border-line-strong bg-white px-4 py-2 text-[12px] font-medium text-ink transition-colors hover:border-ink"
          >
            Cart
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[11px] font-semibold text-cream-soft">
              {count}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
