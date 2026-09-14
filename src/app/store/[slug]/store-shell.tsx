"use client";

/**
 * Storefront shell (Migration 0059) — resolves the store, provides store +
 * cart context, and renders the sleek shared chrome (header with cart, footer).
 * Minimalist by design: lots of cream space, one accent colour per store, a
 * quiet monospace eyebrow, and restrained motion.
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

import { storefrontApi, type Storefront } from "@/lib/storefront-api";

// One cart for the whole marketplace — a vendor storefront shares the SAME cart
// as /marketplace (no separate per-store cart), so items added on a store show up
// in the marketplace cart and check out through the single marketplace checkout.
import { MarketplaceCartProvider, useMarketplaceCart } from "../../marketplace/cart-context";

const StoreContext = createContext<Storefront | null>(null);
export function useStore(): Storefront {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StorefrontShell");
  return ctx;
}

export function StorefrontShell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [store, setStore] = useState<Storefront | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");

  useEffect(() => {
    let alive = true;
    storefrontApi
      .getStore(slug)
      .then((s) => alive && (setStore(s), setState("ok")))
      .catch(() => alive && setState("notfound"));
    return () => {
      alive = false;
    };
  }, [slug]);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream-soft">
        <div className="font-mono text-mono-label uppercase tracking-[1.6px] text-text-subtle">
          Loading store…
        </div>
      </div>
    );
  }

  if (state === "notfound" || !store) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-cream-soft px-6 text-center">
        <div className="font-mono text-mono-label uppercase tracking-[1.6px] text-text-subtle">
          USA Errands
        </div>
        <h1 className="text-2xl font-semibold text-ink">This store isn&apos;t available</h1>
        <p className="max-w-sm text-body-sm text-text-muted">
          The link may be mistyped, or the store isn&apos;t open yet.
        </p>
      </div>
    );
  }

  const accent = store.accentColor || "#0A0A0A";

  return (
    <StoreContext.Provider value={store}>
      <MarketplaceCartProvider>
        <div
          className="min-h-screen bg-cream-soft text-ink"
          style={{ ["--store-accent" as string]: accent }}
        >
          <StoreHeader />
          <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-8 md:px-8">{children}</main>
          <footer className="border-t border-line px-5 py-8 md:px-8">
            <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-1">
              <div className="font-mono text-[10px] uppercase tracking-[1.6px] text-text-subtle">
                Powered by USA Errands
              </div>
              <div className="text-[12px] text-text-subtle">
                Secure checkout · Tracking by email
              </div>
            </div>
          </footer>
        </div>
      </MarketplaceCartProvider>
    </StoreContext.Provider>
  );
}

function StoreHeader() {
  const store = useStore();
  const { count } = useMarketplaceCart();
  const base = `/store/${store.slug}`;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-cream-soft/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 md:px-8">
        <Link href={base} className="flex items-center gap-3">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold text-white"
              style={{ background: "var(--store-accent)" }}
            >
              {store.displayName.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            {store.displayName}
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`${base}/account`}
            className="hidden rounded-full border border-line-strong bg-white px-4 py-2 text-[12px] font-medium text-ink transition-colors hover:border-ink sm:block"
          >
            Account
          </Link>
          <Link
            href={`${base}/cart`}
            className="group relative flex items-center gap-2 rounded-full border border-line-strong bg-white px-4 py-2 text-[12px] font-medium text-ink transition-colors hover:border-ink"
          >
            Cart
            <span
              className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold text-white"
              style={{ background: "var(--store-accent)" }}
            >
              {count}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
