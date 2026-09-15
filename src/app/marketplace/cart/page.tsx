"use client";

/** Cross-vendor cart (Phase 2) — grouped by store, then one guided checkout. */
import Image from "next/image";
import Link from "next/link";

import { formatUsd } from "@/lib/storefront-api";

import { useMarketplaceCart } from "../cart-context";

export default function MarketplaceCartPage() {
  const { groups, setQty, remove, subtotalCents, count } = useMarketplaceCart();

  if (count === 0) {
    return (
      <div className="ue-rise-in py-20 text-center">
        <h1 className="text-xl font-semibold text-ink">Your cart is empty</h1>
        <Link
          href="/marketplace"
          className="mt-6 inline-block rounded-full bg-ink px-6 py-3 text-[13px] font-semibold text-cream-soft"
        >
          Browse the marketplace
        </Link>
      </div>
    );
  }

  return (
    <div className="ue-rise-in mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-ink">Your cart</h1>
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.vendorSlug} className="overflow-hidden rounded-2xl border border-line bg-white">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <Link href={`/store/${g.vendorSlug}`} className="text-[13px] font-semibold text-ink hover:underline">
                {g.storeName}
              </Link>
              <span className="text-[12px] text-text-muted">{formatUsd(g.subtotalCents)}</span>
            </div>
            <div className="divide-y divide-line">
              {g.items.map((i) => (
                <div key={i.productId} className="flex items-center gap-3 p-4">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-cream-deep">
                    {i.imageUrl ? (
                      <Image src={i.imageUrl} alt="" fill sizes="56px" className="object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-ink">{i.name}</div>
                    <div className="text-[12px] text-text-muted">{formatUsd(i.unitRetailCents)} each</div>
                  </div>
                  <div className="flex items-center rounded-full border border-line-strong">
                    <button type="button" onClick={() => setQty(i.productId, i.quantity - 1)} className="px-3 py-1.5" aria-label="Decrease">−</button>
                    <span className="min-w-7 text-center text-[13px] font-medium">{i.quantity}</span>
                    <button type="button" onClick={() => setQty(i.productId, i.quantity + 1)} className="px-3 py-1.5" aria-label="Increase">+</button>
                  </div>
                  <button type="button" onClick={() => remove(i.productId)} className="text-[12px] text-text-subtle hover:text-error" aria-label="Remove">✕</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between rounded-2xl border border-line bg-white px-5 py-4">
        <span className="text-[13px] text-text-muted">Subtotal ({count})</span>
        <span className="text-lg font-semibold text-ink">{formatUsd(subtotalCents)}</span>
      </div>
      <p className="mt-2 text-center text-[12px] text-text-subtle">
        Delivery is calculated at checkout.
      </p>
      <Link
        href="/marketplace/checkout"
        className="mt-5 block rounded-full bg-ink px-6 py-3.5 text-center text-[14px] font-semibold text-cream-soft transition-transform active:scale-[0.99]"
      >
        Checkout
      </Link>
    </div>
  );
}
