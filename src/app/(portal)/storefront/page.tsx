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
import { useQuery } from "@tanstack/react-query";
import { FileText, Package, Settings, ShoppingBag, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";

interface Earnings {
  heldCents: number;
  paidCents: number;
  currency: string;
  upcoming: Array<{ reference: string; amountCents: number; releaseAt: string | null; status: string }>;
  recentPaid: Array<{ reference: string; amountCents: number; paidAt: string | null }>;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (cents: number): string => usd.format((cents ?? 0) / 100);
const shortDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

interface Action {
  href: string;
  title: string;
  description: string;
  Icon: LucideIcon;
}

const ACTIONS: ReadonlyArray<Action> = [
  {
    href: "/storefront/setup",
    title: "Setup storefront",
    description:
      "Your store's name and look, payout account, going live, discount codes, and custom domains.",
    Icon: Settings,
  },
  {
    href: "/storefront/products",
    title: "Manage products",
    description:
      "Add items from your inventory, set prices and variants, and choose what shows in your store.",
    Icon: Package,
  },
  {
    href: "/storefront/orders",
    title: "Storefront orders",
    description:
      "See the orders customers place through your store and how much you earned. We handle fulfillment.",
    Icon: ShoppingBag,
  },
];

export default function StorefrontHubPage(): JSX.Element {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Storefront"
        description="You already have your inventory with us — now let's help you sell it. Peep the guide to get started"
      />

      <EarningsPanel />


      {/* Storefront + marketplace guide (PDF in /public). Opens in a new tab. */}
      <a
        href="/storefront-guide.pdf"
        target="_blank"
        rel="noreferrer"
        className="mb-8 inline-flex items-center gap-2 rounded-full border border-ink bg-ink px-4 py-2 text-[13px] font-semibold text-cream-soft transition-transform hover:-translate-y-0.5"
      >
        <FileText className="h-4 w-4" aria-hidden />
        Read the storefront guide
      </a>

      {/* Three main actions. */}
      <div className="grid gap-4 sm:grid-cols-3">
        {ACTIONS.map(({ href, title, description, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col rounded-2xl border border-line bg-white p-5 shadow-1 transition-transform hover:-translate-y-0.5 hover:shadow-2"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-cream-soft text-ink">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="mt-3 flex items-center gap-1 text-[15px] font-semibold text-ink">
              {title}
              <span
                aria-hidden
                className="translate-x-0 text-text-subtle transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </span>
            <span className="mt-1 text-[13px] leading-relaxed text-text-muted">
              {description}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * Storefront earnings wallet. Your share of each sale (product price minus the
 * platform fee) is recognised the moment the order is paid. USA Errands holds it
 * until your return window closes (or 24h if you take no returns), then pays it
 * out to your account automatically — so a return or cancellation never leaves
 * you owing money back.
 */
function EarningsPanel(): JSX.Element {
  const earnings = useQuery({
    queryKey: ["storefront-earnings"],
    queryFn: () => api.get<Earnings>("/storefront/earnings"),
  });
  const e = earnings.data;

  return (
    <section className="mb-8 rounded-2xl border border-line bg-white p-5 shadow-1">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cream-soft text-ink">
          <Wallet className="h-4 w-4" aria-hidden />
        </span>
        <h2 className="text-[15px] font-semibold text-ink">Earnings</h2>
      </div>

      {earnings.isLoading ? (
        <p className="text-[13px] text-text-muted">Loading your earnings…</p>
      ) : earnings.isError || !e ? (
        <p className="text-[13px] text-text-muted">Your earnings will show here after your first sale.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-cream-soft/40 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[1.4px] text-text-subtle">On the way</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-ink">{money(e.heldCents)}</div>
              <div className="mt-1 text-[12px] text-text-muted">Held until your return window closes, then paid out.</div>
            </div>
            <div className="rounded-xl border border-line bg-cream-soft/40 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[1.4px] text-text-subtle">Paid out</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-ink">{money(e.paidCents)}</div>
              <div className="mt-1 text-[12px] text-text-muted">Already sent to your account.</div>
            </div>
          </div>

          {e.upcoming.length > 0 ? (
            <div className="mt-4">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[1.4px] text-text-subtle">
                Upcoming payouts
              </div>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {e.upcoming.slice(0, 6).map((u) => (
                  <li key={u.reference} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                    <span className="font-mono text-text-2">{u.reference}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-text-muted">pays out {shortDate(u.releaseAt)}</span>
                      <span className="font-medium text-ink">{money(u.amountCents)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="mt-3 text-[12px] text-text-subtle">
            USA Errands picks, packs and ships every storefront order — you just earn.
          </p>
        </>
      )}
    </section>
  );
}
