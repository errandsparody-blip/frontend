/**
 * /faq — long-form FAQ surface.
 *
 * Eighteen questions grouped into six categories. Every answer is
 * intentionally first-person and decisive: it tells a prospect or buyer
 * what will happen, not what might. Anything that requires legal
 * precision (refund timing, abandoned-inventory windows, prohibited
 * products, etc.) defers to the live Vendor Agreement so the canonical
 * wording stays in one place.
 *
 * Native <details> elements — zero client JS, screen-reader friendly,
 * keyboard-accessible by default. Matches the homepage FAQ pattern so
 * the muscle memory carries between surfaces.
 *
 * If you add or remove questions, also update the homepage "X answers
 * across N topics" badge so prospects don't see a stale count.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { FadeUp } from "@/components/marketing/fade-up";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "FAQ — USA Errands",
  description:
    "Eighteen direct answers about onboarding, storage, fulfillment, returns, payments, and how we handle your inventory at USA Errands.",
};

interface QA {
  q: string;
  a: string;
}

interface FAQGroup {
  id: string;
  eyebrow: string;
  title: string;
  blurb: string;
  items: ReadonlyArray<QA>;
}

const FAQ_GROUPS: ReadonlyArray<FAQGroup> = [
  {
    id: "account-onboarding",
    eyebrow: "Account & onboarding",
    title: "Getting on the platform",
    blurb:
      "The first four working days set the pattern for everything else. Here's exactly how you go from signing up to receiving your first shipment.",
    items: [
      {
        q: "Who can sign up as a vendor?",
        a: "Any registered business — sole proprietor, LLC, limited company, partnership — based anywhere in the world. You do not need a U.S. entity, U.S. tax ID, or U.S. address. We hold inventory in our name at our U.S. facility on your behalf; ownership stays with you and we keep an auditable record of every unit.",
      },
      {
        q: "What documents do I need to complete KYC?",
        a: "A copy of your business registration document, a government-issued ID for the primary account holder, and one optional proof of business address. The KYC review usually clears within 24 hours of submission. Until KYC is approved you can browse the portal but cannot submit Pre-Shipment Notices or fund the wallet.",
      },
      {
        q: "How long does end-to-end onboarding take?",
        a: "Most vendors are live in four working days: 30 minutes to sign up, up to 24 hours for KYC review, same-day wallet funding, then the warehouse receive turnaround on your first inbound shipment (typically 24 to 72 hours from arrival). After your first Pre-Shipment Notice clears, subsequent shipments process on the same window.",
      },
    ],
  },
  {
    id: "storage-inventory",
    eyebrow: "Storage & inventory",
    title: "How we store your boxes",
    blurb:
      "Storage is the bulk of what you'll pay us every month. We bill it transparently, by box-tier, and we'll proactively help you reclassify when a tier change saves you money.",
    items: [
      {
        q: "How do storage tiers work and what do they cost?",
        a: "Each inbound box is assigned a tier — Small, Medium, Large, X-Large, or Pallet — based on declared and verified dimensions. Storage is billed monthly per tier; current rates are published live on the Pricing page and inside your portal's Boxes-by-tier guide. The Pallet tier is negotiable because dimensions vary, so we quote it per pallet at intake.",
      },
      {
        q: "When are storage fees billed?",
        a: "Automatically on the first day of every calendar month, debited against your wallet balance. Storage continues to accrue whether or not inventory sells. If your wallet balance is short, fulfillment is paused first and inventory is held; we never silently push you negative.",
      },
      {
        q: "Can my storage tier change after I've shipped in?",
        a: "Yes. We run quarterly storage-tier audits and may reclassify inventory if actual usage materially differs from what you declared on the Pre-Shipment Notice — usually because the boxes are smaller than expected, which lowers your bill. You will see the new tier on the next invoice with the reason logged on the audit trail. Reclassifications that increase your bill are notified before they take effect.",
      },
    ],
  },
  {
    id: "fulfillment-shipping",
    eyebrow: "Fulfillment & shipping",
    title: "Picking, packing, and shipping orders",
    blurb:
      "Once an order is in our pick queue, the next milestone is a tracking number landing in your inbox. Here's what's between those two moments.",
    items: [
      {
        q: "How fast do orders ship?",
        a: "Most domestic U.S. orders ship the same working day if they're submitted before our daily cut-off; orders submitted later ship the next working day. We do not guarantee carrier transit times — those depend on the courier you select and conditions on the lane.",
      },
      {
        q: "Which carriers can I use?",
        a: "All major U.S. carriers — USPS, UPS, FedEx, DHL — through our integrated rate engine. You pick the carrier per order or set a default in your shipping preferences. Shipping is billed at the carrier's live rate plus our flat fulfillment fee; you see the breakdown before the label is purchased.",
      },
      
    ],
  },
  {
    id: "returns",
    eyebrow: "Returns",
    title: "Returns, inspections, and refunds",
    blurb:
      "Returns are opt-in. If you turn them on, here's exactly how a buyer's package gets back into your sellable stock — or doesn't.",
    items: [
      {
        q: "Do you handle returns for me?",
        a: "Yes, if you enable returns on your vendor settings. Buyers (or you) initiate an RMA inside the portal, we generate a prepaid inbound label, the parcel comes back to us, and we inspect, photograph, and either re-stock or quarantine it depending on condition. You can act on the inspection result inside the returns dashboard.",
      },
      {
        q: "What happens to a damaged return?",
        a: "We photograph the unit at receive, log the condition, and pause it in the Returns Inspection state. You decide whether to discard, donate, recycle, or have it shipped to a U.S. address you provide. We charge handling at the published rate for whichever route you pick; no decision happens silently.",
      },
      
    ],
  },
  {
    id: "payments",
    eyebrow: "Payments & wallet",
    title: "Funding, billing, and refunds",
    blurb:
      "The wallet is the single source of truth for every dollar that flows between you and us. Every fee, refund, and reconciliation has a ledger entry you can audit.",
    items: [
      {
        q: "How does the wallet work?",
        a: "USA Errands runs on a prepaid wallet. You top it up via Stripe (card or ACH) or wire transfer; every fee — onboarding, storage, fulfillment, shipping, returns handling — debits from that balance. The wallet ledger is append-only: every entry is timestamped, immutable, and exportable to CSV from the Statements page.",
      },
      {
        q: "What payment methods are supported?",
        a: "Vendors top up the wallet via Stripe-backed cards, ACH transfers, or wire. Personal-shopper buyers pay through Stripe Checkout for orders under $1,000; orders at or above $1,000 require a verified government-issued ID and a wire transfer for compliance.",
      },
      {
        q: "What happens if my wallet balance runs out?",
        a: "Fulfillment is suspended first — pending orders sit in the queue and your dashboard shows a clear top-up banner. Storage billing continues to accrue against the wallet (it can run negative on this specific line). If the balance stays overdue past the notice period in the Vendor Agreement, we'll work with you on a remediation plan before any inventory action.",
      },
    ],
  },
  {
    id: "trust-operations",
    eyebrow: "Trust & operations",
    title: "Security, compliance, and what-ifs",
    blurb:
      "The rare-but-important questions. The full canonical answers live in the Vendor Agreement — these are the quick versions so you don't have to scroll.",
    items: [
      {
        q: "What can't I store with you?",
        a: "Weapons or firearm-related items, explosives, hazardous materials, restricted medical products, counterfeit goods, unpermitted perishables, and anything illegal to sell or ship within the U.S. We reserve the right to refuse, quarantine, or dispose of prohibited inventory at the vendor's expense. The full list is in Section 3 of the Vendor Agreement.",
      },
      {
        q: "What happens to my inventory if I cancel or stop responding?",
        a: "Either side can terminate the agreement at any time. Outstanding fees, removal costs, and unpaid storage stay your responsibility. Storage fees keep accruing until inventory leaves the facility. Inventory may be considered abandoned after the notice period — typically 30 days of unpaid balance or sustained unreachability — and we may dispose, liquidate, recycle, or donate it. Section 11 of the Vendor Agreement has the full procedure.",
      },
      {
        q: "How is my data and inventory secured?",
        a: "All web traffic is TLS-encrypted, sensitive payment flows go directly to Stripe (we never see card PANs), and operational access to the inventory database is role-scoped with full audit logging. Inventory is held in a monitored facility with photo-on-receive evidence for every PSN. The Security page on the marketing site has the longer write-up.",
      },
    ],
  },
];

export default function FaqPage(): JSX.Element {
  return (
    <div className="bg-cream">
      {/* HERO */}
      <section className="border-b border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-20">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              [FAQ] Eighteen questions
            </div>
            <h1 className="mt-3 max-w-3xl text-display font-medium leading-[1.05] tracking-[-1px] text-ink">
              Everything we get asked, answered.
            </h1>
            <p className="mt-4 max-w-2xl text-body-lg text-text-muted">
              Pricing, onboarding, returns, security, and the small print —
              organized so you can find what you need in under a minute. For
              the official wording on storage, billing, and termination,
              the{" "}
              <Link
                href="/legal/vendor-agreement"
                className="font-medium text-amber underline-offset-4 hover:underline"
              >
                Vendor Agreement
              </Link>{" "}
              is the canonical source.
            </p>

            <div className="mt-8 flex flex-wrap gap-2 font-mono text-mono-label uppercase tracking-[1.2px]">
              {FAQ_GROUPS.map((g) => (
                <a
                  key={g.id}
                  href={`#${g.id}`}
                  className="rounded-sm border border-line bg-white px-3 py-1.5 text-text-muted transition-colors hover:border-amber/60 hover:text-amber"
                >
                  {g.title}
                </a>
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      {/* GROUPS */}
      {FAQ_GROUPS.map((group, gi) => (
        <section
          key={group.id}
          id={group.id}
          className={`border-b border-line ${gi % 2 === 1 ? "bg-cream-soft" : ""}`}
        >
          <div className="mx-auto grid max-w-[84rem] gap-12 px-8 py-20 lg:grid-cols-[1fr_2fr]">
            <FadeUp>
              <div>
                <div className="font-mono text-mono-eyebrow uppercase text-amber">
                  {group.eyebrow}
                </div>
                <h2 className="mt-3 text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
                  {group.title}
                </h2>
                <p className="mt-4 text-body text-text-muted">{group.blurb}</p>
              </div>
            </FadeUp>

            <FadeUp delay={80}>
              <div className="flex flex-col divide-y divide-line border-y border-line">
                {group.items.map((item) => (
                  <details
                    key={item.q}
                    className="group py-5 transition-colors hover:bg-cream-soft/40"
                  >
                    <summary className="flex cursor-pointer items-start justify-between gap-6 list-none [&::-webkit-details-marker]:hidden">
                      <span className="text-body font-medium text-ink">
                        {item.q}
                      </span>
                      <span
                        aria-hidden
                        className="mt-1 inline-block shrink-0 font-mono text-text-muted transition-transform duration-300 ease-out group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <p className="mt-3 text-body-sm text-text-muted">{item.a}</p>
                  </details>
                ))}
              </div>
            </FadeUp>
          </div>
        </section>
      ))}

      {/* CTA */}
      <section>
        <div className="mx-auto max-w-[84rem] px-8 py-20">
          <FadeUp>
            <div className="flex flex-col items-start gap-6 rounded-md border border-line bg-ink px-10 py-12 text-text-inv md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="max-w-xl text-h2 font-medium leading-tight tracking-[-0.5px]">
                  Didn&apos;t see your question?
                </h2>
                <p className="mt-3 max-w-lg text-body text-text-inv/80">
                  We answer support within one working day. Vendor questions
                  can also go through the portal once you&apos;re signed in.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/contact">
                  <Button variant="amber" size="lg" withArrow>
                    Contact us
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button variant="outline" size="lg">
                    Get started
                  </Button>
                </Link>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>
    </div>
  );
}
