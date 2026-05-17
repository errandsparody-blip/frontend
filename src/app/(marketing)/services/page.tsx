import {
  BadgeDollarSign,
  Boxes,
  Building2,
  HeartHandshake,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { FadeUp } from "@/components/marketing/fade-up";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Services — USA Errands",
  description:
    "Two products. Fulfillment for sellers outside the U.S. — our main service. Personal shopping for buyers anywhere. One U.S. warehouse, one checkout.",
};

export default function ServicesPage() {
  return (
    <>
      {/* HERO */}
      <section className="border-b border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              Services
            </div>
            <h1 className="mt-4 max-w-3xl text-display font-medium leading-[1.04] tracking-[-1.2px] text-ink">
              Two services. One mission.
            </h1>
            <p className="mt-6 max-w-2xl text-body-lg text-text-muted">
              Whether you&apos;re buying from a U.S. store or selling into the
              U.S. from elsewhere, the back-end is the same — our warehouse,
              our checkout, our ledger.
            </p>
          </FadeUp>
        </div>
      </section>

      {/* FULFILLMENT — the main business, surfaced first. Text
          column on the LEFT (where the eye lands), feature card on the
          RIGHT. The amber "Main service" tag in the eyebrow reinforces
          ordering for anyone scanning the page. */}
      <section id="fulfillment" className="border-b border-line">
        <div className="mx-auto grid max-w-[84rem] gap-16 px-8 py-24 lg:grid-cols-[1fr_1fr] lg:items-center">
          <FadeUp>
            <div className="flex items-center gap-3">
              <div className="font-mono text-mono-eyebrow uppercase text-amber">
                Fulfillment
              </div>
              <span className="rounded-full bg-amber/15 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[1.4px] text-amber">
                Main service
              </span>
            </div>
            <h2 className="mt-3 text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
              Ship a pallet. Sell from a U.S. address.
            </h2>
            <p className="mt-4 text-body text-text-muted">
              Send us inventory once. We stock it, label it, and ship every
              order from a U.S. warehouse — locally, in days, with full
              tracking.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup">
                <Button variant="amber" size="lg" withArrow>
                  Become a vendor
                </Button>
              </Link>
              <Link href="/pricing">
                <Button variant="outline" size="lg">
                  See pricing
                </Button>
              </Link>
            </div>
          </FadeUp>

          <FadeUp delay={80}>
            <div className="rounded-md border border-line bg-white p-8">
              <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                What the fulfillment service gives you
              </div>
              <ul className="mt-4 flex flex-col gap-4 text-body">
                {THREEPL_FEATURES.map((f) => (
                  <li key={f.title} className="border-t border-line pt-4 first:border-t-0 first:pt-0">
                    <div className="font-medium text-ink">{f.title}</div>
                    <p className="mt-1 text-body-sm text-text-muted">{f.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* PERSONAL SHOPPING — the secondary product. Alternating layout
          (feature card on the LEFT, text on the RIGHT) so the page has
          a visual rhythm. Background tinted cream-soft to differentiate
          from the fulfillment section above. */}
      <section id="personal-shopping" className="border-b border-line bg-cream-soft">
        <div className="mx-auto grid max-w-[84rem] gap-16 px-8 py-24 lg:grid-cols-[1fr_1fr] lg:items-center">
        <FadeUp delay={80}>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              Personal shopping
            </div>
            <h2 className="mt-3 text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
              Paste a URL. We buy it. You get it.
            </h2>
            <p className="mt-4 text-body text-text-muted">
              Drop the link to anything on any U.S. store. Our admin team
              checks out on your behalf, the item lands at our warehouse, we
              consolidate, and it ships to your door. Stripe handles the
              checkout end-to-end — every receipt, every refund, every
              follow-up invoice posts to your thread automatically.
            </p>
            <ul className="mt-6 flex flex-col gap-3 text-body-sm text-text">
              <Bullet>One Stripe link. No bank-transfer surprises.</Bullet>
              <Bullet>Live chat with the operator buying for you.</Bullet>
              <Bullet>Auto-generated receipt with every checkpoint.</Bullet>
              <Bullet>Refunds in one click if a store cancels.</Bullet>
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/shopper">
                <Button variant="outline" size="lg" withArrow>
                  Open a request
                </Button>
              </Link>
              
            </div>
          </FadeUp>
          <FadeUp>
            <div className="rounded-md border border-line bg-white p-8">
              <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                Sample flow
              </div>
              <ol className="mt-4 flex flex-col gap-5">
                {SHOPPER_STEPS.map((s, i) => (
                  <li key={s.label} className="flex gap-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber font-mono text-mono-label text-text-inv">
                      {i + 1}
                    </span>
                    <div>
                      <div className="text-body font-medium text-ink">
                        {s.label}
                      </div>
                      <p className="mt-1 text-body-sm text-text-muted">
                        {s.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </FadeUp>


        </div>
      </section>

      {/* WHY VENDORS CHOOSE US — closing trust band on the dark ink
          background. Mirrors the home CTA palette so the page ends on
          the same brand note. */}
      <section className="bg-ink">
        <div className="mx-auto max-w-[84rem] px-8 py-24 text-text-inv">
          <FadeUp>
            <div className="text-center">
              <div className="font-mono text-mono-eyebrow uppercase tracking-[1.4px] text-amber">
                Why vendors choose USA Errands
              </div>
              <h2 className="mx-auto mt-4 max-w-3xl text-h2 font-medium leading-tight tracking-[-0.5px]">
                Built for international vendors. Backed by support.
              </h2>
            </div>
          </FadeUp>

          <FadeUp delay={80}>
            <ul className="mt-16 grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 lg:grid-cols-6">
              {VENDOR_PROOF.map(({ icon: Icon, title }) => (
                <li key={title} className="flex flex-col items-center text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-md border border-white/15 text-amber">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="mt-4 text-body-sm font-medium leading-snug">
                    {title}
                  </div>
                </li>
              ))}
            </ul>
          </FadeUp>
        </div>
      </section>

    </>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber"
      />
      <span>{children}</span>
    </li>
  );
}

const SHOPPER_STEPS: ReadonlyArray<{ label: string; body: string }> = [
  {
    label: "Send the URLs",
    body: "Paste the product page link, pick a quantity, drop a note about size or colour.",
  },
  {
    label: "Pay intake",
    body: "One Stripe checkout covers items + service fee + estimated tax. No bank transfers.",
  },
  {
    label: "We buy & receive",
    body: "Admin places the order. The item lands at our warehouse, gets weighed, photographed.",
  },
  {
    label: "We ship to you",
    body: "Final invoice = shipping cost only. We ship to anywhere your address forwarder can't.",
  },
];

const VENDOR_PROOF: ReadonlyArray<{ icon: LucideIcon; title: string }> = [
  { icon: Warehouse, title: "U.S. Based Warehouse" },
  { icon: BadgeDollarSign, title: "Affordable & Transparent" },
  { icon: Truck, title: "Fast & Reliable Shipping" },
  { icon: Boxes, title: "Inventory Visibility" },
  { icon: HeartHandshake, title: "Human Support That Cares" },
  { icon: Building2, title: "Designed for SMEs" },
];

const THREEPL_FEATURES: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Warehouse + bin-level inventory",
    body: "We hold your stock, photograph every PSN, and track per-bin counts down to the unit. Your dashboard mirrors the floor in real time.",
  },
  {
    title: "Pick, pack, ship — local",
    body: "Every order ships from inside the U.S. with a real-tracking carrier. Average pick-to-handoff in under 6 working hours.",
  },
  {
    title: "Returns desk",
    body: "Inbound labels generated on demand. Photo evidence captured at receive. Refunds tied back to the original order with one click.",
  },
  {
    title: "Wallet + ledger",
    body: "Every fee is a line on a single ledger you can export at month-end. Reconciles to the cent against your Stripe deposits.",
  },
];
