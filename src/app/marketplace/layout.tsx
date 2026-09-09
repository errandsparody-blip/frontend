"use client";

import Link from "next/link";

import { MarketplaceCartProvider, useMarketplaceCart } from "./cart-context";

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketplaceCartProvider>
      <div className="min-h-screen bg-cream-soft text-ink">
        <MarketplaceHeader />
        <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-8 md:px-8">{children}</main>
      </div>
    </MarketplaceCartProvider>
  );
}

function MarketplaceHeader() {
  const { count } = useMarketplaceCart();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-cream-soft/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 md:px-8">
        <Link href="/marketplace" className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[1.8px] text-text-subtle">USA Errands</span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">Marketplace</span>
        </Link>
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
    </header>
  );
}
