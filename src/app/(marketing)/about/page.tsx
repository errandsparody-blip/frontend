import Link from "next/link";

import { FadeUp } from "@/components/marketing/fade-up";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "About — USA Errands",
  description:
    "USA Errands is a Texas-based logistics and personal-shopping partner for international sellers and buyers — inventory storage, fulfillment, shipping, and personal shopping without needing a U.S. presence.",
};

export default function AboutPage() {
  return (
    <>
      {/* HERO */}
      <section className="border-b border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              About
            </div>
            <h1 className="mt-4 max-w-3xl text-display font-medium leading-[1.04] tracking-[-1.2px] text-ink">
              A U.S. operations team for businesses and buyers who don&apos;t
              live here.
            </h1>
            <p className="mt-6 max-w-2xl text-body-lg text-text-muted">
              USA Errands helps international sellers and buyers access the
              U.S. market without needing a physical presence in the United
              States.
            </p>
          </FadeUp>
        </div>
      </section>

      {/* WHY WE EXIST */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-[84rem] gap-16 px-8 py-24 lg:grid-cols-[1fr_1fr]">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              Why we exist
            </div>
            <h2 className="mt-3 text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
              Finding customers isn&apos;t the problem. Running the
              warehouse from another country is.
            </h2>
          </FadeUp>
          <FadeUp delay={80}>
            <div className="flex flex-col gap-5 text-body text-text">
              <p>
                For many overseas businesses, finding U.S. customers is the
                easy part. The hard part is managing inventory, fulfillment,
                shipping, returns, and day-to-day logistics from another
                country. High international shipping costs, slow delivery
                times, and limited operational support make it difficult to
                compete — and often lead to lost returning customers.
              </p>
              <p>
                USA Errands was built to solve those problems.
              </p>
              <p className="text-text-muted">
                From our Texas-based operation, we receive, organize, store,
                pack, and ship products across the country — and we keep
                clear, dependable communication going throughout. No U.S.
                entity, no U.S. warehouse, no U.S. team required on your
                end.
              </p>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* WHAT WE DO */}
      <section className="border-b border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              What we do
            </div>
            <h2 className="mt-3 max-w-3xl text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
              Two services. One reliable U.S. partner.
            </h2>
            <p className="mt-4 max-w-2xl text-body text-text-muted">
              We run two complementary operations under one roof — fulfillment
              for international sellers, and personal shopping for
              international buyers. Both use the same warehouse, the same
              team, and the same standards.
            </p>
          </FadeUp>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <FadeUp delay={80}>
              <article className="flex h-full flex-col gap-3 rounded-md border border-line bg-white p-8">
                <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-amber">
                  For sellers
                </div>
                <h3 className="text-h3 font-medium leading-tight text-ink">
                  Inventory, fulfillment, and shipping coordination.
                </h3>
                <p className="text-body-sm text-text-muted">
                  We provide inventory storage, order fulfillment, shipping
                  coordination, package handling, and operational support
                  for international vendors who need a reliable U.S.-based
                  partner. Products land at our warehouse, get organized
                  and stocked, and go out across the country as orders
                  come in.
                </p>
              </article>
            </FadeUp>
            <FadeUp delay={160}>
              <article className="flex h-full flex-col gap-3 rounded-md border border-line bg-white p-8">
                <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-amber">
                  For buyers
                </div>
                <h3 className="text-h3 font-medium leading-tight text-ink">
                  Personal shopping and consolidated delivery.
                </h3>
                <p className="text-body-sm text-text-muted">
                  We help international buyers purchase items from multiple
                  American stores, then consolidate those purchases into a
                  single shipment and coordinate international delivery. One
                  shipment instead of many — lower overall shipping cost and
                  a simpler process from order to doorstep.
                </p>
              </article>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* HOW WE'RE DIFFERENT */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              How we work
            </div>
            <h2 className="mt-3 max-w-3xl text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
              A small operation by choice.
            </h2>
            <p className="mt-4 max-w-2xl text-body text-text-muted">
              Unlike large fulfillment companies built around massive brands
              and automated systems, we operate with a more focused,
              hands-on approach. We intentionally work with a limited number
              of clients so we can provide better organization, faster
              communication, greater flexibility, and more personalized
              operational support.
            </p>
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

      {/* CLOSING STATEMENT */}
      <section className="border-b border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              Our goal
            </div>
            <h2 className="mt-3 max-w-3xl text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
              The point of all this.
            </h2>
            <p className="mt-6 max-w-2xl text-body-lg text-text">
              To give international sellers and buyers a reliable
              U.S.-based partner for fulfillment, logistics, shopping, and
              shipping — without the complexity of building and managing
              their own operation in the United States.
            </p>
          </FadeUp>
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
                  Each of our two services has a dedicated page. Please
                  select the one most relevant to your requirements.
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
    title: "Accurate handling, every box.",
    body: "Managing products and shipments from another country requires trust. We prioritize accurate handling and organized workflows so what arrives at our warehouse is exactly what leaves it.",
  },
  {
    tag: "Communication",
    title: "Responsive and clear, start to finish.",
    body: "Clients hear from us when something needs a decision, when an order moves, and when anything doesn't go as expected. No silence, no chasing for status updates.",
  },
  {
    tag: "Consistency",
    title: "Dependable fulfillment day after day.",
    body: "The same standards apply to the first order and the thousandth — receive, organize, pack, ship, communicate. Predictable operations are the whole point.",
  },
];
