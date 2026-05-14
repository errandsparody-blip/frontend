import Link from "next/link";

import { BoxDimensionsHero } from "@/components/marketing/box-dimensions-hero";
import { Button } from "@/components/ui/button";
import {
  cubicFeetFrom,
  cubicInchesFrom,
  FALLBACK_PALLET_POLICY,
  FALLBACK_TIERS,
  formatCentsAsDollars,
  PALLET_POLICY_NOTES,
  STORAGE_TIER_ORDER,
  TIER_METADATA,
  type StorageTierDimensions,
} from "@/lib/storage-tiers";

export const metadata = {
  title: "Pricing — USA Errands",
  description:
    "Pay only for what you use. Onboarding, storage, fulfillment, and shipping — all itemised, all transparent, all reconciled to a single wallet ledger.",
};

// Marketing /pricing is a server-rendered public page (no auth, no
// React Query). We can't hit the authenticated /v1/fees/storage-tiers
// endpoint here, so we render the FALLBACK_TIERS seed defaults — they
// match the values an admin would see on a freshly seeded environment.
// The authoritative numbers always come from the admin config; if
// finance changes pricing, the marketing page will lag until next
// deploy. Vendors in the portal see live values immediately.

/** Inches → centimetres rounded to the nearest whole cm. */
function inToCm(inches: number): number {
  return Math.round(inches * 2.54);
}

/** "L × W × H in" string for a dim record. */
function inLabel(dims: StorageTierDimensions): string {
  return `${dims.lengthIn} × ${dims.widthIn} × ${dims.heightIn}`;
}

/** "L × W × H cm" string for a dim record. */
function cmLabel(dims: StorageTierDimensions): string {
  return `${inToCm(dims.lengthIn)} × ${inToCm(dims.widthIn)} × ${inToCm(dims.heightIn)} cm`;
}

interface PerBoxRow {
  tier: string;
  inches: string;
  cm: string;
  cubicInches: string;
  cubicFeet: string;
  stocking: string;
  firstMonth: string;
  monthly: string;
}

const PER_BOX_TIERS: PerBoxRow[] = STORAGE_TIER_ORDER.filter((t) => t !== "PALLET").map((tier) => {
  const o = FALLBACK_TIERS.onboarding[tier];
  const dims = FALLBACK_TIERS.dimensions?.[tier];
  // Pallets are rendered separately; this filter guarantees `dims` and
  // numeric `o` are present, but we narrow defensively anyway.
  if (!dims || ("negotiated" in o && o.negotiated === true)) {
    return {
      tier: TIER_METADATA[tier].label,
      inches: "—",
      cm: "—",
      cubicInches: "—",
      cubicFeet: "—",
      stocking: "Negotiable",
      firstMonth: "Negotiable",
      monthly: "Negotiable",
    };
  }
  const ci = cubicInchesFrom(dims);
  const cf = cubicFeetFrom(dims);
  return {
    tier: TIER_METADATA[tier].label,
    inches: `${inLabel(dims)} in`,
    cm: cmLabel(dims),
    cubicInches: ci != null ? ci.toLocaleString("en-US") : "—",
    cubicFeet: cf != null ? `${cf.toFixed(2)} ft³` : "—",
    stocking: formatCentsAsDollars((o as { stockingCents: number }).stockingCents),
    firstMonth: formatCentsAsDollars((o as { firstMonthStorageCents: number }).firstMonthStorageCents),
    monthly: formatCentsAsDollars(FALLBACK_TIERS.monthlyStorage[tier]),
  };
});

/** Pallet sub-table data, sourced from the same fallback. */
const PALLET_DIMS = FALLBACK_TIERS.dimensions?.PALLET ?? {
  lengthIn: 48,
  widthIn: 40,
  heightIn: 60,
  maxWeightOz: 24000,
};

const PALLET_INFO = {
  inches: `${PALLET_DIMS.lengthIn} × ${PALLET_DIMS.widthIn} inches base`,
  cm: `${inToCm(PALLET_DIMS.lengthIn)} × ${inToCm(PALLET_DIMS.widthIn)} cm`,
  maxHeight: `${PALLET_DIMS.heightIn} inches total (including pallet)`,
  approxVolume: `~${cubicFeetFrom(PALLET_DIMS) ?? 0} ft³`,
  monthly: formatCentsAsDollars(FALLBACK_TIERS.monthlyStorage.PALLET),
};

/** Max boxes per pallet rows for the "uniform tier" sub-table. */
const PALLET_MAX_BOXES = (Object.keys(FALLBACK_PALLET_POLICY.maxBoxesPerPallet) as Array<
  keyof typeof FALLBACK_PALLET_POLICY.maxBoxesPerPallet
>).map((tier) => {
  const dims = FALLBACK_TIERS.dimensions?.[tier];
  return {
    label: TIER_METADATA[tier].label,
    sizeHint: dims ? `${inLabel(dims)}` : "",
    maxBoxes: FALLBACK_PALLET_POLICY.maxBoxesPerPallet[tier],
  };
});

const FULFILLMENT = [
  { label: "Pick & pack", first: "$2.99", additional: "$0.99 each" },
  { label: "Returns handling", first: "$6.00", additional: "—" },
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

      {/* PER-BOX TIERS — published storage-tier table */}
      <section className="mx-auto max-w-[84rem] px-8 py-20">
        <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 04 ] Storage tiers</div>
        <h2 className="mt-3 max-w-3xl text-display font-medium leading-[1.05] tracking-[-0.8px] text-ink">
          Per-box, per-tier. Pick the smallest box your inventory fits into.
        </h2>
        <p className="mt-5 max-w-3xl text-body-lg text-text-muted">
          Receiving &amp; inventory-setup is a one-time fee charged at PSN submit (stocking + the first
          month&apos;s storage). Monthly storage rolls on the 1st of every month for each active SKU
          bucket. Pallet pricing is a separate line further down.
        </p>

        {/* Visual scale reference — four box tiers + pallet drawn to
            scale next to a 5'9" person silhouette so vendors can
            picture how big each tier is before they commit. */}
        <div className="mt-10">
          <BoxDimensionsHero />
        </div>

        {/* <div className="mt-10 overflow-x-auto rounded-md border border-line bg-white">
          <table className="min-w-full">
            <thead className="bg-ink">
              <tr>
                <Th>Tier</Th>
                <Th>Dimensions (in)</Th>
                <Th>Dimensions (cm)</Th>
                <Th align="right">Cubic in</Th>
                <Th align="right">Cubic ft</Th>
                <Th align="right">Receiving &amp; setup</Th>
                <Th align="right">First month</Th>
                <Th align="right">Monthly</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {PER_BOX_TIERS.map((row) => (
                <tr key={row.tier}>
                  <Td strong>{row.tier}</Td>
                  <Td muted>{row.inches}</Td>
                  <Td muted>{row.cm}</Td>
                  <Td num muted>
                    {row.cubicInches}
                  </Td>
                  <Td num muted>
                    {row.cubicFeet}
                  </Td>
                  <Td num strong>
                    {row.stocking}
                  </Td>
                  <Td num>{row.firstMonth}</Td>
                  <Td num strong>
                    {row.monthly}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div> */}

        {/* Re-tier callout — top-of-mind warning that mirrors the
            storage tier guide modal's "Important" block. */}
        <div className="mt-8 rounded-md border-l-4 border-amber bg-amber/10 px-6 py-5">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">Important</div>
          <p className="mt-2 max-w-3xl text-body-sm text-text">
            Match your actual shipment dimensions to the storage tier you select. If inventory received
            exceeds the declared tier, USA Errands reserves the right to re-tier the line on receipt
            and the fee difference is automatically debited from your wallet. Accurate box measurements
            help avoid delays and discrepancy charges.
          </p>
        </div>
      </section>

      {/* PALLET STORAGE */}
      <section className="border-y border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-20">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 05 ] Pallet storage</div>
          <h2 className="mt-3 max-w-3xl text-display font-medium leading-[1.05] tracking-[-0.8px] text-ink">
            Standard U.S. pallet — billed per pallet-slot.
          </h2>
          <p className="mt-5 max-w-3xl text-body-lg text-text-muted">
            Static pallet storage for properly palletized, shrink-wrapped, and stable inventory. Each
            pallet is treated as an individually billed storage unit. Receiving &amp; setup fees still
            apply to every box on the pallet — the rate below is storage only.
          </p>

          <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="overflow-x-auto rounded-md border border-line bg-white">
              <table className="min-w-full">
                <thead className="bg-ink">
                  <tr>
                    <Th>Pallet type</Th>
                    <Th>Dimensions (in)</Th>
                    <Th>Dimensions (cm)</Th>
                    <Th align="right">Max height</Th>
                    <Th align="right">Approx. volume</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  <tr>
                    <Td strong>Standard pallet</Td>
                    <Td muted>{PALLET_INFO.inches}</Td>
                    <Td muted>{PALLET_INFO.cm}</Td>
                    <Td num muted>
                      {PALLET_INFO.maxHeight}
                    </Td>
                    <Td num muted>
                      {PALLET_INFO.approxVolume}
                    </Td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-md border border-line bg-white">
              <table className="min-w-full">
                <thead className="bg-ink">
                  <tr>
                    <Th>Storage type</Th>
                    <Th align="right">Monthly</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  <tr>
                    <Td strong>Standard static pallet</Td>
                    <Td num strong>
                      {PALLET_INFO.monthly}/month
                    </Td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Pallet policy — uniform tier rule + max box counts. */}
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <PolicyCard
              title="Pallet box rules"
              bullets={[...PALLET_POLICY_NOTES.boxRules]}
            />
            <PolicyCard
              title="When pallet pricing applies"
              bullets={[...PALLET_POLICY_NOTES.whenItApplies]}
            />
          </div>

          <div className="mt-6 overflow-hidden rounded-md border border-line bg-white">
            <table className="min-w-full">
              <thead className="bg-ink">
                <tr>
                  <Th>Box tier</Th>
                  <Th>Box dimensions</Th>
                  <Th align="right">Approx. max boxes per pallet</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {PALLET_MAX_BOXES.map((row) => (
                  <tr key={row.label}>
                    <Td strong>{row.label}</Td>
                    <Td muted>{row.sizeHint}</Td>
                    <Td num strong>
                      ~{row.maxBoxes} boxes
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 max-w-3xl text-caption text-text-muted">
            Actual allowable quantities vary with stacking stability, weight distribution, warehouse
            safety requirements, and pallet condition. USA Errands reserves the right to reject or
            reconfigure unsafe pallets. If a pallet reaches capacity, ship another — each pallet is
            billed and tracked as its own storage unit.
          </p>

          <div className="mt-8 rounded-md border-l-4 border-ink bg-white px-6 py-5">
            <div className="font-mono text-mono-eyebrow uppercase text-ink">
              Receiving &amp; setup fees still apply
            </div>
            <p className="mt-2 max-w-3xl text-body-sm text-text">
              {PALLET_POLICY_NOTES.receivingFeesNote}
            </p>
          </div>
        </div>
      </section>

      {/* FULFILLMENT */}
      <section className="border-y border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-20">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
            <div>
              <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 06 ] Fulfillment</div>
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
        <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 07 ] Worked example</div>
        <h2 className="mt-3 max-w-3xl text-display font-medium leading-[1.05] tracking-[-0.8px] text-ink">
          A small apparel vendor&apos;s first month.
        </h2>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <ExampleCard
            title="Inbound shipment"
            subtitle="3 small + 1 medium box"
            rows={[
              { label: "3 × Small receiving & setup", value: "$63.00" },
              { label: "1 × Medium receiving & setup", value: "$36.00" },
            ]}
            total={{ label: "PSN total", value: "$99.00" }}
          />
          <ExampleCard
            title="Monthly storage"
            subtitle="42 active SKU buckets · all small"
            rows={[
              { label: "42 × Small monthly ($9.00)", value: "$378.00" },
            ]}
            total={{ label: "Storage", value: "$378.00" }}
          />
          <ExampleCard
            title="Fulfillment (60 orders)"
            subtitle="Avg 1.4 units per order"
            rows={[
              { label: "60 × pick & pack base", value: "$179.40" },
              { label: "24 additional units", value: "$23.76" },
              { label: "60 × USPS Priority avg", value: "$478.20" },
              { label: "+10% markup", value: "$47.82" },
            ]}
            total={{ label: "Fulfillment", value: "$729.18" }}
          />
          <ExampleCard
            title="Returns (3)"
            subtitle="2 restocked, 1 disposed"
            rows={[
              { label: "3 × returns handling", value: "$18.00" },
              { label: "Refunds (REVERSAL)", value: "−$84.00" },
            ]}
            total={{ label: "Net", value: "−$66.00" }}
          />
        </div>

        <div className="mt-8 rounded-md border-l-4 border-amber bg-amber/10 px-6 py-5">
          <div className="font-mono text-mono-label uppercase text-amber">Month total</div>
          <div className="mt-1 text-display font-medium tabular-nums tracking-[-0.8px] text-ink">
            $1,140.18
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
          <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 08 ] FAQ</div>
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
          <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 09 ] Get started</div>
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

/**
 * Small bulleted card used in the pallet policy block. Bullets are
 * deliberately short — full prose lives in the Vendor Agreement.
 */
function PolicyCard({
  title,
  bullets,
}: {
  title: string;
  bullets: string[];
}) {
  return (
    <div className="rounded-md border border-line bg-white p-6">
      <h3 className="text-h3 font-semibold text-ink">{title}</h3>
      <ul className="mt-4 flex flex-col gap-2">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-body-sm text-text">
            <span aria-hidden className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
