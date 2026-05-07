import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Security — USA Errands",
  description:
    "Tenant isolation, immutable audit, AES-256-GCM encryption, mandatory MFA, and a published threat model. The security posture as it actually exists in the code.",
};

export default function SecurityPage() {
  return (
    <>
      {/* HERO */}
      <section className="border-b border-line bg-cream">
        <div className="mx-auto max-w-[84rem] px-8 py-24 lg:py-32">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 05 ] Security</div>
          <h1 className="mt-3 max-w-3xl text-display-lg font-medium leading-[1.05] tracking-[-1.2px] text-ink">
            Built for vendor money.
            <br />
            <span className="text-amber">Audited at every layer.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-body-lg text-text-muted">
            We hold your inventory and we hold your money. The platform is engineered like that&apos;s true —
            with append-only ledgers at the database level, mandatory multi-factor auth, tenant
            isolation enforced four ways, and a published threat model.
          </p>
        </div>
      </section>

      {/* FOUR PILLARS */}
      <section className="mx-auto max-w-[84rem] px-8 py-20">
        <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 06 ] Four pillars</div>
        <h2 className="mt-3 max-w-3xl text-display font-medium leading-[1.05] tracking-[-0.8px] text-ink">
          Defence in depth, not theatre.
        </h2>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Pillar
            n="01"
            title="Tenant isolation (IDOR)"
            summary="Vendor A cannot read or mutate Vendor B's data. Period."
            mechanisms={[
              "Every vendor-scoped query filters by vendor_id at the service layer",
              "TenantGuard enforces the JWT's vendor_id matches the URL parameter on every controller",
              "404 (NotFound) on cross-tenant access — never 403 — so we don't confirm existence",
              "DB-level trigger refuses any order_lines insert/update where the line's vendor_id ≠ the parent order's",
              "IDOR test suite runs in CI and blocks merge on any failure",
            ]}
          />
          <Pillar
            n="02"
            title="Append-only audit trail"
            summary="Every privileged action lands in an immutable row that even the application user cannot delete."
            mechanisms={[
              "audit_log_entries: PG trigger raises EXCEPTION on UPDATE or DELETE",
              "ledger_entries: same trigger + sign-consistency CHECK (DEPOSIT > 0, charges < 0)",
              "order_events: same trigger; carrier + admin + cron events all captured",
              "wallets.balance_cents = sum(ledger_entries.amount_cents) — reconciled nightly",
              "Audit log viewer in the admin console emits its own audit row when accessed",
            ]}
          />
          <Pillar
            n="03"
            title="Encryption + secrets"
            summary="AES-256-GCM for sensitive fields. Argon2id for passwords. Hashed-at-rest for tokens."
            mechanisms={[
              "MFA secrets encrypted at rest with AES-256-GCM (32-byte master key, never logged)",
              "Argon2id password hashing tuned for ~250ms verify on production hardware",
              "Refresh tokens, password reset tokens, recovery codes, invitation tokens — all sha256-hashed at rest",
              "JWT signed with a 256-bit secret; rotation procedure documented in the runbook",
              "HIBP k-anonymity check on every signup + password reset (fail-open with logged warning)",
            ]}
          />
          <Pillar
            n="04"
            title="Authentication"
            summary="Mandatory two-factor. Refresh-token rotation with reuse detection."
            mechanisms={[
              "TOTP (RFC 6238) MFA required on every account; 10 single-use recovery codes generated at enrol",
              "Refresh tokens rotate on every use; presenting a previously-rotated hash revokes every session in the user's family",
              "Account lockout after 5 failures with exponential back-off (10s → 5min)",
              "Step-up re-auth required for charges over a configurable threshold (default $500)",
              "Session theft detection wired to a token.service.spec test that runs in CI",
            ]}
          />
        </div>
      </section>

      {/* THREAT MODEL */}
      <section className="border-y border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-20">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 07 ] Threat model</div>
          <h2 className="mt-3 text-display font-medium leading-[1.05] tracking-[-0.8px] text-ink">
            The attacks we actively defend against.
          </h2>

          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <Threat
              name="Cross-tenant access (IDOR)"
              defence="Explicit vendor_id parameter on every query, TenantGuard, 404-on-miss, DB tenant-match trigger, IDOR test suite blocks merge."
            />
            <Threat
              name="Money replay"
              defence="Idempotency-Key required on every state-changing money endpoint. Hash scoped to (vendor, endpoint). Replay returns the cached response."
            />
            <Threat
              name="Forged webhooks"
              defence="HMAC verified for Stripe, KYC, EasyPost. Replay-safe via webhook_events unique(provider, event_id). 600/min rate limit."
            />
            <Threat
              name="Token theft"
              defence="Refresh-token rotation. Presenting a previously-rotated token revokes every session for the user — the legitimate owner is forced to sign in again."
            />
            <Threat
              name="Privilege escalation"
              defence="JWTs signed with a 256-bit secret, role read from the verified JWT only, RolesGuard global, sub-users scoped to read-or-write-not-edit."
            />
            <Threat
              name="PII exfiltration"
              defence="Pino redact list, Sentry beforeSend scrub, recipient email masked in logs, Referrer-Policy strict-origin-when-cross-origin, single-origin CORS."
            />
            <Threat
              name="CSV / formula injection"
              defence="Every export defangs cells starting with =, +, -, @, TAB, CR per OWASP. Streamed one row at a time."
            />
            <Threat
              name="Runaway query"
              defence="Postgres statement_timeout = 10s, lock_timeout = 5s, idle_in_transaction = 30s. Set per-session at connect time."
            />
          </div>
        </div>
      </section>

      {/* TECH SUMMARY */}
      <section className="mx-auto max-w-[84rem] px-8 py-20">
        <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 08 ] In the stack</div>
        <h2 className="mt-3 text-display font-medium leading-[1.05] tracking-[-0.8px] text-ink">
          Every defensive control, in one paragraph.
        </h2>
        <p className="mt-6 max-w-3xl text-body-lg text-text">
          Helmet for security headers (CSP locked, HSTS preload, frame-ancestors none, strict-origin
          referrer). Throttler with stricter per-route limits on auth, money, and webhook endpoints. Zod
          validation pipe with `whitelist + forbidNonWhitelisted` on every body and query.
          Sentry-integrated exception filter that captures 5xx with PII-scrubbed request context. Daily
          ledger reconciliation cron that proves sum(ledger) === wallet.balance per vendor. Append-only
          DB triggers on audit, ledger, and order events. Postgres connection-pool query timeouts. CodeQL
          + `pnpm audit --production` blocking Critical CVEs in CI.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Spec label="Password hash" value="Argon2id" detail="m=19MiB, t=2, p=1" />
          <Spec label="MFA" value="TOTP RFC 6238" detail="+ 10 single-use recovery codes" />
          <Spec label="Field encryption" value="AES-256-GCM" detail="32-byte master key" />
          <Spec label="Refresh token TTL" value="30 days" detail="Rotated on every use" />
          <Spec label="Access token TTL" value="15 minutes" detail="Step-up re-auth above $500" />
          <Spec label="Audit retention" value="7 years" detail="Financial compliance" />
          <Spec label="Backup retention" value="30 / 90 / 365 days" detail="Nightly / weekly / monthly" />
          <Spec label="DB query timeout" value="10 seconds" detail="Per-session statement_timeout" />
          <Spec label="HSTS" value="max-age 2 years" detail="includeSubDomains; preload" />
        </div>
      </section>

      {/* COMPLIANCE */}
      <section className="border-y border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-8 py-20">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-start">
            <div>
              <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 09 ] Compliance</div>
              <h2 className="mt-3 text-display font-medium leading-[1.05] tracking-[-0.8px] text-ink">
                What we hold, what we don&apos;t.
              </h2>
            </div>
            <div className="space-y-5 text-body-lg text-text">
              <p>
                <strong>PCI:</strong> card data never touches our servers. Stripe Elements +
                PaymentIntents only. We&apos;re a Stripe customer of record.
              </p>
              <p>
                <strong>KYC:</strong> handled by Stripe Identity. We store the verification status
                + metadata; we never receive your government-issued ID.
              </p>
              <p>
                <strong>Customer PII:</strong> shipping addresses stored plain v1, behind tenant
                scoping + audit. Encryption-at-rest via the managed DB. Field-level encryption is on
                the v2 roadmap.
              </p>
              <p>
                <strong>Audit retention:</strong> 7 years on financial events.
              </p>
              <p>
                <strong>SOC 2:</strong> on the roadmap once we cross the volume threshold that
                justifies the auditor cost.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* DISCLOSURE */}
      <section className="mx-auto max-w-[84rem] px-8 py-20">
        <div className="rounded-md border-l-4 border-amber bg-amber/10 px-8 py-6">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 10 ] Responsible disclosure</div>
          <h3 className="mt-3 text-h1 font-semibold tracking-[-0.4px] text-ink">
            Found something? We want to hear from you.
          </h3>
          <p className="mt-3 max-w-2xl text-body-lg text-text">
            Email{" "}
            <a
              href="mailto:security@usa-errands.com"
              className="text-amber underline-offset-2 hover:underline"
            >
              security@usa-errands.com
            </a>{" "}
            — we triage within one business day, acknowledge within three, and patch on the same
            severity-tiered SLA we use internally (P0 ≤ 24h, P1 ≤ 1 week). Bounty program coming with
            v2.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[84rem] px-8 py-24">
        <div className="rounded-md border border-line bg-ink p-12 text-text-inv">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">[ 11 ] Get started</div>
          <h2 className="mt-3 max-w-2xl text-display font-medium leading-[1.05] tracking-[-0.8px]">
            Inventory in. Money locked down. Ship.
          </h2>
          <p className="mt-5 max-w-xl text-body-lg text-text-inv/70">
            Two-factor auth, append-only audit, and a published threat model — from the first dollar.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup">
              <Button variant="amber" size="lg" withArrow>
                Create your account
              </Button>
            </Link>
            <Link href="/integrations">
              <Button variant="ghost" size="lg" className="text-text-inv hover:bg-white/10">
                See integrations
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

// ===========================================================================

function Pillar({
  n,
  title,
  summary,
  mechanisms,
}: {
  n: string;
  title: string;
  summary: string;
  mechanisms: string[];
}) {
  return (
    <article className="rounded-md border border-line bg-white p-7">
      <div className="font-mono text-mono-eyebrow uppercase text-amber">[ {n} ]</div>
      <h3 className="mt-2 text-h1 font-semibold tracking-[-0.4px] text-ink">{title}</h3>
      <p className="mt-3 text-body-lg text-text-muted">{summary}</p>
      <ul className="mt-5 space-y-2 text-body-sm text-text-2">
        {mechanisms.map((m) => (
          <li key={m} className="flex gap-3">
            <span className="mt-2 inline-block h-px w-4 shrink-0 bg-amber" aria-hidden />
            <span>{m}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Threat({ name, defence }: { name: string; defence: string }) {
  return (
    <div className="rounded-md border border-line bg-white p-5">
      <div className="font-mono text-mono-label uppercase text-error">Threat</div>
      <div className="mt-1 text-h3 font-semibold text-ink">{name}</div>
      <div className="mt-4 font-mono text-mono-label uppercase text-amber">Defence</div>
      <p className="mt-1 text-body-sm text-text">{defence}</p>
    </div>
  );
}

function Spec({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-line bg-white p-5">
      <div className="font-mono text-mono-label uppercase text-text-muted">{label}</div>
      <div className="mt-2 text-h2 font-semibold tracking-[-0.2px] text-ink">{value}</div>
      <div className="mt-1 font-mono text-mono-label uppercase text-text-subtle">{detail}</div>
    </div>
  );
}
