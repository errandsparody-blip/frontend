import { Mail, MapPin, Phone, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";

import { FadeUp } from "@/components/marketing/fade-up";

export const metadata = {
  title: "Contact — USA Errands",
  description:
    "Talk to USA Errands. Sales, support, partnerships, and the integrations + security resources sellers ask for most.",
};

export default function ContactPage() {
  return (
    <>
      {/* HERO */}
      <section className="border-b border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              [01] Contact
            </div>
            <h1 className="mt-4 max-w-3xl text-display font-medium leading-[1.04] tracking-[-1.2px] text-ink">
              Real humans. Same-day replies.
            </h1>
            <p className="mt-6 max-w-2xl text-body-lg text-text-muted">
              Whether you&apos;re a seller sizing the warehouse, a buyer
              with a question about a shopper request, or a partner with
              an integration to ship — write to the right inbox and the
              right person picks up.
            </p>
          </FadeUp>
        </div>
      </section>

      {/* INBOXES */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              [02] Pick your inbox
            </div>
            <h2 className="mt-3 max-w-3xl text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
              The fastest way to reach the team that can actually help.
            </h2>
          </FadeUp>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {INBOXES.map((box, i) => (
              <FadeUp key={box.email} delay={i * 70}>
                <a
                  href={`mailto:${box.email}`}
                  className="group flex h-full flex-col gap-3 rounded-md border border-line bg-white p-8 transition-transform duration-300 ease-out hover:-translate-y-1 hover:shadow-2"
                >
                  <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-amber">
                    {box.label}
                  </div>
                  <div className="text-h3 font-medium text-ink">
                    {box.title}
                  </div>
                  <p className="text-body-sm text-text-muted">{box.body}</p>
                  <div className="mt-auto pt-4 font-mono text-body-sm text-ink group-hover:text-amber">
                    {box.email} →
                  </div>
                </a>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* OFFICE / DETAILS */}
      <section className="border-b border-line bg-cream-soft">
        <div className="mx-auto grid max-w-[84rem] gap-12 px-8 py-24 lg:grid-cols-[1fr_1fr]">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              [03] The address
            </div>
            <h2 className="mt-3 text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
              One warehouse. One inbox. One ledger.
            </h2>
            <p className="mt-4 text-body text-text-muted">
              The whole platform is run from a single U.S. facility. Pop in
              by appointment if you&apos;re local — we&apos;ll show you the
              floor and the dashboard side by side.
            </p>
          </FadeUp>

          <FadeUp delay={80}>
            <ul className="flex flex-col gap-6">
              {DETAILS.map(({ Icon, title, lines }) => (
                <li key={title} className="flex gap-4">
                  <Icon
                    className="mt-1 h-5 w-5 shrink-0 text-amber"
                    aria-hidden
                  />
                  <div>
                    <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                      {title}
                    </div>
                    <div className="mt-1 flex flex-col gap-0.5 text-body text-ink">
                      {lines.map((l) => (
                        <span key={l}>{l}</span>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </FadeUp>
        </div>
      </section>

      {/* INTEGRATIONS + SECURITY (folded out of the top nav) */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-[84rem] px-8 py-24">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              [04] More resources
            </div>
            <h2 className="mt-3 max-w-3xl text-h2 font-medium leading-tight tracking-[-0.5px] text-ink">
              Looking for integration docs or security details?
            </h2>
            <p className="mt-4 max-w-2xl text-body text-text-muted">
              They live on their own pages so the top of the marketing site
              stays uncluttered. Both are linked here so buyers and sellers
              with technical questions can dive in.
            </p>
          </FadeUp>

        
        </div>
      </section>
    </>
  );
}

const INBOXES: ReadonlyArray<{
  label: string;
  title: string;
  body: string;
  email: string;
}> = [
  {
    label: "Sales",
    title: "Onboarding a vendor",
    body: "Pallet sizes, volume estimates, integration questions, contract pricing. We reply within one business day.",
    email: "",
  },
  {
    label: "Support",
    title: "Order or shopper request issue",
    body: "Stuck on a PSN receive, a shopper thread, or a checkout. Include the reference number and we'll dig in.",
    email: "",
  },
  {
    label: "Partnerships",
    title: "Integrations + payouts",
    body: "Built a storefront, a carrier route, or a payout corridor you think we should connect to. Pitch us.",
    email: "",
  },
];

const DETAILS: ReadonlyArray<{
  Icon: typeof Mail;
  title: string;
  lines: ReadonlyArray<string>;
}> = [
  {
    Icon: Mail,
    title: "General inbox",
    lines: ["hello@myusaerrands.com"],
  },
  {
    Icon: Phone,
    title: "Phone (admin office)",
    lines: ["+1 (305) 555-0185", "Mon – Fri · 09:00 – 18:00 ET"],
  },
  {
    Icon: MapPin,
    title: "Warehouse + admin office",
    lines: [
      "USA Errands Fulfillment",
      "1500 NW 70th Ave, Suite 200",
      "Miami, FL 33126 · United States",
    ],
  },
];
