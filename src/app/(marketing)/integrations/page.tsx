import Link from "next/link";

import { FadeUp } from "@/components/marketing/fade-up";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Connect your store — USA Errands",
  description:
    "Connect your online store to USA Errands and send orders directly to our warehouse. We pick, pack, and ship to your customers — no manual order entry, no spreadsheets, no extra work.",
};

// The reassurance points from the store-integration section copy.
const POINTS = [
  {
    title: "No manual order entry",
    body: "Paid orders flow straight to our warehouse — nothing to copy or re-type.",
  },
  {
    title: "No spreadsheets",
    body: "Inventory and orders stay in sync automatically. No trackers to keep up to date.",
  },
  {
    title: "No extra work",
    body: "Once it's connected, it runs on its own. You sell; we handle the rest.",
  },
] as const;

export default function IntegrationsMarketingPage() {
  return (
    <>
      {/* HERO */}
      <section className="border-b border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              Store integration
            </div>
            <h1 className="mt-4 max-w-3xl text-display font-medium leading-[1.04] tracking-[-1.2px] text-ink">
              Connect Your Store to USA Errands
            </h1>
            <p className="mt-6 max-w-2xl text-body-lg font-medium text-ink">
              Automate your fulfillment and let us handle the rest.
            </p>
            <p className="mt-4 max-w-2xl text-body-lg text-text-muted">
              Connect your online store to USA Errands and send orders directly to our warehouse.
              We&apos;ll pick, pack, and ship your orders to your customers while you focus on
              growing your business.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup">
                <Button variant="amber" size="lg" withArrow>
                  Become a vendor
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="lg">
                  Sign in to connect
                </Button>
              </Link>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* NO MANUAL ORDER ENTRY / SPREADSHEETS / EXTRA WORK */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <h2 className="max-w-2xl text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
              No manual order entry. No spreadsheets. No extra work.
            </h2>
          </FadeUp>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {POINTS.map((p, i) => (
              <FadeUp key={p.title} delay={i * 80}>
                <div className="h-full rounded-md border border-line bg-white p-8">
                  <h3 className="text-h3 text-ink">{p.title}</h3>
                  <p className="mt-2 text-body-sm text-text-muted">{p.body}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* WORKS WITH EVERY STORE */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              Works with every store
            </div>
            <h2 className="mt-3 max-w-2xl text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
              Shopify, WooCommerce, Amazon, or your own store.
            </h2>
            <p className="mt-4 max-w-2xl text-body text-text-muted">
              Connect your Shopify, WooCommerce, Amazon or custom e-commerce store with USA Errands.
              Simple setup. Reliable fulfillment.
            </p>
          </FadeUp>
        </div>
      </section>

      {/* FOCUS ON SELLING — closing CTA */}
      <section className="bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <h2 className="max-w-2xl text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
              Focus on Selling. We&apos;ll Handle Fulfillment.
            </h2>
            <p className="mt-4 max-w-2xl text-body text-text-muted">
              Once connected, your orders flow directly to USA Errands for fulfillment.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup">
                <Button variant="amber" size="lg" withArrow>
                  Become a vendor
                </Button>
              </Link>
              <Link href="/contact">
                <Button variant="outline" size="lg">
                  Talk to us
                </Button>
              </Link>
            </div>
          </FadeUp>
        </div>
      </section>
    </>
  );
}
