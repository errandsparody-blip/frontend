/**
 * /legal/privacy — public Privacy Policy.
 *
 * Linked from the marketing footer alongside Terms. Plain prose page —
 * no acceptance flow.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy · USA Errands",
  description: "How USA Errands collects, uses, stores and shares personal information across the vendor 3PL platform and the Personal Shopper service.",
};

const LAST_UPDATED = "2026-05-09";

export default function PrivacyPage(): JSX.Element {
  return (
    <div className="bg-cream">
      <div className="mx-auto flex max-w-[60rem] flex-col gap-8 px-6 py-16 sm:px-8">
        <header>
          <div className="font-mono text-mono-eyebrow uppercase text-amber">[Legal / Privacy]</div>
          <h1 className="mt-3 text-display font-medium tracking-[-0.8px] text-ink">
            Privacy Policy
          </h1>
          <p className="mt-3 max-w-prose text-body text-text-muted">
            What we collect, why we collect it, and what control you have over it. Plain English
            first; the legal hooks are in the section bodies.
          </p>
          <div className="mt-2 font-mono text-mono-label uppercase text-text-muted">
            Last updated · {LAST_UPDATED}
          </div>
        </header>

        <article className="prose-legal">
          <h2>1. Information we collect</h2>
          <p>
            <strong>Account information.</strong> Name, email, password (hashed), business name
            and country (vendors), 2FA secrets (if enabled), and the role assigned to your user.
          </p>
          <p>
            <strong>Identity / KYC documents.</strong> For vendors we collect government-issued
            ID, proof of business registration and the social-handle declarations required by our
            compliance partner. These are processed by our third-party verification provider; we
            store only the verification outcome and a reference token.
          </p>
          <p>
            <strong>Shipping &amp; order data.</strong> Recipient names, addresses, phone numbers,
            email addresses, line items, declared values, tracking numbers, and inspection notes.
          </p>
          <p>
            <strong>Personal Shopper request data.</strong> Buyer email, optional name, shipping
            address, product URLs, message thread contents, attachments (R2-hosted), and the
            payment-intent identifiers Stripe returns to us. We never see or store full card
            numbers.
          </p>
          <p>
            <strong>Wallet &amp; financial data.</strong> Vendor wallet balance and append-only
            ledger of debits and credits. Bank account details for payouts (when applicable) are
            tokenised by our payments processor; we hold the token, not the underlying number.
          </p>
          <p>
            <strong>Operational telemetry.</strong> IP address, user agent, page paths, and
            correlation ids on every request — used to debug issues, detect abuse, and meet our
            audit obligations. We strip personally-identifying fields before sending error reports
            to our monitoring providers.
          </p>

          <h2>2. How we use it</h2>
          <p>
            We use this information to provide the service: receive and ship inventory, procure
            shopper requests, settle payments, communicate with you about your account, and
            satisfy legal obligations (tax reporting, anti-money-laundering checks, court orders).
          </p>
          <p>
            We do <em>not</em> sell personal information. We do not run advertising on this site
            and we don&apos;t use your data to train AI models for resale.
          </p>

          <h2>3. Who we share it with</h2>
          <p>
            We share data with service providers strictly as needed to operate the platform.
            Current providers include:
          </p>
          <ul>
            <li>
              <strong>Stripe</strong> — payment processing, refunds, payouts.
            </li>
            <li>
              <strong>EasyPost</strong> — carrier label purchase, tracking, delivery webhooks.
            </li>
            <li>
              <strong>Smarty</strong> — U.S. address verification at order entry.
            </li>
            <li>
              <strong>Cloudflare R2</strong> — storage of attachments and shipping label PDFs.
            </li>
            <li>
              <strong>Resend</strong> — transactional email delivery.
            </li>
            <li>
              <strong>Sentry</strong> — error reporting (PII-scrubbed).
            </li>
            <li>
              <strong>Railway / Vercel</strong> — application hosting.
            </li>
          </ul>
          <p>
            We share with carriers (USPS, UPS, FedEx, DHL, etc.) the minimum data required to
            deliver a shipment — typically the recipient address, declared value, and weight.
          </p>
          <p>
            We disclose information when required by law, when responding to a valid legal
            process, or when we reasonably believe disclosure is necessary to protect our rights,
            our users, or the public.
          </p>

          <h2>4. International transfers</h2>
          <p>
            Our infrastructure is hosted in the United States. If you&apos;re outside the U.S.,
            using the platform involves your data being transferred to and processed in the U.S.
            We rely on Standard Contractual Clauses (SCCs) where applicable for transfers from
            jurisdictions that require them.
          </p>

          <h2>5. Retention</h2>
          <p>
            We retain account and transaction data for as long as your account is active and for
            up to 7 years afterwards to satisfy financial-record retention obligations. Audit log
            entries are retained for 7 years from the date of the entry. Shopper attachments are
            retained for 1 year after the request resolves; you can request earlier deletion via
            support.
          </p>

          <h2>6. Your rights</h2>
          <p>
            Depending on your jurisdiction you may have rights to access, correct, port, restrict,
            or delete your personal information; to object to certain processing; and to withdraw
            consent where we relied on it. Email{" "}
            <a href="mailto:privacy@usa-errands.com" className="underline">
              privacy@usa-errands.com
            </a>{" "}
            and we&apos;ll respond within 30 days.
          </p>
          <p>
            We honour Do Not Track signals at the browser level by not enabling third-party
            analytics that depend on cross-site tracking.
          </p>

          <h2>7. Security</h2>
          <p>
            We use industry-standard practices to protect your data: TLS in transit, encryption at
            rest for sensitive fields, principle-of-least-privilege access controls, audit logging
            of every administrative action, and regular security review. We require 2FA for all
            staff with access to production systems.
          </p>
          <p>
            No system is perfectly secure. If we discover a breach affecting your data we&apos;ll
            notify you and the relevant authorities within the timelines required by applicable
            law.
          </p>

          <h2>8. Cookies</h2>
          <p>
            We use essential session cookies to keep you signed in and to remember your portal
            preferences (e.g. last-viewed page, sidebar state). We do not use third-party
            advertising cookies. You can clear cookies through your browser at any time, but doing
            so will sign you out.
          </p>

          <h2>9. Children</h2>
          <p>
            The platform isn&apos;t directed at children under 16, and we don&apos;t knowingly
            collect personal information from anyone under 16. If you believe a child has provided
            us with personal information, contact{" "}
            <a href="mailto:privacy@usa-errands.com" className="underline">
              privacy@usa-errands.com
            </a>{" "}
            and we&apos;ll delete it.
          </p>

          <h2>10. Changes to this policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Material changes will be posted
            here with an updated &quot;Last updated&quot; date and (for material changes)
            communicated via email.
          </p>

          <h2>11. Contact</h2>
          <p>
            Questions about this Policy or about how we handle your data? Email{" "}
            <a href="mailto:privacy@usa-errands.com" className="underline">
              privacy@usa-errands.com
            </a>
            . For terms-of-service questions see our{" "}
            <Link href="/legal/terms" className="underline">Terms of Service</Link>.
          </p>
        </article>

        <footer className="rounded-md border-l-4 border-line-strong bg-cream-soft p-5 text-body-sm text-text-muted">
          This Policy reflects the current published version. Earlier versions are kept in our
          compliance archive — email privacy@usa-errands.com to request a copy.
        </footer>
      </div>

      <style jsx global>{`
        .prose-legal h2 {
          font-family: var(--font-sans);
          font-weight: 600;
          font-size: 22px;
          color: var(--ink, #0f0f0e);
          margin-top: 2.25rem;
          margin-bottom: 0.75rem;
          letter-spacing: -0.2px;
        }
        .prose-legal h3 {
          font-family: var(--font-sans);
          font-weight: 600;
          font-size: 16px;
          color: var(--ink, #0f0f0e);
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .prose-legal p,
        .prose-legal li {
          color: var(--text, #2b2b29);
          line-height: 1.65;
          font-size: 15px;
        }
        .prose-legal p {
          margin-top: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .prose-legal ul,
        .prose-legal ol {
          margin: 0.75rem 0;
          padding-left: 1.5rem;
          list-style: disc;
        }
        .prose-legal ol {
          list-style: decimal;
        }
        .prose-legal li + li {
          margin-top: 0.4rem;
        }
        .prose-legal strong {
          font-weight: 600;
          color: var(--ink, #0f0f0e);
        }
        .prose-legal a {
          color: var(--ink, #0f0f0e);
          text-underline-offset: 4px;
        }
      `}</style>
    </div>
  );
}
