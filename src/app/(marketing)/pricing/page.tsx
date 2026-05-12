import Link from "next/link";

import { Button } from "@/components/ui/button";
import { STORAGE_TIERS } from "@/lib/storage-tiers";

export const metadata = {
  title: "Pricing — USA Errands",
  description:
    "Pay only for what you use. Onboarding, storage, fulfillment, and shipping — all itemised, all transparent, all reconciled to a single wallet ledger.",
};

// Pull the tier rows from the shared module so the marketing page and
// the vendor PSN cards can never drift. We map to the legacy shape this
// file's <Td> components expect.
const ONBOARDING = STORAGE_TIERS.map((t) => ({
  tier: t.tier,
  size: `Up to ${t.sizeInches}`,
  stocking: t.stocking,
  storage: t.storage,
  total: t.total,
}));

const FULFILLMENT = [
  { label: "Pick & pack", first: "$2.50", additional: "$0.75 each" },
  { label: "Returns handling", first: "$5.00", additional: "—" },
  { label: "Insurance (optional)", first: "1.5% of declared value", additional: "—" },
];

export default function PricingPage() {
  return (
    <>
      {/* HERO */}
      <section className="border-b border-line bg-cream">
        <div className="mx-auto max-w-[84rem] px-8 py-24 lg:py-32">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 03 ] Pricing</div>
          <h1 className="mt-3 max-w-3xl text-display-lg font-medium leading-[1.05] tracking-[-1.2px] text-ink">
            One wallet.
            <br />
            <span className="text-amber">Every cost on the same line.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-body-lg text-text-muted">
            We don&apos;t sell plans. You pay only when you onboard a box, store it, fulfil an order, or take
            a return. Every charge writes a ledger row tied to the originating object.
          </p>
        </div>
      </section>

      {/* HEADLINE NUMBERS */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-[84rem] grid-cols-2 lg:grid-cols-4">
          <Stat value="$0" label="Setup fee" />
          <Stat value="$0" label="Monthly minimum" />
          <Stat value="$0" label="Per-SKU fee" amber />
          <Stat value="2.9% + 30¢" label="Wallet top-up (Stripe)" />
        </div>
      </section>

      {/* ONBOARDING + STORAGE — table */}
      <section className="mx-auto max-w-[84rem] px-8 py-20">
        <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 04 ] Onboarding · Storage</div>
        <h2 className="mt-3 max-w-3xl text-display font-medium leading-[1.05] tracking-[-0.8px] text-ink">
          Per-box, per-tier. Honest about what fits where.
        </h2>
        <p className="mt-5 max-w-2xl text-body-lg text-text-muted">
          The onboarding fee is charged once when the PSN is submitted; storage rolls monthly on the 1st.
          Pallets are negotiated — talk to us.
        </p>

        <div className="mt-10 overflow-hidden rounded-md border border-line bg-white">
          <table className="min-w-full">
            <thead className="bg-ink">
              <tr>
                <Th>Tier</Th>
                <Th>Up to</Th>
                <Th align="right">Stocking</Th>
                <Th align="right">First-month storage</Th>
                <Th align="right">Total at submit</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ONBOARDING.map((row) => (
                <tr key={row.tier}>
                  <Td strong>{row.tier}</Td>
                  <Td muted>{row.size}</Td>
                  <Td num>{row.stocking}</Td>
                  <Td num>{row.storage}</Td>
                  <Td num strong>
                    {row.total}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 max-w-2xl font-mono text-mono-label uppercase text-text-subtle">
          Subsequent months: same as the first-month storage column. Storage is charged on the 1st of
          every month per active SKU bucket.
        </p>
      </section>

      {/* FULFILLMENT */}
      <section className="border-y border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-20">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
            <div>
              <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 05 ] Fulfillment</div>
              <h2 className="mt-3 text-display font-medium leading-[1.05] tracking-[-0.8px] text-ink">
                Pick, pack, ship. Pay per order, not per plan.
              </h2>
              <p className="mt-5 max-w-md text-body-lg text-text-muted">
                Your shipping cost is whatever the carrier charges us, plus a 10% markup. No
                volume-tier hide-and-seek.
              </p>
            </div>
            <div className="overflow-hidden rounded-md border border-line bg-white">
              <table className="min-w-full">
                <thead className="bg-ink">
                  <tr>
                    <Th>Service</Th>
                    <Th align="right">First unit</Th>
                    <Th align="right">Additional</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {FULFILLMENT.map((r) => (
                    <tr key={r.label}>
                      <Td strong>{r.label}</Td>
                      <Td num>{r.first}</Td>
                      <Td num muted>
                        {r.additional}
                      </Td>
                    </tr>
                  ))}
                  <tr>
                    <Td strong>Carrier shipping</Td>
                    <Td num colSpan={2}>
                      Carrier rate + 10%
                    </Td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* WORKED EXAMPLE */}
      <section className="mx-auto max-w-[84rem] px-8 py-20">
        <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 06 ] Worked example</div>
        <h2 className="mt-3 max-w-3xl text-display font-medium leading-[1.05] tracking-[-0.8px] text-ink">
          A small apparel vendor&apos;s first month.
        </h2>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <ExampleCard
            title="Inbound shipment"
            subtitle="3 small + 1 medium box"
            rows={[
              { label: "3 × Small onboarding", value: "$6.00" },
              { label: "1 × Medium onboarding", value: "$4.00" },
            ]}
            total={{ label: "PSN total", value: "$10.00" }}
          />
          <ExampleCard
            title="Monthly storage"
            subtitle="42 active SKU buckets · all small"
            rows={[
              { label: "42 × Small monthly", value: "$42.00" },
            ]}
            total={{ label: "Storage", value: "$42.00" }}
          />
          <ExampleCard
            title="Fulfillment (60 orders)"
            subtitle="Avg 1.4 units per order"
            rows={[
              { label: "60 × pick & pack base", value: "$150.00" },
              { label: "24 additional units", value: "$18.00" },
              { label: "60 × USPS Priority avg", value: "$478.20" },
              { label: "+10% markup", value: "$47.82" },
            ]}
            total={{ label: "Fulfillment", value: "$694.02" }}
          />
          <ExampleCard
            title="Returns (3)"
            subtitle="2 restocked, 1 disposed"
            rows={[
              { label: "3 × returns handling", value: "$15.00" },
              { label: "Refunds (REVERSAL)", value: "−$84.00" },
            ]}
            total={{ label: "Net", value: "−$69.00" }}
          />
        </div>

        <div className="mt-8 rounded-md border-l-4 border-amber bg-amber/10 px-6 py-5">
          <div className="font-mono text-mono-label uppercase text-amber">Month total</div>
          <div className="mt-1 text-display font-medium tabular-nums tracking-[-0.8px] text-ink">
            $677.02
          </div>
          <p className="mt-2 max-w-2xl text-body-sm text-text-muted">
            Every line above is a real ledger entry — you can export the whole month as CSV from your
            wallet page.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-y border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-20">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 07 ] FAQ</div>
          <h2 className="mt-3 text-display font-medium leading-[1.05] tracking-[-0.8px] text-ink">
            Common questions.
          </h2>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <Faq q="Do you take a percentage of my sales?">
              No. We charge for physical work — receiving, storage, picking, packing, shipping. Your
              revenue is yours.
            </Faq>
            <Faq q="What happens if my wallet hits zero?">
              New orders fail with insufficient_funds — your inventory stays put. Storage past due flips
              the wallet to STORAGE_OVERDUE; we email you 30 days before any action is taken.
            </Faq>
            <Faq q="Do you handle customs?">
              You ship DDP (delivery duty paid) into our warehouse. Once inside the U.S., we treat it as
              domestic. We don&apos;t act as importer of record.
            </Faq>
            <Faq q="Can I get money back from the wallet?">
              Yes. Email support; we move funds back to your originating Stripe / Wise / Payoneer
              account. Rare, takes 2–5 business days.
            </Faq>
            <Faq q="What carriers do you ship with?">
              USPS, UPS, FedEx by default — all surfaced as quote options at order create. We can plug in
              regional carriers on request.
            </Faq>
            <Faq q="Is there a long-term contract?">
              No. You can pull your inventory anytime. We charge the outbound onboarding-equivalent fee
              to reverse the receiving.
            </Faq>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[84rem] px-8 py-24">
        <div className="rounded-md border border-line bg-ink p-12 text-text-inv">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 08 ] Get started</div>
          <h2 className="mt-3 max-w-2xl text-display font-medium leading-[1.05] tracking-[-0.8px]">
            Get a wallet, fund it, ship a PSN.
          </h2>
          <p className="mt-5 max-w-xl text-body-lg text-text-inv/70">
            Forty seconds to sign up. The first inbound box is on you.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup">
              <Button variant="amber" size="lg" withArrow>
                Create your account
              </Button>
            </Link>
            <Link href="/how-it-works">
              <Button variant="ghost" size="lg" className="text-text-inv hover:bg-white/10">
                See how it works
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

// ===========================================================================

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

function Th({
  align,
  children,
}: {
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <th
      className={
        "px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-[1.6px] text-text-inv " +
        (align === "right" ? "text-right" : "text-left")
      }
    >
      {children}
    </th>
  );
}

function Td({
  children,
  num,
  strong,
  muted,
  colSpan,
}: {
  children: React.ReactNode;
  num?: boolean;
  strong?: boolean;
  muted?: boolean;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={
        "px-4 py-3 align-middle " +
        (num ? "text-right font-mono tabular-nums " : "") +
        (strong ? "font-medium text-ink " : muted ? "text-text-muted " : "text-text ") +
        "text-body-sm"
      }
    >
      {children}
    </td>
  );
}

function ExampleCard({
  title,
  subtitle,
  rows,
  total,
}: {
  title: string;
  subtitle: string;
  rows: Array<{ label: string; value: string }>;
  total: { label: string; value: string };
}) {
  return (
    <div className="rounded-md border border-line bg-white p-6">
      <div className="text-h2 font-semibold text-ink">{title}</div>
      <div className="mt-1 font-mono text-mono-label uppercase text-text-muted">{subtitle}</div>
      <dl className="mt-5 space-y-2 font-mono text-body-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between">
            <dt className="text-text-muted">{r.label}</dt>
            <dd className="text-text">{r.value}</dd>
          </div>
        ))}
      </dl>
      <hr className="my-4 border-line" />
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-mono-label uppercase text-ink">{total.label}</span>
        <span className="font-mono text-h2 font-semibold tabular-nums text-ink">{total.value}</span>
      </div>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-white p-6">
      <h3 className="text-h3 font-semibold text-ink">{q}</h3>
      <p className="mt-3 text-body-sm text-text-muted">{children}</p>
    </div>
  );
}
