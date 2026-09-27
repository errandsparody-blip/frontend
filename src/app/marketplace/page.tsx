"use client";

/**
 * Multi-vendor marketplace landing (Phase 2, editorial redesign).
 *
 * Section flow (design direction mirrored from the approved concept, rendered
 * in our own design system — ink/cream tokens, mono eyebrows, legible copy):
 *   1. Hero          — headline + two CTAs, with a product collage.
 *   2. Categories    — large iconed tiles that filter the grid.
 *   3. Featured store— one vendor spotlight.
 *   4. Vendors       — "meet the sellers" grid.
 *   5. Products      — the filterable mixed feed (the workhorse grid).
 *   6. Returns       — three "know before you buy" explainer cards.
 *   7. FAQ           — the questions shoppers ask most.
 *
 * All product cards add to the global cross-vendor cart.
 */
import {
  Gift,
  Heart,
  Home,
  Shirt,
  ShoppingBag,
  Sparkles,
  Tag,
  Watch,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import {
  formatUsd,
  marketplaceApi,
  type FeaturedStore,
  type MarketplaceProduct,
} from "@/lib/storefront-api";

import { useMarketplaceCart } from "./cart-context";

// Icons cycled across category tiles so each gets a distinct, legible glyph.
const CATEGORY_ICONS: LucideIcon[] = [Shirt, Sparkles, Home, Watch, ShoppingBag, Heart, Tag, Gift];

export default function MarketplacePage() {
  return (
    <Suspense fallback={<div className="py-20 text-center font-mono text-mono-label text-ink">Loading…</div>}>
      <MarketplaceInner />
    </Suspense>
  );
}

function MarketplaceInner() {
  const searchParams = useSearchParams();
  const searchQuery = (searchParams.get("q") ?? "").trim();
  const [categories, setCategories] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [allProducts, setAllProducts] = useState<MarketplaceProduct[]>([]);
  const [stores, setStores] = useState<FeaturedStore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    marketplaceApi.categories().then(setCategories).catch(() => undefined);
    marketplaceApi.stores().then(setStores).catch(() => undefined);
    // Unfiltered snapshot powers the hero collage + per-vendor product counts.
    marketplaceApi.products().then(setAllProducts).catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    marketplaceApi
      .products(active ?? undefined)
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [active]);

  // Product count per vendor slug, from the unfiltered snapshot.
  const countByVendor = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of allProducts) m.set(p.vendorSlug, (m.get(p.vendorSlug) ?? 0) + 1);
    return m;
  }, [allProducts]);

  // Search runs client-side over the unfiltered snapshot: name, store, category
  // and tags. Empty query → normal browsing.
  const searching = searchQuery.length > 0;
  const searchResults = useMemo(() => {
    if (!searching) return [];
    const terms = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return allProducts.filter((p) => {
      const hay = [p.name, p.storeName, p.category ?? "", ...(p.tags ?? [])].join(" ").toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [searching, searchQuery, allProducts]);

  const collage = allProducts.filter((p) => p.imageUrl).slice(0, 4);
  const featured = stores[0] ?? null;

  const chooseCategory = (c: string | null) => {
    setActive(c);
    if (typeof document !== "undefined") {
      document.getElementById("products")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="ue-rise-in">
      {/* ---------------------------------------------------------------- Hero */}
      <section className="-mx-5 mb-16 border-b border-line bg-cream-soft px-5 py-12 md:-mx-8 md:px-8 md:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[2.4px] text-ink">
              The USA Errands Marketplace
            </div>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.02] tracking-tight text-ink md:text-6xl">
              Your favorite stores,
              <br />
              meeting you halfway.
            </h1>
            <p className="mt-5 max-w-md text-body text-ink">
              International brands you love — now just a doorstep away. Every store, one checkout,
              shipped locally from the US.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#products"
                className="rounded-full bg-ink px-6 py-3 text-[13px] font-semibold text-cream-soft transition-transform hover:-translate-y-0.5"
              >
                Shop all products
              </a>
              <a
                href="#vendors"
                className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-white px-6 py-3 text-[13px] font-semibold text-ink transition-colors hover:border-ink"
              >
                Shop by store <span aria-hidden>→</span>
              </a>
            </div>
          </div>

          {/* Product collage — real listings, staggered. Hidden on small screens. */}
          {collage.length >= 2 ? (
            <div className="relative hidden h-[420px] lg:block" aria-hidden>
              {collage.map((p, i) => {
                const pos = [
                  "left-0 top-6 rotate-[-5deg]",
                  "right-4 top-0 rotate-[4deg]",
                  "left-10 bottom-0 rotate-[3deg]",
                  "right-0 bottom-6 rotate-[-3deg]",
                ][i];
                return (
                  <div
                    key={`${p.vendorSlug}-${p.id}`}
                    className={`absolute w-52 overflow-hidden rounded-2xl border border-line bg-white shadow-2 ${pos}`}
                  >
                    <div className="relative aspect-square bg-cream-deep">
                      {p.imageUrl ? (
                        <Image src={p.imageUrl} alt="" fill sizes="208px" className="object-cover" />
                      ) : null}
                    </div>
                    <div className="p-3">
                      <div className="truncate font-mono text-[10px] uppercase tracking-[1.4px] text-ink">
                        {p.storeName}
                      </div>
                      <div className="truncate text-[12px] font-semibold text-ink">{p.name}</div>
                      <div className="mt-0.5 text-[12px] text-ink">
                        {formatUsd(p.retailPriceCents)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      {/* ---------------------------------------------------------- Categories */}
      {categories.length > 0 ? (
        <section id="categories" className="mb-16 scroll-mt-6">
          <SectionHead eyebrow="Browse" title="Shop by category" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {categories.slice(0, 8).map((c, i) => {
              const Icon = CATEGORY_ICONS[i % CATEGORY_ICONS.length]!;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => chooseCategory(c)}
                  className="group flex flex-col rounded-2xl border border-line bg-white p-5 text-left transition-transform hover:-translate-y-0.5 hover:shadow-1"
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-cream-soft text-ink">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="mt-4 flex items-center gap-1 text-[15px] font-semibold text-ink">
                    {c}
                    <span aria-hidden className="text-ink transition-transform group-hover:translate-x-0.5">→</span>
                  </span>
                  <span className="mt-1 text-[13px] text-ink">Shop {c.toLowerCase()}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------- Featured vendor */}
      {featured ? (
        <section className="mb-16 overflow-hidden rounded-2xl border border-line bg-white">
          <div className="grid gap-0 md:grid-cols-2">
            <div className="flex min-h-[240px] items-center justify-center bg-cream-deep">
              {featured.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={featured.logoUrl} alt={featured.displayName} className="max-h-32 max-w-[70%] object-contain" />
              ) : (
                <span className="text-5xl font-semibold text-ink/80">
                  {featured.displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="p-8">
              <div className="font-mono text-[11px] uppercase tracking-[2.4px] text-ink">Featured vendor</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                {featured.displayName}
              </h2>
              <p className="mt-3 max-w-md text-body-sm text-ink">
                {featured.displayName} stores its full collection with USA Errands, so every order
                ships locally from the US — no matter where it&apos;s headed.
              </p>
              <div className="mt-5 flex gap-8">
                <div>
                  <div className="text-xl font-semibold text-ink">{countByVendor.get(featured.slug) ?? 0}</div>
                  <div className="text-[11px] uppercase tracking-[1.2px] text-ink">products</div>
                </div>
                <div>
                  <div className="text-xl font-semibold text-ink">Local</div>
                  <div className="text-[11px] uppercase tracking-[1.2px] text-ink">US shipping</div>
                </div>
              </div>
              <Link
                href={`/store/${featured.slug}`}
                className="mt-6 inline-block rounded-full bg-ink px-6 py-3 text-[13px] font-semibold text-cream-soft transition-transform hover:-translate-y-0.5"
              >
                Visit the store
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------- Vendors */}
      {stores.length > 0 ? (
        <section id="vendors" className="mb-16">
          <SectionHead
            eyebrow="Meet the sellers"
            title="Stores on the marketplace"
            action={<Link href="#products" className="text-[13px] font-semibold text-ink hover:underline">See all stores →</Link>}
          />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {stores.map((s) => (
              <Link
                key={s.slug}
                href={`/store/${s.slug}`}
                className="group flex flex-col rounded-2xl border border-line bg-white p-5 transition-transform hover:-translate-y-0.5 hover:shadow-1"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-lg font-semibold text-cream-soft">
                  {s.displayName.charAt(0).toUpperCase()}
                </span>
                <span className="mt-4 truncate text-[15px] font-semibold text-ink">{s.displayName}</span>
                <span className="mt-1 text-[13px] text-ink">
                  {countByVendor.get(s.slug) ?? 0} {(countByVendor.get(s.slug) ?? 0) === 1 ? "product" : "products"}
                </span>
                <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink">
                  Visit store <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------- Products */}
      <section id="products" className="mb-16 scroll-mt-6">
        {searching ? (
          <>
            <SectionHead
              eyebrow="Search"
              title={`Results for “${searchQuery}”`}
              subtitle={`${searchResults.length} ${searchResults.length === 1 ? "match" : "matches"} across the marketplace.`}
              action={<Link href="/marketplace" className="text-[13px] font-semibold text-ink hover:underline">Clear search →</Link>}
            />
            {searchResults.length === 0 ? (
              <div className="rounded-2xl border border-line bg-white px-6 py-16 text-center text-body-sm text-ink">
                Nothing matched “{searchQuery}”. Try a different word, or{" "}
                <Link href="/marketplace" className="font-medium text-ink underline">browse everything</Link>.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
                {searchResults.map((p, i) => (
                  <FeedCard key={`${p.vendorSlug}-${p.id}`} product={p} index={i} />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <SectionHead
              eyebrow="Shop the marketplace"
              title="New and popular right now"
              subtitle="A mix of new arrivals and favorites from across every store on the marketplace."
            />

            {categories.length > 0 ? (
              <nav className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line pb-3">
                <Tab active={active === null} onClick={() => setActive(null)}>All</Tab>
                {categories.map((c) => (
                  <Tab key={c} active={active === c} onClick={() => setActive(c)}>{c}</Tab>
                ))}
              </nav>
            ) : null}

            {loading ? (
              <div className="py-20 text-center font-mono text-mono-label text-ink">Loading…</div>
            ) : products.length === 0 ? (
              <div className="rounded-2xl border border-line bg-white px-6 py-16 text-center text-body-sm text-ink">
                No products in the marketplace yet.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
                {products.map((p, i) => (
                  <FeedCard key={`${p.vendorSlug}-${p.id}`} product={p} index={i} />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* -------------------------------------------------------------- FAQ */}
      <section className="mb-8">
        <SectionHead eyebrow="Good to know" title="Marketplace FAQ" subtitle="The questions shoppers ask most." />
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {FAQS.map((f, i) => (
            <details key={f.q} className={`group ${i > 0 ? "border-t border-line" : ""}`}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-semibold text-ink">
                {f.q}
                <span aria-hidden className="text-ink transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="px-5 pb-5 text-[13px] leading-relaxed text-ink">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

const FAQS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Do items from different stores really ship together?",
    a: "Yes. Everything in your cart ships as one delivery from the US — one checkout, one package to your door, no matter how many stores it spans.",
  },
  {
    q: "Will I owe duties or taxes on delivery?",
    a: "Only if your order is shipping to Canada. U.S. orders don't attract duties or taxes. Canadian orders may, depending on order value — assessed on delivery and separate from what you pay at checkout.",
  },
  {
    q: "How fast is delivery once my order ships?",
    a: "Because every order ships locally from the US rather than internationally, delivery is typically just a few working days.",
  },
  {
    q: "What's your return policy?",
    a: "Return eligibility and the return window are set by each store, and refunds go to your original payment method, less shipping, handling, and processing fees.",
  },
  {
    q: "Is my payment secure?",
    a: "Yes. Checkout is encrypted end-to-end.",
  },
];

function SectionHead({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[2.4px] text-ink">{eyebrow}</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink md:text-3xl">{title}</h2>
        {subtitle ? <p className="mt-2 max-w-lg text-body-sm text-ink">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0 whitespace-nowrap">{action}</div> : null}
    </div>
  );
}

function FeedCard({ product: p, index }: { product: MarketplaceProduct; index: number }) {
  const { add } = useMarketplaceCart();
  const [added, setAdded] = useState(false);
  const href = `/store/${p.vendorSlug}/products/${p.id}`;
  return (
    <div className="ue-rise-in group" style={{ animationDelay: `${Math.min(index * 45, 400)}ms` }}>
      <Link href={href} className="relative block aspect-[3/4] overflow-hidden rounded-xl bg-cream-deep">
        {p.imageUrl ? (
          <Image
            src={p.imageUrl}
            alt={p.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink">
            <span className="font-mono text-[11px] uppercase tracking-[1.4px]">No image</span>
          </div>
        )}
        {p.variantGroupId ? (
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
        <div className="font-mono text-[11px] uppercase tracking-[1.4px] text-ink">{p.storeName}</div>
        <Link href={href} className="mt-1 block text-[14px] font-semibold text-ink hover:underline">
          {p.name}
        </Link>
        <div className="mt-1 text-[14px] text-ink">
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
          ? "border-b-2 border-ink pb-2 text-[13px] font-semibold uppercase tracking-[1.2px] text-ink"
          : "border-b-2 border-transparent pb-2 text-[13px] font-medium uppercase tracking-[1.2px] text-ink transition-colors hover:text-ink"
      }
    >
      {children}
    </button>
  );
}
