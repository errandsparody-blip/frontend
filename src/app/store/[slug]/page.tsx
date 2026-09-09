"use client";

/**
 * Storefront catalog (Migration 0059) — the page buyers land on. Sleek and
 * minimal: a quiet hero, category filter chips, and a responsive grid of
 * product cards that rise in with a subtle stagger.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { formatUsd, storefrontApi, type StoreProduct } from "@/lib/storefront-api";

import { useCart } from "./cart-context";
import { useStore } from "./store-shell";

export default function StorefrontCatalogPage() {
  const store = useStore();
  const [categories, setCategories] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storefrontApi.getCategories(store.slug).then(setCategories).catch(() => undefined);
  }, [store.slug]);

  useEffect(() => {
    setLoading(true);
    storefrontApi
      .getProducts(store.slug, active ?? undefined)
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [store.slug, active]);

  return (
    <div>
      {/* Hero */}
      <section className="ue-rise-in mb-10 overflow-hidden rounded-2xl border border-line bg-white">
        {store.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.bannerUrl} alt="" className="h-44 w-full object-cover md:h-56" />
        ) : (
          <div
            className="h-28 w-full md:h-36"
            style={{
              background:
                "linear-gradient(120deg, var(--store-accent) 0%, rgba(0,0,0,0.75) 100%)",
            }}
          />
        )}
        <div className="px-6 py-6 md:px-8">
          <div className="font-mono text-[10px] uppercase tracking-[1.8px] text-text-subtle">
            Storefront
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink md:text-3xl">
            {store.displayName}
          </h1>
          {store.about ? (
            <p className="mt-2 max-w-2xl text-body-sm leading-relaxed text-text-muted">
              {store.about}
            </p>
          ) : null}
        </div>
      </section>

      {/* Category filter */}
      {categories.length > 0 ? (
        <div className="mb-8 flex flex-wrap gap-2">
          <Chip active={active === null} onClick={() => setActive(null)}>
            All
          </Chip>
          {categories.map((c) => (
            <Chip key={c} active={active === c} onClick={() => setActive(c)}>
              {c}
            </Chip>
          ))}
        </div>
      ) : null}

      {/* Grid */}
      {loading ? (
        <GridSkeleton />
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-line bg-white px-6 py-16 text-center">
          <p className="text-body-sm text-text-muted">No products here yet — check back soon.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      )}
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
          ? "rounded-full px-4 py-1.5 text-[12px] font-medium text-white transition-colors"
          : "rounded-full border border-line-strong bg-white px-4 py-1.5 text-[12px] font-medium text-text-muted transition-colors hover:border-ink hover:text-ink"
      }
      style={active ? { background: "var(--store-accent)" } : undefined}
    >
      {children}
    </button>
  );
}

function ProductCard({ product, index }: { product: StoreProduct; index: number }) {
  const store = useStore();
  const { add } = useCart();
  const [added, setAdded] = useState(false);

  return (
    <div
      className="ue-rise-in group flex flex-col overflow-hidden rounded-xl border border-line bg-white transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_12px_30px_-18px_rgba(0,0,0,0.35)]"
      style={{ animationDelay: `${Math.min(index * 55, 400)}ms` }}
    >
      <Link href={`/store/${store.slug}/products/${product.id}`} className="block">
        <div className="aspect-square w-full overflow-hidden bg-cream-deep">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-subtle">
              <span className="font-mono text-[11px] uppercase tracking-[1.4px]">No image</span>
            </div>
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        {product.category ? (
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[1.4px] text-text-subtle">
            {product.category}
          </div>
        ) : null}
        <Link
          href={`/store/${store.slug}/products/${product.id}`}
          className="line-clamp-2 text-[14px] font-medium leading-snug text-ink hover:underline"
        >
          {product.name}
        </Link>
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="text-[15px] font-semibold text-ink">
            {formatUsd(product.retailPriceCents)}
          </span>
          <button
            type="button"
            onClick={() => {
              add(
                {
                  productId: product.id,
                  name: product.name,
                  unitRetailCents: product.retailPriceCents,
                  imageUrl: product.imageUrl,
                  available: product.available,
                },
                1,
              );
              setAdded(true);
              setTimeout(() => setAdded(false), 1200);
            }}
            className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-white transition-transform active:scale-95"
            style={{ background: "var(--store-accent)" }}
          >
            {added ? "Added ✓" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="aspect-square w-full animate-pulse bg-cream-deep" />
          <div className="space-y-2 p-4">
            <div className="h-3 w-2/3 animate-pulse rounded bg-cream-deep" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-cream-deep" />
          </div>
        </div>
      ))}
    </div>
  );
}
