import { Package, ShoppingBag, Zap } from "lucide-react";
import Link from "next/link";

import { FadeUp } from "@/components/marketing/fade-up";
import { Button } from "@/components/ui/button";

// Hero photo — Erik Mclean, "a person holding a cardboard box in their
// hand," free under the Unsplash License. Tagged "package delivery",
// "cardboard", "package" — exactly the brief.
//
// Source page: https://unsplash.com/photos/ICaUOZ0PL70
// Photographer: https://unsplash.com/@introspectivedsgn
// Image URL was verified against the actual Unsplash page (not blindly
// guessed). The `1680281707970-fa96c99f2ada` slug is the real photo id.
//
// `auto=format` lets Unsplash serve AVIF / WebP per Accept header;
// `fit=crop&w=1400&q=80` keeps the served bytes reasonable for retina
// without blowing past a 2× hero size.
//
// SWAP TO A DIFFERENT PHOTO. Find one on Unsplash, copy the
// `photo-XXXXXXXXX-yyyyyyyyyyyy` slug from the rendered image URL on
// the photo's page, and paste it below. Or drop a custom photo into
// `usa-errands-web/public/hero.jpg` and change the URL to `/hero.jpg`.
const HERO_IMAGE_URL =
  "https://images.unsplash.com/photo-1680281707970-fa96c99f2ada?auto=format&fit=crop&w=1400&q=80";

export default function HomePage() {
  return (
    <>
      {/* HERO — image-led, two-column. Left rail carries the message;
          right rail is a single editorial photo. The amber accent line
          at the corner of the image keeps the design-system fingerprint
          on screen without overlaying text on the photo. */}
      <section className="relative overflow-hidden bg-constellation">
        <div className="mx-auto grid max-w-[84rem] gap-12 px-8 py-24 lg:grid-cols-[1fr_1fr] lg:items-center">
          <FadeUp>
            <div>
              <div className="font-mono text-mono-eyebrow uppercase text-amber">
                Personal shopper · Fulfillment partner
              </div>
              <h1 className="mt-4 text-display-xl font-medium leading-[0.98] tracking-[-2px] text-ink">
                Ship from
                <br />
                anywhere.
                <br />
                <span className="text-amber">Sell to America.</span>
              </h1>
              <p className="mt-10 max-w-md text-body-lg text-text-muted">
                Hold your best-selling inventory in our U.S. warehouse, or
                let our personal-shopper desk buy from any U.S. store on
                your behalf. One platform.
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <Link href="/signup">
                  <Button variant="primary" size="lg" withArrow>
                    Get started
                  </Button>
                </Link>
                <Link href="/services">
                  <Button variant="outline" size="lg">
                    See our services
                  </Button>
                </Link>
              </div>
              <p className="mt-8 text-body-sm text-text-muted">
                Just want to buy something from a U.S. store?{" "}
                <Link
                  href="/shopper"
                  className="font-medium text-amber underline-offset-4 hover:underline"
                >
                  Open a personal shopper request →
                </Link>
              </p>
            </div>
          </FadeUp>

          <FadeUp delay={120}>
            <div className="relative">
              {/* Hero container — fixed 4:3 aspect ratio so the
                  layout doesn't shift while the photo loads. We sit
                  shorter than a portrait crop so the photo doesn't
                  dominate the fold and the headline column stays
                  weighted as the lead. Bordered + shadowed to match
                  the design-system card chrome. */}
              <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-line bg-cream-soft shadow-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={HERO_IMAGE_URL}
                  alt="A person holding a cardboard parcel — Erik Mclean / Unsplash."
                  className="h-full w-full object-cover"
                  loading="eager"
                  decoding="async"
                />
                {/* Subtle bottom gradient + tagline overlay. Sits on
                    the photo so the eye lands on something readable
                    even when the image itself is busy. */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 via-ink/30 to-transparent p-6">
                  <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
                    Two products · One warehouse
                  </div>
                  <div className="mt-1 text-h3 font-medium text-text-inv">
                    The country you&apos;re in stops mattering.
                  </div>
                </div>
              </div>
              {/* Amber tape — design-system accent strip in the top-left
                  corner. Mirrors the same amber strip on the SiteMark
                  logo so the brand fingerprint shows up even without
                  the wordmark. */}
              <div
                aria-hidden
                className="absolute -left-3 top-10 h-1.5 w-24 -rotate-6 bg-amber shadow-2"
              />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* STATS BAR */}
      <section className="border-y border-line">
        <div className="mx-auto grid max-w-[84rem] grid-cols-2 lg:grid-cols-4">
          <Stat value="1" label="Inventory value managed" />
          <Stat value="1" label="Vendors trust the system" />
          <Stat value="4.2 days" label="Average inbound onboarding" amber />
          <Stat value="99.97%" label="Uptime. Not rounded" />
        </div>
      </section>

      {/* SERVICES — three cards, the spine of the marketing site. */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
               What we do
            </div>
            <h2 className="mt-3 max-w-3xl text-display font-medium leading-[1.05] tracking-[-1px] text-ink">
              Two ways into U.S. retail. Pick yours.
            </h2>
            <p className="mt-4 max-w-2xl text-body-lg text-text-muted">
              We run a single warehouse, a single ledger, and a single
              checkout for both sides of cross-border commerce.
            </p>
          </FadeUp>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {SERVICES.map((s, i) => (
              <FadeUp key={s.title} delay={i * 90}>
                <Link
                  href={s.href}
                  className="group flex h-full flex-col gap-4 rounded-md border border-line bg-white p-8 transition-transform duration-300 ease-out hover:-translate-y-1 hover:shadow-2"
                >
                  <s.Icon className="h-6 w-6 text-amber" aria-hidden />
                  <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                    {s.tag}
                  </div>
                  <h3 className="text-h2 font-medium leading-tight text-ink">
                    {s.title}
                  </h3>
                  <p className="text-body text-text-muted">{s.body}</p>
                  <div className="mt-auto pt-4 font-mono text-mono-label uppercase tracking-[1.2px] text-ink group-hover:text-amber">
                    {s.cta} →
                  </div>
                </Link>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — keep the prior section intact. */}
      <section className="border-b border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
               How it works
            </div>
            <h2 className="mt-3 max-w-3xl text-display font-medium leading-[1.05] tracking-[-1px] text-ink">
              You ship. We hold. We fulfill.
            </h2>
            <p className="mt-4 max-w-2xl text-body-lg text-text-muted">
              The path from international shelf to American front door, in
              four steps.
            </p>
          </FadeUp>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <FadeUp key={s.label} delay={i * 90}>
                <div className="flex h-full flex-col gap-3 rounded-md border border-line bg-white p-6">
                  <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-amber">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="text-h3 font-medium text-ink">{s.label}</div>
                  <p className="text-body-sm text-text-muted">{s.body}</p>
                </div>
              </FadeUp>
            ))}
          </div>

          <div className="mt-10">
            <Link
              href="/how-it-works"
              className="font-mono text-mono-label uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
            >
              Walk the whole flow →
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-[84rem] gap-16 px-8 py-24 lg:grid-cols-[1fr_2fr]">
          <FadeUp>
            <div>
              <div className="font-mono text-mono-eyebrow uppercase text-amber">
                [04] FAQ
              </div>
              <h2 className="mt-3 text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
                The questions everyone asks first.
              </h2>
              <p className="mt-4 text-body text-text-muted">
                Don&apos;t see your question?{" "}
                <Link
                  href="/contact"
                  className="font-medium text-amber underline-offset-4 hover:underline"
                >
                  Drop us a line.
                </Link>
              </p>
            </div>
          </FadeUp>

          <FadeUp delay={80}>
            {/* Native <details> + <summary> — zero JS, accessible by
                default, and animates the open/close transition with
                pure CSS. */}
            <div className="flex flex-col divide-y divide-line border-y border-line">
              {FAQS.map((f) => (
                <details
                  key={f.q}
                  className="group py-5 transition-colors hover:bg-cream-soft/40"
                >
                  <summary className="flex cursor-pointer items-start justify-between gap-6 list-none [&::-webkit-details-marker]:hidden">
                    <span className="text-body font-medium text-ink">
                      {f.q}
                    </span>
                    <span
                      aria-hidden
                      className="mt-1 inline-block shrink-0 font-mono text-text-muted transition-transform duration-300 ease-out group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-body-sm text-text-muted">{f.a}</p>
                </details>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/faq">
                <Button variant="outline" withArrow>
                  View full FAQ
                </Button>
              </Link>
              <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                18 answers across 6 topics
              </span>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* FINAL CTA */}
      <section>
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <div className="flex flex-col items-start gap-6 rounded-md border border-line bg-ink px-10 py-14 text-text-inv md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="max-w-xl text-h2 font-medium leading-tight tracking-[-0.5px]">
                  Ready to ship from the U.S. without being in the U.S.?
                </h2>
                <p className="mt-3 max-w-lg text-body text-text-inv/80">
                  Create an account in two minutes. Onboarding is four
                  days, end-to-end.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/signup">
                  <Button variant="amber" size="lg" withArrow>
                    Get started
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button variant="outline" size="lg">
                    Talk to sales
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

function Stat({ value, label, amber }: { value: string; label: string; amber?: boolean }) {
  return (
    <div className="border-line p-12 [&:not(:last-child)]:border-r">
      <div
        className={
          "text-[40px] font-medium leading-none tabular-nums tracking-[-1.2px] " +
          (amber ? "text-amber" : "text-ink")
        }
      >
        {value}
      </div>
      <div className="mt-3 font-mono text-mono-label uppercase text-text-muted">{label}</div>
    </div>
  );
}

const SERVICES: ReadonlyArray<{
  Icon: typeof Package;
  tag: string;
  title: string;
  body: string;
  cta: string;
  href: string;
}> = [
  // Ordering rule: 3PL fulfillment is the MAIN service and must always
  // appear first across every public surface (services page, homepage
  // cards, nav). Personal shopping + integrations follow.
  {
    Icon: Package,
    tag: "For sellers",
    title: "3PL fulfillment",
    body: "Hold inventory in our U.S. warehouse. We pick, pack, and ship every order in days — no U.S. business required.",
    cta: "Become a vendor",
    href: "/services#3pl",
  },
  {
    Icon: ShoppingBag,
    tag: "For buyers",
    title: "Personal shopping",
    body: "Paste any U.S. store URL. We buy it for you, consolidate, and ship to anywhere your address forwarder can't.",
    cta: "Open a request",
    href: "/shopper",
  },
  // {
  //   Icon: Zap,
  //   tag: "For partners",
  //   title: "Integrations",
  //   body: "Shopify, WooCommerce, REST API — plug us into the store you already run.",
  //   cta: "See connectors",
  //   href: "/integrations",
  // },
];

const STEPS: ReadonlyArray<{ label: string; body: string }> = [
  {
    label: "Onboard",
    body: "Sign up, submit KYC, and fund the wallet. Average path is four working days.",
  },
  {
    label: "Send a pallet",
    body: "Declare a Pre-Shipment Notice, pay onboarding, and ship to our facility.",
  },
  {
    label: "We receive + label",
    body: "Same day your pallet lands, every unit is weighed, photographed, and stocked.",
  },
  {
    label: "Pick, pack, ship",
    body: "Orders flow in via the API. We ship locally — most orders within six working hours.",
  },
];

// Eight high-converting questions for the homepage. The deeper, 18-question
// version lives at /faq, surfaced via the "View full FAQ" CTA below.
const FAQS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Do I need a U.S. business or address to sign up?",
    a: "No. USA Errands exists precisely so sellers outside the U.S. can ship into the U.S. without setting up a local entity. We hold and dispatch inventory under our own roof; you keep ownership and we keep the storefront.",
  },
  {
    q: "How long does onboarding take?",
    a: "Most vendors are live in four working days, end-to-end: create an account, complete KYC, fund the wallet, and submit a Pre-Shipment Notice. Faster paths are common once your KYC documents are clean.",
  },
  {
    q: "How is pricing structured?",
    a: "Two halves. Monthly storage is billed per box-tier (Small, Medium, Large, X-Large, or Pallet). Fulfillment is a flat base + per-additional-unit pick-and-pack fee. Shipping is at-cost via the carrier you pick. No hidden per-touch surcharges.",
  },
  {
    q: "What can I store and ship?",
    a: "Almost any legal, non-hazardous consumer good. We can't accept weapons, explosives, restricted medical products, counterfeits, or unpermitted perishables. The full prohibited-products list is in the Vendor Agreement.",
  },
  {
    q: "What happens if a shipment is damaged or lost?",
    a: "Every PSN is photographed and counted at receive — we catch damage before it enters stock. Lost or damaged outbound parcels are filed against the carrier and your wallet is credited the same day the claim resolves, with the full audit trail on your ledger.",
  },
  {
    q: "How do storage fees work — do they keep running if I don't sell?",
    a: "Yes. Storage is billed on the 1st of each month regardless of sales velocity, against the wallet balance you've prefunded. Quarterly storage-tier audits identify boxes you can consolidate or downsize to lower your monthly bill.",
  },
  
  {
    q: "I just want to buy something from a U.S. store — can you help?",
    a: "That's exactly what the personal-shopper service does. Paste a U.S. retailer URL, we verify it, you pay an intake fee, we buy it, consolidate, and ship to your address worldwide. Orders over $1,000 require government-issued ID and a wire transfer for compliance.",
  },
];
