import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata = {
  title: "How it works — USA Errands",
  description:
    "Ship inventory once, sell forever. We handle receiving, storage, fulfillment, and returns from a U.S. warehouse so your customers get next-day delivery.",
};

export default function HowItWorksPage() {
  return (
    <>
      {/* HERO */}
      <section className="border-b border-line bg-cream">
        <div className="mx-auto max-w-[84rem] px-8 py-24 lg:py-32">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 02 ] How it works</div>
          <h1 className="mt-3 max-w-3xl text-display-lg font-medium leading-[1.05] tracking-[-1.2px] text-ink">
            You ship. We hold.
            <br />
            <span className="text-amber">They get it tomorrow.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-body-lg text-text-muted">
            The path from international shelf to American front door, in four steps. No U.S. business
            required, no inventory financing, no per-item handling fee surprises.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/signup">
              <Button variant="amber" size="lg" withArrow>
                Start onboarding
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline" size="lg">
                See pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* THE FOUR STEPS */}
      <section className="mx-auto max-w-[84rem] px-8 py-24">
        <Step
          n="01"
          title="Onboard your account"
          duration="~10 minutes"
          body="Sign up, verify your business through Stripe Identity, and accept the vendor agreement. Your wallet is provisioned the moment you sign up — fund it once and we draw against it as costs land."
          bullets={[
           
          ]}
        >
          <MockTimeline
            entries={[
              { time: "0:00", label: "Account created" },
              { time: "0:02", label: "Email verified" },
              { time: "0:04", label: "MFA enrolled" },
              { time: "0:08", label: "KYC submitted to Stripe" },
              { time: "0:10", label: "Vendor active", strong: true },
            ]}
          />
        </Step>

        <Step
          n="02"
          title="Send us your inventory"
          duration="2–7 days, depending on origin"
          body="Pre-declare every shipment with a Pre-Shipment Notice (PSN). Pay the onboarding fee at submit; we lock in the SKU layout before the box leaves your warehouse. Operators receive against your PSN line-by-line."
          bullets={[
            
          ]}
        >
          <MockPsn
            lines={[
              { product: "T-shirt — Black, M", declared: 100, received: 100 },
              { product: "T-shirt — Black, L", declared: 80, received: 78 },
              { product: "Cap — Logo", declared: 50, received: 50 },
            ]}
          />
        </Step>

        <Step
          n="03"
          title="We hold it. You sell it."
          duration="Ongoing"
          body="Storage billed monthly per SKU bucket per tier. Stock counts update in real time as orders ship. Low-balance alerts fire 30 days before storage drains your wallet — never a surprise overdraft."
          bullets={[
            
          ]}
        >
          <MockKpiTrio />
        </Step>

        <Step
          n="04"
          title="One click ships every order"
          duration="Same day in, next day out"
          body="Submit an order via the dashboard or your e-commerce integration. Stock + funds are reserved atomically — insufficient anything rolls back the whole submit. We pick, pack, weigh, and hand to the carrier; you watch the timeline."
          bullets={[
            
          ]}
        >
          <MockOrderTimeline />
        </Step>
      </section>

      {/* RETURNS — half-step */}
      <section className="border-y border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-20">
          <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-start">
            <div>
              <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 05 ] Returns</div>
              <h2 className="mt-3 text-display font-medium leading-[1.05] tracking-[-0.8px] text-ink">
                When something comes back, you&apos;re already covered.
              </h2>
            </div>
            <div className="space-y-4 text-body-lg text-text">
              <p>
                Open an RMA from the order detail page. We email the customer a prepaid inbound label,
                inspect the package on arrival, and split the units into{" "}
                <strong>restocked / damaged / disposed</strong> with an audit-logged refund net of the
                restock fee.
              </p>
              <p className="text-body text-text-muted">
                The original FULFILLMENT ledger entry is never modified. The refund lands as a separate
                REVERSAL row tied to the order id. Your books always reconcile.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PERSONAL SHOPPER — half-step. A separate product line; placed here
          so anyone reading the seller flow above also sees the buyer-direct
          option. Distinct visual treatment (amber-tinted card) so it doesn't
          read as another seller step. */}
      <section className="mx-auto max-w-[84rem] px-8 py-20">
        <div className="rounded-md border border-amber/40 bg-amber/5 p-12">
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-start">
            <div>
              <div className="font-mono text-mono-eyebrow uppercase text-amber">
                [ Sidebar ] Personal Shopper
              </div>
              <h2 className="mt-3 text-display font-medium leading-[1.05] tracking-[-0.8px] text-ink">
                Not a seller? <span className="text-amber">We&apos;ll shop for you.</span>
              </h2>
              <p className="mt-5 max-w-md text-body-lg text-text-muted">
                Paste any U.S. retail link, pay an upfront estimate, and we buy the items + ship to
                you internationally. No account needed.
              </p>
              <div className="mt-6">
                <Link href="/shopper">
                  <Button variant="amber" size="lg" withArrow>
                    Open a shopper request
                  </Button>
                </Link>
              </div>
            </div>
            <ul className="grid gap-3 text-body-sm text-text-2">
              <li className="flex gap-3">
                <span className="mt-2 inline-block h-px w-4 shrink-0 bg-amber" aria-hidden />
                <span>Submit your items, pay upfront via Stripe — items.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-2 inline-block h-px w-4 shrink-0 bg-amber" aria-hidden />
                <span>Track procurement and chat with us in a private thread (magic-link, no password).</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-2 inline-block h-px w-4 shrink-0 bg-amber" aria-hidden />
                <span>
                  Once procured, we reconcile actual cost + shipping: pay the small difference, or get a
                  refund if it came in under estimate.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-2 inline-block h-px w-4 shrink-0 bg-amber" aria-hidden />
                <span>Tracking number lands in your thread the moment it ships.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[84rem] px-8 py-24">
        <div className="rounded-md border border-line bg-ink p-12 text-text-inv">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 06 ] Get started</div>
          <h2 className="mt-3 max-w-2xl text-display font-medium leading-[1.05] tracking-[-0.8px]">
            Stand up your U.S. fulfillment in an afternoon.
          </h2>
          <p className="mt-5 max-w-xl text-body-lg text-text-inv/70">
            Sign up, verify, fund the wallet, send your first PSN. We&apos;ll do the rest.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup">
              <Button variant="amber" size="lg" withArrow>
                Create your account
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="ghost" size="lg" className="text-text-inv hover:bg-white/10">
                See pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

// ===========================================================================
// Step block — eyebrow + heading + body + bullets, paired with a visual.
// ===========================================================================
function Step({
  n,
  title,
  duration,
  body,
  bullets,
  children,
}: {
  n: string;
  title: string;
  duration: string;
  body: string;
  bullets: string[];
  children: React.ReactNode;
}) {
  return (
    <article className="grid gap-12 border-b border-line py-16 lg:grid-cols-[1fr_1fr] lg:gap-16 [&:last-of-type]:border-b-0">
      <div>
        <div className="font-mono text-mono-eyebrow uppercase text-amber">[ {n} ] {title}</div>
        <h3 className="mt-3 text-h1 font-semibold tracking-[-0.4px] text-ink">{title}</h3>
        <div className="mt-2 font-mono text-mono-label uppercase text-text-subtle">{duration}</div>
        <p className="mt-5 max-w-md text-body-lg text-text-muted">{body}</p>
        <ul className="mt-6 space-y-2 text-body-sm text-text-2">
          {bullets.map((b) => (
            <li key={b} className="flex gap-3">
              <span className="mt-2 inline-block h-px w-4 shrink-0 bg-amber" aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>{children}</div>
    </article>
  );
}

// ===========================================================================
// Mock visuals — kept simple, all flat shapes, LEDGR-styled.
// ===========================================================================

function MockTimeline({ entries }: { entries: Array<{ time: string; label: string; strong?: boolean }> }) {
  return (
    <div className="rounded-md border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <span className="font-mono text-mono-label uppercase text-text-muted">Onboarding · live trace</span>
        <span className="font-mono text-mono-label uppercase text-success">success</span>
      </div>
      <ol className="space-y-2 px-5 py-5 font-mono text-body-sm">
        {entries.map((e, i) => (
          <li key={i} className="flex items-baseline gap-4 border-l-2 border-line pl-4">
            <span className="w-12 shrink-0 text-text-subtle">{e.time}</span>
            <span className={e.strong ? "font-semibold text-ink" : "text-text"}>{e.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MockPsn({ lines }: { lines: Array<{ product: string; declared: number; received: number }> }) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <span className="font-mono text-mono-label uppercase text-text-muted">PSN-7C8A · receiving</span>
        <span className="rounded-xs bg-amber/10 px-2 py-0.5 font-mono text-mono-label uppercase text-amber">
          partially received
        </span>
      </div>
      <table className="min-w-full">
        <thead className="bg-ink">
          <tr>
            <th className="px-4 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[1.6px] text-text-inv">
              Line
            </th>
            <th className="px-4 py-2 text-right font-mono text-[10px] font-semibold uppercase tracking-[1.6px] text-text-inv">
              Declared
            </th>
            <th className="px-4 py-2 text-right font-mono text-[10px] font-semibold uppercase tracking-[1.6px] text-text-inv">
              Received
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {lines.map((l, i) => {
            const ok = l.received === l.declared;
            return (
              <tr key={i}>
                <td className="px-4 py-3 text-body-sm text-text">{l.product}</td>
                <td className="px-4 py-3 text-right font-mono text-body-sm tabular-nums text-text">
                  {l.declared}
                </td>
                <td
                  className={
                    "px-4 py-3 text-right font-mono text-body-sm tabular-nums " +
                    (ok ? "text-text" : "text-error")
                  }
                >
                  {l.received}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MockKpiTrio() {
  return (
    <div className="grid grid-cols-3 gap-3">
      <KpiTile label="Active" value="12,480" sub="units" tone="ink" />
      <KpiTile label="Reserved" value="184" sub="units" tone="amber" />
      <KpiTile label="This month" value="$1,420" sub="storage burn" tone="muted" />
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "ink" | "amber" | "muted";
}) {
  return (
    <div className="rounded-md border border-line bg-white p-5">
      <div className="font-mono text-mono-label uppercase text-text-muted">{label}</div>
      <div
        className={
          "mt-2 text-h1 font-semibold tabular-nums tracking-[-0.4px] " +
          (tone === "amber" ? "text-amber" : tone === "muted" ? "text-text-muted" : "text-ink")
        }
      >
        {value}
      </div>
      <div className="mt-1 font-mono text-mono-label uppercase text-text-subtle">{sub}</div>
    </div>
  );
}

function MockOrderTimeline() {
  const events = [
    { time: "T+0:00", label: "Order submitted", state: "done" },
    { time: "T+0:00", label: "Stock reserved · wallet debited", state: "done" },
    { time: "T+0:32", label: "Carrier label purchased", state: "done" },
    { time: "T+1:14", label: "Picked + packed", state: "done" },
    { time: "T+3:42", label: "Handed to USPS", state: "done" },
    { time: "T+1d", label: "Out for delivery", state: "active" },
    { time: "—", label: "Delivered", state: "future" },
  ] as const;
  return (
    <div className="rounded-md border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <span className="font-mono text-mono-label uppercase text-text-muted">ORDER #1042</span>
        <span className="rounded-xs bg-info/10 px-2 py-0.5 font-mono text-mono-label uppercase text-info">
          out for delivery
        </span>
      </div>
      <ol className="space-y-3 px-5 py-5 font-mono text-body-sm">
        {events.map((e, i) => (
          <li key={i} className="flex items-baseline gap-4">
            <span
              className={
                "w-2 h-2 shrink-0 rounded-full " +
                (e.state === "done" ? "bg-success" : e.state === "active" ? "bg-amber" : "bg-line-strong")
              }
              aria-hidden
            />
            <span className="w-16 shrink-0 text-text-subtle">{e.time}</span>
            <span className={e.state === "future" ? "text-text-subtle" : "text-text"}>{e.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
