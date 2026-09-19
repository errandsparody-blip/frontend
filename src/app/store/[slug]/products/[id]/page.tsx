"use client";

/**
 * Product detail (Migration 0059 + 0066 variants) — gallery + size/colour
 * selectors. Loads the full listing (all variants); selecting size + colour
 * resolves to a specific variant, and its price, images, and stock update. Out-
 * of-stock combinations are disabled. Add-to-cart adds the resolved variant.
 */
import { Check, ChevronDown, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { formatUsd, storefrontApi, type PublicListing } from "@/lib/storefront-api";

import { BackLink } from "@/components/ui/back-link";

import { useMarketplaceCart } from "../../../../marketplace/cart-context";
import { useStore } from "../../store-shell";

export default function ProductDetailPage() {
  const store = useStore();
  const router = useRouter();
  const { add } = useMarketplaceCart();
  const params = useParams<{ id: string }>();
  const [listing, setListing] = useState<PublicListing | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    storefrontApi
      .getListing(store.slug, params.id)
      .then((l) => {
        setListing(l);
        setState("ok");
        // Default to the first in-stock variant so price/gallery are populated.
        const first = l.variants.find((v) => v.available > 0) ?? l.variants[0];
        if (first) {
          setSize(first.optionSize);
          setColor(first.optionColor);
        }
      })
      .catch(() => setState("error"));
  }, [store.slug, params.id]);

  const variants = listing?.variants ?? [];
  const hasSizes = (listing?.sizes.length ?? 0) > 0;
  const hasColors = (listing?.colors.length ?? 0) > 0;

  const selected = useMemo(
    () =>
      variants.find(
        (v) => (!hasSizes || v.optionSize === size) && (!hasColors || v.optionColor === color),
      ) ?? (variants.length === 1 ? variants[0] : null),
    [variants, size, color, hasSizes, hasColors],
  );

  // Reset the gallery + quantity whenever the resolved variant changes.
  useEffect(() => {
    setImgIdx(0);
    setQty(1);
  }, [selected?.productId]);

  if (state === "loading") {
    return <div className="py-20 text-center font-mono text-mono-label text-text-subtle">Loading…</div>;
  }
  if (state === "error" || !listing) {
    return (
      <div className="py-20 text-center">
        <p className="text-body-sm text-text-muted">This product isn&apos;t available.</p>
        <Link href={`/store/${store.slug}`} className="mt-3 inline-block text-[13px] underline">
          Back to store
        </Link>
      </div>
    );
  }

  const gallery = (selected?.imageUrls?.length ? selected.imageUrls : variants[0]?.imageUrls ?? []).filter(
    Boolean,
  );
  const mainImage = gallery[imgIdx] ?? gallery[0] ?? null;
  const price = selected
    ? selected.retailPriceCents
    : Math.min(...variants.map((v) => v.retailPriceCents));
  const available = selected?.available ?? 0;
  const label = [selected?.optionColor, selected?.optionSize].filter(Boolean).join(" · ");

  // A size/colour is offered only if some in-stock variant has it (respecting the
  // other axis' current selection).
  const sizeInStock = (s: string) =>
    variants.some((v) => v.optionSize === s && (!hasColors || v.optionColor === color) && v.available > 0);
  const colorInStock = (c: string) =>
    variants.some((v) => v.optionColor === c && (!hasSizes || v.optionSize === size) && v.available > 0);

  // Return to wherever the buyer actually came from — the marketplace if they
  // arrived from there, or the storefront if they were browsing the store.
  // Falls back to the store when there's no in-app history (e.g. a deep link).
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(`/store/${store.slug}`);
  };

  return (
    <div className="ue-rise-in">
      <BackLink onClick={goBack} />
      <div className="grid gap-8 md:grid-cols-2">
        {/* Gallery */}
        <div>
          <div className="overflow-hidden rounded-2xl border border-line bg-white">
            <div className="relative aspect-square w-full bg-cream-deep">
              {mainImage ? (
                <Image
                  src={mainImage}
                  alt={listing.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-text-subtle">
                  <span className="font-mono text-[11px] uppercase tracking-[1.4px]">No image</span>
                </div>
              )}
            </div>
          </div>
          {gallery.length > 1 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {gallery.map((src, i) => (
                <button
                  key={src + i}
                  type="button"
                  onClick={() => setImgIdx(i)}
                  className={`relative h-16 w-16 overflow-hidden rounded-lg border ${i === imgIdx ? "border-ink" : "border-line hover:border-line-strong"}`}
                >
                  <Image src={src} alt="" fill sizes="64px" className="object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Details */}
        <div className="flex flex-col">
          {listing.category ? (
            <div className="font-mono text-[10px] uppercase tracking-[1.8px] text-text-subtle">
              {listing.category}
            </div>
          ) : null}
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink md:text-3xl">
            {listing.name}
          </h1>
          <div className="mt-3 text-2xl font-semibold text-ink">
            {selected ? formatUsd(price) : `from ${formatUsd(price)}`}
          </div>

          {/* Colour selector */}
          {hasColors ? (
            <div className="mt-6">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[1.4px] text-text-subtle">
                Colour{selected?.optionColor ? `: ${selected.optionColor}` : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                {listing.colors.map((c) => {
                  const inStock = colorInStock(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={!inStock}
                      onClick={() => setColor(c)}
                      className={`rounded-full border px-4 py-2 text-[13px] ${color === c ? "border-ink bg-ink text-cream-soft" : "border-line-strong bg-white text-ink hover:border-ink"} ${!inStock ? "cursor-not-allowed opacity-40 line-through" : ""}`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Size selector */}
          {hasSizes ? (
            <div className="mt-5">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[1.4px] text-text-subtle">
                Size{selected?.optionSize ? `: ${selected.optionSize}` : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                {listing.sizes.map((s) => {
                  const inStock = sizeInStock(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={!inStock}
                      onClick={() => setSize(s)}
                      className={`min-w-11 rounded-lg border px-3 py-2 text-[13px] ${size === s ? "border-ink bg-ink text-cream-soft" : "border-line-strong bg-white text-ink hover:border-ink"} ${!inStock ? "cursor-not-allowed opacity-40 line-through" : ""}`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-4 text-[12px] text-text-muted">
            {selected
              ? available > 0
                ? `${available} in stock`
                : "Out of stock"
              : "Select options"}
          </div>

          <div className="mt-8 flex items-center gap-3">
            <div className="flex items-center rounded-full border border-line-strong bg-white">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="px-3 py-2 text-ink"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="min-w-8 text-center text-[14px] font-medium">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(available || 1, q + 1))}
                className="px-3 py-2 text-ink"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
            <button
              type="button"
              disabled={!selected || available <= 0}
              onClick={() => {
                if (!selected) return;
                add(
                  {
                    productId: selected.productId,
                    vendorSlug: store.slug,
                    storeName: store.displayName,
                    name: label ? `${listing.name} (${label})` : listing.name,
                    unitRetailCents: selected.retailPriceCents,
                    imageUrl: mainImage ?? selected.imageUrl,
                    available: selected.available,
                  },
                  qty,
                );
                router.push(`/marketplace/cart`);
              }}
              className="flex-1 rounded-full px-6 py-3 text-[13px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
              style={{ background: "var(--store-accent)" }}
            >
              {selected && available > 0 ? "Add to cart" : selected ? "Out of stock" : "Select options"}
            </button>
          </div>

          {/* Trust line — quick reassurances, incl. the vendor's returns stance. */}
          <ul className="mt-6 flex flex-col gap-1.5 border-t border-line pt-5 text-[13px] text-text-muted">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-success" aria-hidden />
              Buyer protection on every order
            </li>
            <li className="flex items-center gap-2">
              {listing.returnsAllowed ? (
                <>
                  <Check className="h-4 w-4 text-success" aria-hidden />
                  Returns within {listing.returnWindowDays} days
                </>
              ) : (
                <>
                  <X className="h-4 w-4 text-text-subtle" aria-hidden />
                  Final sale — no returns
                </>
              )}
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-success" aria-hidden />
              Payment goes directly to the maker
            </li>
          </ul>

          {/* Returns & exchanges — the vendor's declared policy, in full. */}
          <details className="group mt-4 border-t border-line pt-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-semibold text-ink">
              Returns &amp; exchanges
              <ChevronDown className="h-4 w-4 text-text-subtle transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="mt-3 text-[13px] leading-relaxed text-text-muted">
              {listing.returnsAllowed ? (
                <p>
                  {store.displayName} accepts returns within{" "}
                  <span className="font-medium text-ink">{listing.returnWindowDays} days</span> of your
                  order shipping. Items should be unused and in their original condition. Start a return
                  from your order in your account, and once it&apos;s approved you&apos;ll be refunded to
                  your original payment method.
                </p>
              ) : (
                <p>
                  {store.displayName} sells this item as final sale — it can&apos;t be returned or
                  exchanged. If it arrives damaged or not as described, contact support and we&apos;ll
                  help make it right.
                </p>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
