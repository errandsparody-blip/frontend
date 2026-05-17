import { Mail, MapPin, Phone } from "lucide-react";

import { FadeUp } from "@/components/marketing/fade-up";

export const metadata = {
  title: "Contact — USA Errands",
  description:
    "Talk to USA Errands. Sales, support, partnerships, and the security resources sellers ask for most.",
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
              with a question about a shopper request — write to the right inbox and the
              right person picks up.
            </p>
          </FadeUp>
        </div>
      </section>

      {/* INBOXES */}
    

      {/* OFFICE / DETAILS */}
      <section className="border-b border-line bg-cream-soft">
        <div className="mx-auto grid max-w-[84rem] gap-12 px-8 py-24 lg:grid-cols-[1fr_1fr]">
          <FadeUp>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">
              [03] The address
            </div>
            
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
    body: "Pallet sizes, volume estimates, contract pricing. We reply within one business day.",
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
    title: "Payouts + carriers",
    body: "Built a carrier route or a payout corridor you think we should connect to. Pitch us.",
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
