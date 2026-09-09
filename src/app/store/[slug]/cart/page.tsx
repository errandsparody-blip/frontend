"use client";

/**
 * Cart (Migration 0059) — review + adjust quantities, then head to checkout.
 */
import Link from "next/link";

import { formatUsd } from "@/lib/storefront-api";

import { useCart } from "../cart-context";
import { useStore } from "../store-shell";

export default function CartPage() {
  const store = useStore();
  const { items, setQty, remove, subtotalCents, count } = useCart();
  const base = `/store/${store.slug}`;

  if (count === 0) {
    return (
      <div className="ue-rise-in py-20 text-center">
        <h1 className="text-xl font-semibold text-ink">Your cart is empty</h1>
        <p className="mt-2 text-body-sm text-text-muted">Add something you love.</p>
        <Link
          href={base}
          className="mt-6 inline-block rounded-full px-6 py-3 text-[13px] font-semibold text-white"
          style={{ background: "var(--store-accent)" }}
        >
          Browse the store
        </Link>
      </div>
    );
  }

  return (
    <div className="ue-rise-in mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-ink">Your cart</h1>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
        {items.map((i) => (
          <div key={i.productId} className="flex items-center gap-4 p-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-cream-deep">
              {i.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium text-ink">{i.name}</div>
              <div className="text-[12px] text-text-muted">{formatUsd(i.unitRetailCents)} each</div>
            </div>
            <div className="flex items-center rounded-full border border-line-strong">
              <button
                type="button"
                onClick={() => setQty(i.productId, i.quantity - 1)}
                className="px-3 py-1.5 text-ink"
                aria-label="Decrease"
              >
                −
              </button>
              <span className="min-w-7 text-center text-[13px] font-medium">{i.quantity}</span>
              <button
                type="button"
                onClick={() => setQty(i.productId, i.quantity + 1)}
                className="px-3 py-1.5 text-ink"
                aria-label="Increase"
              >
                +
              </button>
            </div>
            <div className="w-20 text-right text-[14px] font-semibold text-ink">
              {formatUsd(i.unitRetailCents * i.quantity)}
            </div>
            <button
              type="button"
              onClick={() => remove(i.productId)}
              className="text-[12px] text-text-subtle hover:text-error"
              aria-label="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between rounded-2xl border border-line bg-white px-5 py-4">
        <span className="text-[13px] text-text-muted">Subtotal</span>
        <span className="text-lg font-semibold text-ink">{formatUsd(subtotalCents)}</span>
      </div>
      <p className="mt-2 text-center text-[12px] text-text-subtle">
        Shipping calculated at checkout.
      </p>

      <Link
        href={`${base}/checkout`}
        className="mt-5 block rounded-full px-6 py-3.5 text-center text-[14px] font-semibold text-white transition-transform active:scale-[0.99]"
        style={{ background: "var(--store-accent)" }}
      >
        Proceed to checkout
      </Link>
    </div>
  );
}
