import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Integrations — USA Errands",
  description:
    "Stripe for payments, EasyPost for carriers, Smarty for address verification, Stripe Identity for KYC. Plus the e-commerce connectors on the runway.",
};

interface IntegrationCard {
  name: string;
  category: string;
  blurb: string;
  detail: string;
  status: "live" | "soon" | "request";
}

const LIVE: IntegrationCard[] = [
  {
    name: "Stripe",
    category: "Payments",
    blurb: "Wallet top-up via Payment Intents.",
    detail:
      "Top-up through Stripe Elements. The wallet credit happens in our webhook handler — Stripe is authoritative on whether money moved. Replay-safe via webhook_events unique constraint.",
    status: "live",
  },
  {
    name: "Stripe Identity",
    category: "KYC",
    blurb: "Government-issued ID + selfie verification.",
    detail:
      "We never see your ID. Stripe Identity returns a verified status; our system flips the vendor to APPROVED on receipt. Webhook signature verified with HMAC-SHA256.",
    status: "live",
  },
  {
    name: "EasyPost",
    category: "Carriers",
    blurb: "USPS, UPS, FedEx — single API.",
    detail:
      "Rate quoting at order create, label purchase at admin label-buy, tracking webhooks for IN_TRANSIT / DELIVERED transitions. Reassessment cron writes a delta if billed weight diverges from quoted.",
    status: "live",
  },
  {
    name: "Smarty",
    category: "Address",
    blurb: "USPS-grade address validation.",
    detail:
      "Every order address verified pre-create. PO Boxes flagged as NEEDS_VERIFICATION. International addresses currently rejected (US-domestic v1).",
    status: "live",
  },
  {
    name: "Resend",
    category: "Email",
    blurb: "Transactional email delivery.",
    detail:
      "Verify email, password reset, MFA enrolment, low balance, deposit receipt, order shipped, return refunded — every transactional email in the platform. SPF + DKIM + DMARC required on the sending domain.",
    status: "live",
  },
  {
    name: "Sentry",
    category: "Observability",
    blurb: "Error + performance monitoring.",
    detail:
      "5xx exceptions captured with PII-scrubbed request context. OpenTelemetry traces wrap every HTTP request, DB query, and external API call. /v1/health/* spans dropped to keep the budget honest.",
    status: "live",
  },
  {
    name: "Postgres",
    category: "Database",
    blurb: "Source of truth.",
    detail:
      "Append-only audit, ledger, and order events at the trigger level. CHECK constraints enforce non-negative quantities, sign-consistent ledger entries, and the order state-machine. Per-session statement_timeout = 10s.",
    status: "live",
  },
  {
    name: "Redis",
    category: "Cache + queue",
    blurb: "Throttler + ephemeral state.",
    detail:
      "Rate-limit counters for the Throttler, future home of the email + cron job queues. Vended via your provider of choice — we tested Upstash and Railway.",
    status: "live",
  },
];

const SOON: IntegrationCard[] = [
  {
    name: "Shopify",
    category: "E-commerce",
    blurb: "Auto-create orders from your store.",
    detail:
      "OAuth install, webhook → order create, fulfillment status sync. Tracking pushes back to Shopify so the customer sees the same status you do.",
    status: "soon",
  },
  {
    name: "WooCommerce",
    category: "E-commerce",
    blurb: "REST API integration.",
    detail:
      "Same shape as Shopify — order create on a WC webhook, fulfillment + tracking pushed back. Bring your own domain.",
    status: "soon",
  },
  {
    name: "Amazon MCF / Seller Central",
    category: "Marketplace",
    blurb: "Multi-channel fulfillment.",
    detail:
      "Read orders from Seller Central, ship from our warehouse, push tracking back. Useful for sellers who want one fulfilment path across Amazon + their own store.",
    status: "soon",
  },
  {
    name: "QuickBooks Online",
    category: "Accounting",
    blurb: "Sync the ledger as journal entries.",
    detail:
      "Daily sync of FULFILLMENT, STORAGE, ONBOARDING, REVERSAL ledger entries to QBO journal entries. Single accountant-friendly view at month-end.",
    status: "soon",
  },
];

const REQUEST: IntegrationCard[] = [
  {
    name: "TikTok Shop",
    category: "Marketplace",
    blurb: "Vote for it.",
    detail: "Email support@myusaerrands.com if this is a blocker for you.",
    status: "request",
  },
  {
    name: "BigCommerce",
    category: "E-commerce",
    blurb: "Vote for it.",
    detail: "Most mid-market sellers we hear from already have an EasyPost-shaped flow we can adapt.",
    status: "request",
  },
  {
    name: "NetSuite",
    category: "ERP",
    blurb: "Vote for it.",
    detail: "If your org runs NetSuite for inventory + financials, we can wire to SuiteScript.",
    status: "request",
  },
];

export default function IntegrationsPage() {
  return (
    <>
      {/* HERO */}
      <section className="border-b border-line bg-cream">
        <div className="mx-auto max-w-[84rem] px-8 py-24 lg:py-32">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 04 ] Integrations</div>
          <h1 className="mt-3 max-w-3xl text-display-lg font-medium leading-[1.05] tracking-[-1.2px] text-ink">
            Plugs in to
            <br />
            <span className="text-amber">what you already use.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-body-lg text-text-muted">
            We don&apos;t reinvent payments, carriers, or address validation — we wire to the best tools and
            stay out of the way. The list of live partners is short by design.
          </p>
        </div>
      </section>

      {/* LIVE */}
      <section className="mx-auto max-w-[84rem] px-8 py-20">
        <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 05 ] Live integrations</div>
        <h2 className="mt-3 text-display font-medium leading-[1.05] tracking-[-0.8px] text-ink">
          Wired up. Day one.
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LIVE.map((c) => (
            <Card key={c.name} integ={c} />
          ))}
        </div>
      </section>

      {/* COMING SOON */}
      <section className="border-y border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-20">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 06 ] On the runway</div>
          <h2 className="mt-3 text-display font-medium leading-[1.05] tracking-[-0.8px] text-ink">
            Shipping over the next quarter.
          </h2>
          <p className="mt-5 max-w-2xl text-body-lg text-text-muted">
            E-commerce + accounting are the two categories most pilot vendors ask about. Here&apos;s the
            short list of what&apos;s next.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {SOON.map((c) => (
              <Card key={c.name} integ={c} />
            ))}
          </div>
        </div>
      </section>

      {/* REQUEST */}
      <section className="mx-auto max-w-[84rem] px-8 py-20">
        <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 07 ] Vote for it</div>
        <h2 className="mt-3 max-w-3xl text-display font-medium leading-[1.05] tracking-[-0.8px] text-ink">
          Tell us what would unblock you.
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {REQUEST.map((c) => (
            <Card key={c.name} integ={c} compact />
          ))}
        </div>
        <p className="mt-8 max-w-2xl text-body text-text-muted">
          Email{" "}
          <a href="mailto:support@myusaerrands.com" className="text-amber underline-offset-2 hover:underline">
            support@myusaerrands.com
          </a>{" "}
          with the integration name + your monthly volume. Three vendors with the same ask is enough to
          schedule it.
        </p>
      </section>

     

      {/* CTA */}
      <section className="mx-auto max-w-[84rem] px-8 py-24">
        <div className="rounded-md border border-line bg-ink p-12 text-text-inv">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 09 ] Get started</div>
          <h2 className="mt-3 max-w-2xl text-display font-medium leading-[1.05] tracking-[-0.8px]">
            Plug in, ship, breathe.
          </h2>
          <p className="mt-5 max-w-xl text-body-lg text-text-inv/70">
            Sign up, fund the wallet, hit our API or use the dashboard.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup">
              <Button variant="amber" size="lg" withArrow>
                Create your account
              </Button>
            </Link>
            <Link href="/security">
              <Button variant="ghost" size="lg" className="text-text-inv hover:bg-white/10">
                See security posture
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

// ===========================================================================

function Card({ integ, compact }: { integ: IntegrationCard; compact?: boolean }) {
  const STATUS_TONE: Record<IntegrationCard["status"], string> = {
    live: "bg-success/10 text-success",
    soon: "bg-amber/10 text-amber",
    request: "bg-line-strong/30 text-text-muted",
  };
  const STATUS_LABEL: Record<IntegrationCard["status"], string> = {
    live: "Live",
    soon: "Coming",
    request: "Vote",
  };

  return (
    <article className="flex flex-col rounded-md border border-line bg-white p-6">
      <div className="flex items-center justify-between">
        <div className="font-mono text-mono-label uppercase text-text-muted">{integ.category}</div>
        <span
          className={
            "rounded-xs px-2 py-0.5 font-mono text-[10px] uppercase tracking-[1.4px] " +
            STATUS_TONE[integ.status]
          }
        >
          {STATUS_LABEL[integ.status]}
        </span>
      </div>
      <h3 className="mt-3 text-h2 font-semibold tracking-[-0.2px] text-ink">{integ.name}</h3>
      <p className="mt-2 text-body-sm font-medium text-text">{integ.blurb}</p>
      {!compact ? <p className="mt-3 text-body-sm text-text-muted">{integ.detail}</p> : null}
    </article>
  );
}
