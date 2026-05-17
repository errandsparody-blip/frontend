/**
 * Security marketing page.
 *
 * Goals:
 *   - Reassure prospective vendors that money + inventory + PII are taken
 *     seriously, with concrete-but-uncluttered specifics.
 *   - Stay light: the previous version had four "pillars", eight threat
 *     cards, nine spec tiles, and five compliance paragraphs. Marketing
 *     audiences glaze over before card #10. This rewrite keeps the
 *     substance but compresses to four sections — Hero, Four promises,
 *     Practical facts, Closing CTA — and is mobile-responsive throughout.
 *
 * If a prospect wants the full threat-model spreadsheet we'll show them
 * privately during evaluation — it doesn't need to live on the marketing
 * site.
 */

import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Security — USA Errands",
  description:
    "Tenant isolation, immutable audit, AES-256-GCM encryption, mandatory MFA. The security posture as it actually exists in the code.",
};

export default function SecurityPage() {
  return (
    <>
      {/* HERO */}
      <section className="border-b border-line bg-cream">
        <div className="mx-auto max-w-[84rem] px-5 py-16 sm:px-8 sm:py-24 lg:py-32">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">Security</div>
          <h1 className="mt-3 max-w-3xl text-display font-medium leading-[1.05] tracking-[-0.6px] text-ink sm:text-display-lg sm:tracking-[-1.2px]">
            Built for vendor money.
            <br />
            <span className="text-amber">Audited at every layer.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-body sm:mt-8 sm:text-body-lg text-text-muted">
            We hold your inventory and your money. The platform is engineered like that&apos;s true —
            append-only ledgers, mandatory two-factor auth, tenant isolation enforced top to bottom.
          </p>
        </div>
      </section>

      {/* FOUR PROMISES — replaces the old Four-Pillars + Threat-Model + Tech-Summary stack */}
      <section className="mx-auto max-w-[84rem] px-5 py-14 sm:px-8 sm:py-20">
        <div className="font-mono text-mono-eyebrow uppercase text-amber">What we promise</div>
        <h2 className="mt-3 max-w-2xl text-h1 sm:text-display font-medium leading-[1.05] tracking-[-0.4px] sm:tracking-[-0.8px] text-ink">
          Four guarantees, in plain English.
        </h2>

        <div className="mt-10 grid gap-4 sm:gap-6 md:grid-cols-2">
          <Promise
            title="Strict tenant isolation"
            body="Every query is scoped to your vendor identifier across the service, controller, database trigger, and continuous-integration test layers. Cross-tenant requests return a 404 response; the existence of other vendor accounts is never disclosed."
          />
          <Promise
            title="Provable financial integrity"
            body="Wallets, ledgers, and audit logs are enforced as append-only at the database layer. The sum of ledger entries reconciles to the wallet balance on a nightly basis. No record is ever modified or deleted, including by USA Errands personnel."
          />
          <Promise
            title="Encryption and secrets management"
            body="Passwords are hashed with Argon2id. Multi-factor authentication secrets are encrypted with AES-256-GCM. Session tokens are stored as SHA-256 hashes. Every registration is screened against the Have I Been Pwned breach corpus, and all responses are protected by Helmet, a strict Content Security Policy, and HSTS preload."
          />
          <Promise
            title="Mandatory multi-factor authentication"
            body="Time-based one-time passwords (RFC 6238) are required at initial login. Refresh tokens rotate on each use, and any replay attempt revokes the entire session family. Transactions above $500 require step-up re-authentication, and repeated failed login attempts trigger an exponential lockout."
          />
        </div>
      </section>

      {/* PRACTICAL FACTS — compressed compliance summary, no spec-tile wall */}
      {/* <section className="border-y border-line bg-cream-soft">
        <div className="mx-auto max-w-[84rem] px-5 py-14 sm:px-8 sm:py-20">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">Practical facts</div>
          <h2 className="mt-3 max-w-2xl text-h1 sm:text-display font-medium leading-[1.05] tracking-[-0.4px] sm:tracking-[-0.8px] text-ink">
            What we hold. What we don&apos;t.
          </h2>

          <dl className="mt-8 grid gap-x-10 gap-y-5 text-body text-text sm:mt-10 sm:grid-cols-2 sm:text-body-lg">
            <Fact label="Card data">
              Never touches our servers. Stripe Elements + PaymentIntents only.
            </Fact>
            <Fact label="Government IDs">
              Handled by Stripe Identity. We see the verification status, not the document.
            </Fact>
            <Fact label="Customer PII">
              Stored behind tenant scoping + audit. Encryption-at-rest via the managed database.
            </Fact>
            <Fact label="Audit retention">7 years on every financial event.</Fact>
            <Fact label="Backups">
              Nightly, weekly, monthly. 30 / 90 / 365 day retention.
            </Fact>
            <Fact label="Sessions">
              Access token 15 min · Refresh 30 days, rotated on every use.
            </Fact>
            <Fact label="DB safety">
              Statement timeout 10s. Lock timeout 5s. Idle-in-transaction 30s.
            </Fact>
            <Fact label="SOC 2">
              On the roadmap once volume justifies the auditor cost.
            </Fact>
          </dl>
        </div>
      </section> */}

      {/* CLOSING — disclosure + CTA combined */}
      <section className="mx-auto max-w-[84rem] px-5 py-14 sm:px-8 sm:py-24">
        <div className="rounded-md border border-line bg-ink p-6 text-text-inv sm:p-12">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">Disclosure + start</div>
          <h2 className="mt-3 max-w-2xl text-h1 sm:text-display font-medium leading-[1.05] tracking-[-0.4px] sm:tracking-[-0.8px]">
            Found something? Tell us.
          </h2>
          <p className="mt-4 max-w-xl text-body sm:text-body-lg text-text-inv/75">
            Email{" "}
            <a
              href="mailto:security@myusaerrands.com"
              className="text-amber underline-offset-2 hover:underline"
            >
              hello@myusaerrands.com
            </a>{" "}
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
// Tiny presentational helpers — kept inline so the file stays self-contained.
// ===========================================================================

function Promise({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-md border border-line bg-white p-6 sm:p-7">
      <h3 className="text-h2 sm:text-h1 font-semibold tracking-[-0.2px] text-ink">{title}</h3>
      <p className="mt-3 text-body sm:text-body-lg text-text-muted">{body}</p>
    </article>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-mono-label uppercase text-amber">{label}</dt>
      <dd className="mt-1 text-text">{children}</dd>
    </div>
  );
}
