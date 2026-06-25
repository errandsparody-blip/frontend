import Link from "next/link";

import { FadeUp } from "@/components/marketing/fade-up";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Store integration — USA Errands",
  description:
    "Connect your online store and orders fulfill themselves. When a customer checks out, the order flows straight into our warehouse — no manual entry, billed from your wallet.",
};

// Three plain steps. Deliberately short — the page sells the idea; the
// technical reference lives behind the vendor login.
const STEPS = [
  {
    n: "01",
    title: "Get your key",
    body: "Sign in and create an API key from your dashboard. One click. It's how your store proves it's you.",
  },
  {
    n: "02",
    title: "Match your products",
    body: "Set each product's SKU on your store to its USA Errands product code. That's how we know which stored item sold.",
  },
  {
    n: "03",
    title: "Sell as normal",
    body: "When a customer pays on your store, the order arrives with us automatically. We pick, pack, and ship it — and bill the fee to your wallet.",
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
              Connect your store. Orders fulfill themselves.
            </h1>
            <p className="mt-6 max-w-2xl text-body-lg text-text-muted">
              Already selling on your own website? Link it to your USA Errands
              account and every paid order comes straight to our warehouse — no
              copying, no re-typing. We ship it and charge the fee to your
              wallet. How your customer pays you stays entirely on your side.
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

      {/* HOW IT WORKS — three steps */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              How it works
            </div>
            <h2 className="mt-3 max-w-2xl text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
              Three steps, then it runs on its own.
            </h2>
          </FadeUp>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <FadeUp key={s.n} delay={i * 80}>
                <div className="h-full rounded-md border border-line bg-white p-8">
                  <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
                    {s.n}
                  </div>
                  <h3 className="mt-4 text-h3 text-ink">{s.title}</h3>
                  <p className="mt-2 text-body-sm text-text-muted">{s.body}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* WORKS WITH + WHAT HAPPENS ON HOLD */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-[84rem] gap-16 px-8 py-24 lg:grid-cols-[1fr_1fr] lg:items-center">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              Works with any store
            </div>
            <h2 className="mt-3 text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
              Your website, Shopify, WooCommerce — anything.
            </h2>
            <p className="mt-4 text-body text-text-muted">
              There&apos;s no app to install. If your store can send an order
              when a customer checks out, it can connect to us. Your developer
              points it at one secure address using your key — and that&apos;s
              the whole integration.
            </p>
          </FadeUp>

          <FadeUp delay={80}>
            <div className="rounded-md border border-line bg-white p-8">
              <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                Nothing slips through
              </div>
              <ul className="mt-4 flex flex-col gap-4 text-body">
                <li className="border-t border-line pt-4 first:border-t-0 first:pt-0">
                  <div className="font-medium text-ink">Wallet runs low</div>
                  <p className="mt-1 text-body-sm text-text-muted">
                    The order is held — never lost — and ships the moment you
                    top up. We&apos;ll let you know.
                  </p>
                </li>
                <li className="border-t border-line pt-4">
                  <div className="font-medium text-ink">An item doesn&apos;t match</div>
                  <p className="mt-1 text-body-sm text-text-muted">
                    If a product code doesn&apos;t line up with your stock, we
                    hold the order and flag it so you can fix it.
                  </p>
                </li>
                <li className="border-t border-line pt-4">
                  <div className="font-medium text-ink">No double orders</div>
                  <p className="mt-1 text-body-sm text-text-muted">
                    Re-sends are safe — the same store order never creates a
                    duplicate.
                  </p>
                </li>
              </ul>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <h2 className="max-w-2xl text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
              Ready to connect your store?
            </h2>
            <p className="mt-4 max-w-2xl text-body text-text-muted">
              Integration is available to active vendors with inventory in our
              warehouse. Create your key from the dashboard — full developer
              instructions are right there when you do.
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
