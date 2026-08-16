import { ArrowRight, Package, ShoppingBag } from "lucide-react";
import Link from "next/link";

import { FadeUp } from "@/components/marketing/fade-up";
import { HeroArches } from "@/components/marketing/hero-arches";
import { HeroBackdrop } from "@/components/marketing/hero-backdrop";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <>
      {/* HERO — warm, editorial, centered. A soft tan gradient stage,
          a status pill, a large headline, one pill CTA, and a row of
          arched image frames that carry the AI-rendered fulfillment
          journey (parcel → warehouse → doorstep → global → customer).
          The arches bleed off the bottom of the section into the stats
          bar, so the section itself has no bottom padding. */}
      <section className="relative -mt-16 overflow-hidden bg-[linear-gradient(135deg,#cabda5_0%,#b6a58c_52%,#a8967c_100%)]">
        <HeroBackdrop />
        <div className="relative z-10 mx-auto max-w-[84rem] px-5 pt-36 sm:px-8 sm:pt-44">
          <FadeUp>
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/15 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[1.2px] text-white/90 backdrop-blur">
                Now shipping to the U.S. and Canada
              </div>
              <h1 className="mt-10 text-display-xl font-medium leading-[1.02] tracking-[-1.5px] text-[#fbf8f2]">
                Ship from anywhere.
                <br />
                Sell to America.
              </h1>
              <p className="mx-auto mt-8 max-w-lg text-body-lg text-[#f2ece1]">
                Hold your inventory in our U.S. warehouse, or let our
                personal-shopper desk buy from any U.S. store on your behalf.
                One platform.
              </p>
              <div className="mt-10 flex flex-col items-center gap-4">
                <Link
                  href="/signup"
                  className="group inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-body font-medium text-text-inv shadow-1 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-ink-elev"
                >
                  Get started
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-1"
                    aria-hidden
                  />
                </Link>
                <Link
                  href="/shopper"
                  className="text-body-sm text-white/85 underline-offset-4 hover:text-white hover:underline"
                >
                  Just want to buy from a U.S. store? Open a personal shopper request →
                </Link>
              </div>
            </div>
          </FadeUp>
        </div>

        {/* Arched image row — each arch fades up one-by-one (stagger
            handled inside the component). Lifted above the backdrop. */}
        <div className="relative z-10">
          <HeroArches />
        </div>
      </section>

      {/* STATS BAR — a floating rounded panel on warm cream, matching the
          hero's soft, editorial feel. */}
      <section className="bg-cream">
        <div className="mx-auto max-w-[84rem] px-5 py-16 sm:px-8">
          <FadeUp>
            <div className="grid grid-cols-2 overflow-hidden rounded-3xl border border-line bg-cream-soft shadow-1 lg:grid-cols-4">
              <Stat value="6000" label="Inventory value managed" />
              <Stat value="75" label="Vendors trust the system" />
              <Stat value="4.2 days" label="Average inbound onboarding" amber />
              <Stat value="99.97%" label="Uptime. Not rounded" />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* SERVICES — three cards, the spine of the marketing site. */}
      <section className="bg-cream">
        <div className="mx-auto max-w-[84rem] px-8 pb-24">
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
                  className="group flex h-full flex-col gap-4 rounded-3xl border border-line bg-white p-8 shadow-1 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-2"
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-amber/12">
                    <s.Icon className="h-5 w-5 text-amber" aria-hidden />
                  </span>
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

      {/* HOW IT WORKS — soft warm tint band echoing the hero stage. */}
      <section className="bg-[linear-gradient(180deg,#efe7d7_0%,#e7dcc6_100%)]">
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
                <div className="flex h-full flex-col gap-3 rounded-3xl border border-white/60 bg-white/70 p-6 shadow-1 backdrop-blur-sm transition-transform duration-300 ease-out hover:-translate-y-1.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber font-mono text-[13px] font-semibold text-white">
                    {i + 1}
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
      <section className="bg-cream">
        <div className="mx-auto grid max-w-[84rem] gap-16 px-8 py-24 lg:grid-cols-[1fr_2fr]">
          <FadeUp>
            <div>
              <div className="font-mono text-mono-eyebrow uppercase text-amber">
                FAQ
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
            <div className="flex flex-col divide-y divide-line overflow-hidden rounded-3xl border border-line bg-white px-6 shadow-1">
              {FAQS.map((f) => (
                <details
                  key={f.q}
                  className="group py-5 transition-colors hover:bg-cream-soft/50"
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
                <Button
                  variant="outline"
                  withArrow
                  className="rounded-full font-sans font-medium normal-case tracking-normal"
                >
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

      {/* FINAL CTA — dark ink panel for a strong closing contrast. */}
      <section className="bg-cream">
        <div className="mx-auto max-w-[84rem] px-8 pb-24">
          <FadeUp>
            <div className="flex flex-col items-start gap-6 rounded-[28px] bg-ink px-10 py-16 text-text-inv shadow-1 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="max-w-xl text-h2 font-medium leading-tight tracking-[-0.5px]">
                  Ready to ship from the U.S. without being in the U.S.?
                </h2>
                <p className="mt-3 max-w-lg text-body text-text-inv/80">
                  Account registration takes approximately two minutes.
                  End-to-end onboarding is completed within four business days.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/signup">
                  <Button
                    variant="amber"
                    size="lg"
                    withArrow
                    className="rounded-full font-sans font-medium normal-case tracking-normal"
                  >
                    Get started
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button
                    variant="outline"
                    size="lg"
                    className="rounded-full font-sans font-medium normal-case tracking-normal"
                  >
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
  // Ordering rule: Fulfillment is the MAIN service and must always
  // appear first across every public surface (services page, homepage
  // cards, nav). Personal shopping follows.
  {
    Icon: Package,
    tag: "For sellers",
    title: "Storage & Fulfillment",
    body: "Hold inventory in our U.S. warehouse. We pick, pack, and ship every order in hours — no U.S. business required.",
    cta: "Become a vendor",
    href: "/services#fulfillment",
  },
  {
    Icon: ShoppingBag,
    tag: "For buyers",
    title: "Personal shopping",
    body: "Paste any U.S. store URL. We buy it for you, consolidate, and ship to anywhere your address forwarder can't.",
    cta: "Open a request",
    href: "/shopper",
  },
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
