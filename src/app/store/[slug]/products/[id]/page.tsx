"use client";

/**
 * Product detail (Migration 0059) — a calm, focused buy page.
 */
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { formatUsd, storefrontApi, type StoreProduct } from "@/lib/storefront-api";

import { useCart } from "../../cart-context";
import { useStore } from "../../store-shell";

export default function ProductDetailPage() {
  const store = useStore();
  const router = useRouter();
  const { add } = useCart();
  const params = useParams<{ id: string }>();
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [qty, setQty] = useState(1);

  useEffect(() => {
    storefrontApi
      .getProduct(store.slug, params.id)
      .then((p) => {
        setProduct(p);
        setState("ok");
      })
      .catch(() => setState("error"));
  }, [store.slug, params.id]);

  if (state === "loading") {
    return <div className="py-20 text-center font-mono text-mono-label text-text-subtle">Loading…</div>;
  }
  if (state === "error" || !product) {
    return (
      <div className="py-20 text-center">
        <p className="text-body-sm text-text-muted">This product isn&apos;t available.</p>
        <Link href={`/store/${store.slug}`} className="mt-3 inline-block text-[13px] underline">
          Back to store
        </Link>
      </div>
    );
  }

  return (
    <div className="ue-rise-in">
      <Link
        href={`/store/${store.slug}`}
        className="mb-6 inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-ink"
      >
        ← Back
      </Link>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="aspect-square w-full bg-cream-deep">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-text-subtle">
                <span className="font-mono text-[11px] uppercase tracking-[1.4px]">No image</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col">
          {product.category ? (
            <div className="font-mono text-[10px] uppercase tracking-[1.8px] text-text-subtle">
              {product.category}
            </div>
          ) : null}
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink md:text-3xl">
            {product.name}
          </h1>
          <div className="mt-3 text-2xl font-semibold text-ink">
            {formatUsd(product.retailPriceCents)}
          </div>
          <div className="mt-2 text-[12px] text-text-muted">
            {product.available > 0 ? `${product.available} in stock` : "Out of stock"}
          </div>

          {product.available > 0 ? (
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
                  onClick={() => setQty((q) => Math.min(product.available, q + 1))}
                  className="px-3 py-2 text-ink"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
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
                    qty,
                  );
                  router.push(`/store/${store.slug}/cart`);
                }}
                className="flex-1 rounded-full px-6 py-3 text-[13px] font-semibold text-white transition-transform active:scale-[0.98]"
                style={{ background: "var(--store-accent)" }}
              >
                Add to cart
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
