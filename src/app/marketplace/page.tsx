"use client";

/**
 * Multi-vendor marketplace feed (Phase 2). Mixes products from every featured
 * store with category filtering + a shop-by-store strip. Products can be added
 * to the global cross-vendor cart or opened on their own store.
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
      <section className="ue-rise-in mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">
          Shop across every store
        </h1>
        <p className="mt-2 max-w-2xl text-body-sm text-text-muted">
          Familiar products from independent vendors, shipped from the US.
        </p>
      </section>

      {stores.length > 0 ? (
        <section className="mb-8">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[1.6px] text-text-subtle">
            Featured stores
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

      {categories.length > 0 ? (
        <div className="mb-8 flex flex-wrap gap-2">
          <Chip active={active === null} onClick={() => setActive(null)}>All</Chip>
          {categories.map((c) => (
            <Chip key={c} active={active === c} onClick={() => setActive(c)}>{c}</Chip>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="py-20 text-center font-mono text-mono-label text-text-subtle">Loading…</div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-line bg-white px-6 py-16 text-center text-body-sm text-text-muted">
          No products in the marketplace yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
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
  return (
    <div
      className="ue-rise-in group flex flex-col overflow-hidden rounded-xl border border-line bg-white transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_12px_30px_-18px_rgba(0,0,0,0.35)]"
      style={{ animationDelay: `${Math.min(index * 45, 400)}ms` }}
    >
      <Link href={`/store/${p.vendorSlug}/products/${p.id}`} className="block">
        <div className="aspect-square w-full overflow-hidden bg-cream-deep">
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-subtle">
              <span className="font-mono text-[11px] uppercase tracking-[1.4px]">No image</span>
            </div>
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[1.4px] text-text-subtle">{p.storeName}</div>
        <Link
          href={`/store/${p.vendorSlug}/products/${p.id}`}
          className="line-clamp-2 text-[14px] font-medium leading-snug text-ink hover:underline"
        >
          {p.name}
        </Link>
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="text-[15px] font-semibold text-ink">{formatUsd(p.retailPriceCents)}</span>
          <button
            type="button"
            onClick={() => {
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
            className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-cream-soft transition-transform active:scale-95"
          >
            {added ? "Added ✓" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({
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
          ? "rounded-full bg-ink px-4 py-1.5 text-[12px] font-medium text-cream-soft"
          : "rounded-full border border-line-strong bg-white px-4 py-1.5 text-[12px] font-medium text-text-muted transition-colors hover:border-ink hover:text-ink"
      }
    >
      {children}
    </button>
  );
}
