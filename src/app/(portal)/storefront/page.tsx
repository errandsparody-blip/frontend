"use client";

/**
 * Storefront hub. The landing page for the vendor storefront area: a short
 * intro, the downloadable guide, and three action cards that route to the
 * real work —
 *   - Setup storefront   → /storefront/setup    (store presentation, payouts,
 *                            go-live, discounts, custom domains)
 *   - Manage products    → /storefront/products
 *   - Storefront orders  → /storefront/orders
 *
 * The old, dense "set everything up on one screen" page now lives at
 * /storefront/setup; this page is deliberately light so vendors land somewhere
 * calm and pick where to go.
 */
import Link from "next/link";
import type { JSX } from "react";

import { PageHeader } from "@/components/ui/page-header";

interface Action {
  href: string;
  title: string;
  description: string;
  icon: string;
}

const ACTIONS: ReadonlyArray<Action> = [
  {
    href: "/storefront/setup",
    title: "Setup storefront",
    description:
      "Your store's name and look, payout account, going live, discount codes, and custom domains.",
    icon: "🛠️",
  },
  {
    href: "/storefront/products",
    title: "Manage products",
    description:
      "Add items from your inventory, set prices and variants, and choose what shows in your store.",
    icon: "📦",
  },
  {
    href: "/storefront/orders",
    title: "Storefront orders",
    description:
      "See orders customers place through your store, track fulfillment, and handle returns.",
    icon: "🧾",
  },
];

export default function StorefrontHubPage(): JSX.Element {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Storefront"
        description="You already have your inventory with us — now let's help you sell it. Peep the guide to get started"
      />

      {/* Storefront + marketplace guide (PDF in /public). Opens in a new tab. */}
      <a
        href="/storefront-guide.pdf"
        target="_blank"
        rel="noreferrer"
        className="mb-8 inline-flex items-center gap-2 rounded-full border border-ink bg-ink px-4 py-2 text-[13px] font-semibold text-cream-soft transition-transform hover:-translate-y-0.5"
      >
        <span aria-hidden>📄</span>
        Read the storefront guide
      </a>

      {/* Three main actions. */}
      <div className="grid gap-4 sm:grid-cols-3">
        {ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group flex flex-col rounded-2xl border border-line bg-white p-5 shadow-1 transition-transform hover:-translate-y-0.5 hover:shadow-2"
          >
            <span aria-hidden className="text-2xl">
              {action.icon}
            </span>
            <span className="mt-3 flex items-center gap-1 text-[15px] font-semibold text-ink">
              {action.title}
              <span
                aria-hidden
                className="translate-x-0 text-text-subtle transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </span>
            <span className="mt-1 text-[13px] leading-relaxed text-text-muted">
              {action.description}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
