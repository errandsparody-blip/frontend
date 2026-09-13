"use client";

/**
 * Multi-vendor marketplace feed (Phase 2). Editorial landing: full-bleed hero,
 * shop-by-store strip, underline category tabs, and a clean product grid. Mixes
 * products from every featured store; items add to the global cross-vendor cart.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  formatUsd,
  marketplaceApi,
  type FeaturedStore,
  type MarketplaceProduct,
} from "@/lib/storefront-api";

import { useMarketplaceCart } from "./cart-context";

export default function MarketplacePage() {
  const [categories, setCategories] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [stores, setStores] = useState<FeaturedStore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    marketplaceApi.categories().then(setCategories).catch(() => undefined);
    marketplaceApi.stores().then(setStores).catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    marketplaceApi
      .products(active ?? undefined)
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [active]);

  return (
    <div>
      {/* Full-bleed editorial hero (cancels the main padding). */}
      <section className="ue-rise-in -mx-5 mb-12 md:-mx-8 md:mb-16">
        <div className="relative flex h-[52vh] min-h-[340px] items-center justify-center overflow-hidden bg-ink">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-black/50" />
          <div className="relative px-6 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[3px] text-cream-soft/70">
              The USA Errands Marketplace
            </div>
            <h1 className="mt-3 text-4xl font-semibold uppercase leading-[0.95] tracking-tight text-cream-soft md:text-6xl">
              Every store,
              <br />
              one checkout
            </h1>
            <p className="mx-auto mt-4 max-w-md text-body-sm text-cream-soft/80">
              Independent vendors, shipped from the US — one delivery to your door.
            </p>
          </div>
        </div>
      </section>

      {/* Shop by store. */}
      {stores.length > 0 ? (
        <section className="mb-10">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[1.6px] text-text-subtle">
            Shop by store
          </div>
          <div className="flex flex-wrap gap-2">
            {stores.map((s) => (
              <Link
                key={s.slug}
                href={`/store/${s.slug}`}
                className="flex items-center gap-2 rounded-full border border-line-strong bg-white px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-ink"
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ background: s.accentColor || "#0A0A0A" }}
                >
                  {s.displayName.charAt(0).toUpperCase()}
                </span>
                {s.displayName}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Category tabs — editorial underline style. */}
      {categories.length > 0 ? (
        <nav className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line pb-3">
          <Tab active={active === null} onClick={() => setActive(null)}>All</Tab>
          {categories.map((c) => (
            <Tab key={c} active={active === c} onClick={() => setActive(c)}>{c}</Tab>
          ))}
        </nav>
      ) : null}

      {/* Section heading. */}
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="text-3xl font-semibold uppercase leading-none tracking-tight text-ink md:text-4xl">
          {active ?? "All products"}
        </h2>
        {!loading && products.length > 0 ? (
          <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[1.6px] text-text-subtle">
            {products.length} {products.length === 1 ? "item" : "items"}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="py-20 text-center font-mono text-mono-label text-text-subtle">Loading…</div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-line bg-white px-6 py-16 text-center text-body-sm text-text-muted">
          No products in the marketplace yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p, i) => (
            <FeedCard key={`${p.vendorSlug}-${p.id}`} product={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedCard({ product: p, index }: { product: MarketplaceProduct; index: number }) {
  const { add } = useMarketplaceCart();
  const [added, setAdded] = useState(false);
  const href = `/store/${p.vendorSlug}/products/${p.id}`;
  return (
    <div className="ue-rise-in group" style={{ animationDelay: `${Math.min(index * 45, 400)}ms` }}>
      <Link href={href} className="relative block aspect-[3/4] overflow-hidden bg-cream-deep">
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.imageUrl}
            alt={p.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-subtle">
            <span className="font-mono text-[11px] uppercase tracking-[1.4px]">No image</span>
          </div>
        )}
        {p.variantGroupId ? (
          // Variant listing — pick size/colour on the product page.
          <span className="absolute inset-x-3 bottom-3 translate-y-2 rounded-full bg-ink px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-[1.4px] text-cream-soft opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            Choose options
          </span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              add(
                {
                  productId: p.id,
                  vendorSlug: p.vendorSlug,
                  storeName: p.storeName,
                  name: p.name,
                  unitRetailCents: p.retailPriceCents,
                  imageUrl: p.imageUrl,
                  available: p.available,
                },
                1,
              );
              setAdded(true);
              setTimeout(() => setAdded(false), 1200);
            }}
            className="absolute inset-x-3 bottom-3 translate-y-2 rounded-full bg-ink px-4 py-2 text-[11px] font-semibold uppercase tracking-[1.4px] text-cream-soft opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
          >
            {added ? "Added ✓" : "Add to cart"}
          </button>
        )}
      </Link>
      <div className="mt-3">
        <div className="font-mono text-[10px] uppercase tracking-[1.4px] text-text-subtle">{p.storeName}</div>
        <Link href={href} className="mt-1 block text-[12px] font-semibold uppercase tracking-[0.6px] text-ink hover:underline">
          {p.name}
        </Link>
        <div className="mt-1 text-[13px] text-text-muted">
          {p.priceVaries ? `from ${formatUsd(p.retailPriceCents)}` : formatUsd(p.retailPriceCents)}
        </div>
      </div>
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "border-b-2 border-ink pb-2 text-[12px] font-semibold uppercase tracking-[1.2px] text-ink"
          : "border-b-2 border-transparent pb-2 text-[12px] font-medium uppercase tracking-[1.2px] text-text-muted transition-colors hover:text-ink"
      }
    >
      {children}
    </button>
  );
}
