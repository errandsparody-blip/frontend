import Link from "next/link";

import { FadeUp } from "@/components/marketing/fade-up";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "About — USA Errands",
  description:
    "USA Errands is a U.S.-based logistics + personal-shopping platform for the world. Sellers ship into one warehouse; buyers anywhere can shop any U.S. store.",
};

export default function AboutPage() {
  return (
    <>
      {/* HERO */}
      <section className="border-b border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              [01] About
            </div>
            <h1 className="mt-4 max-w-3xl text-display font-medium leading-[1.04] tracking-[-1.2px] text-ink">
              We bring American retail to anyone, anywhere.
            </h1>
            <p className="mt-6 max-w-2xl text-body-lg text-text-muted">
              USA Errands is the missing infrastructure for cross-border
              commerce — a U.S. warehouse, a personal shopping desk, and a
              checkout that just works for buyers and sellers outside the
              country.
            </p>
          </FadeUp>
        </div>
      </section>

      {/* STORY */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-[84rem] gap-16 px-8 py-24 lg:grid-cols-[1fr_1fr]">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              [02] Why we exist
            </div>
            <h2 className="mt-3 text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
              The supply chain wasn&apos;t built for the rest of the world.
            </h2>
          </FadeUp>
          <FadeUp delay={80}>
            <div className="flex flex-col gap-5 text-body text-text">
              <p>
                For most of the planet, buying from a U.S. store means
                fragile address forwarders, screenshots traded on WhatsApp,
                and a 30% chance the parcel never arrives. For sellers
                outside the U.S., access to the largest consumer market in
                the world is gated by a bank account they can&apos;t open.
              </p>
              <p>
                We built USA Errands to make both sides invisible to each
                other. A buyer in Lagos types a Nordstrom URL; we buy it,
                we ship it. A seller in Manchester sends us a pallet; we
                stock it, we pack it, we ship it next-day. No U.S.
                entity required.
              </p>
              <p className="text-text-muted">
                One warehouse, two products, one checkout — built so the
                country you&apos;re in stops mattering.
              </p>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* VALUES */}
      <section className="border-b border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              [03] What we hold ourselves to
            </div>
            <h2 className="mt-3 max-w-3xl text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
              Three things, not nine.
            </h2>
          </FadeUp>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {VALUES.map((v, i) => (
              <FadeUp key={v.title} delay={i * 80}>
                <article className="flex h-full flex-col gap-3 rounded-md border border-line bg-white p-8 transition-transform duration-300 ease-out hover:-translate-y-1 hover:shadow-2">
                  <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-amber">
                    {v.tag}
                  </div>
                  <h3 className="text-h3 font-medium leading-tight text-ink">
                    {v.title}
                  </h3>
                  <p className="text-body-sm text-text-muted">{v.body}</p>
                </article>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <div className="flex flex-col items-start gap-6 rounded-md border border-line bg-ink px-10 py-14 text-text-inv md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="max-w-xl text-h2 font-medium leading-tight tracking-[-0.5px]">
                  Want to see what we actually do day-to-day?
                </h2>
                <p className="mt-3 max-w-lg text-body text-text-inv/80">
                  Two products, each with their own page. Pick the one that
                  matches what you came here for.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/services">
                  <Button variant="amber" size="lg" withArrow>
                    See all services
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button variant="outline" size="lg">
                    Talk to us
                  </Button>
                </Link>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>
    </>
  );
}

const VALUES: ReadonlyArray<{ tag: string; title: string; body: string }> = [
  {
    tag: "Trust",
    title: "If we touched it, you can audit it.",
    body: "Every cent that moves on the platform shows up on an append-only ledger. Vendors see their own. Admins see everyone's. Nothing happens off the books.",
  },
  {
    tag: "Speed",
    title: "Inbound to outbound in four days.",
    body: "Pallets land. We unpack, label, weigh, and stock the same day they arrive. Your first order out the door is rarely more than a week from your first crate.",
  },
  {
    tag: "Honesty",
    title: "Pricing fits on one page.",
    body: "No per-touch surcharges, no carrier kickbacks, no surprise reweigh fees. The price card is the price. If it changes, you hear about it in advance.",
  },
];
