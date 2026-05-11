/**
 * /legal/terms — public Terms of Service.
 *
 * Linked from the marketing footer and the Personal Shopper landing
 * page. Plain marketing-style legal page; no acceptance flow (vendors
 * accept the dedicated Vendor Agreement, buyers accept these Terms by
 * placing an order).
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service · USA Errands",
  description: "The terms governing the USA Errands platform — vendor 3PL services, the Personal Shopper service, and use of the website.",
};

const LAST_UPDATED = "2026-05-09";

export default function TermsPage(): JSX.Element {
  return (
    <div className="bg-cream">
      <div className="mx-auto flex max-w-[60rem] flex-col gap-8 px-6 py-16 sm:px-8">
        <header>
          <div className="font-mono text-mono-eyebrow uppercase text-amber">[Legal / Terms]</div>
          <h1 className="mt-3 text-display font-medium tracking-[-0.8px] text-ink">
            Terms of Service
          </h1>
          <p className="mt-3 max-w-prose text-body text-text-muted">
            These terms govern your use of the USA Errands website, the vendor 3PL platform, and
            the Personal Shopper service. By creating an account or placing an order you agree to
            them.
          </p>
          <div className="mt-2 font-mono text-mono-label uppercase text-text-muted">
            Last updated · {LAST_UPDATED}
          </div>
        </header>

        <article className="prose-legal">
          <h2>1. Who we are</h2>
          <p>
            USA Errands (&quot;USA Errands&quot;, &quot;we&quot;, &quot;us&quot;) operates a U.S.-based
            logistics platform combining (a) third-party logistics services for international
            sellers (&quot;3PL&quot;) and (b) a Personal Shopper service that procures U.S. retail
            items on behalf of buyers anywhere in the world.
          </p>
          <p>
            These Terms apply to everyone who visits this site, signs up as a vendor, or opens a
            Personal Shopper request. Vendors are additionally bound by the{" "}
            <Link href="/legal/vendor-agreement" className="underline">Vendor Agreement</Link>; if
            anything in that agreement conflicts with these Terms, the Vendor Agreement controls
            for vendor accounts.
          </p>

          <h2>2. Eligibility &amp; account</h2>
          <p>
            You must be at least 18 years old (or the age of majority in your jurisdiction) to
            create an account. You&apos;re responsible for everything that happens under your
            account, including keeping your credentials confidential and notifying us immediately
            if you suspect unauthorised access.
          </p>
          <p>
            We may suspend or close accounts for violation of these Terms, suspected fraud, or
            actions that risk our platform, our partners, or other users.
          </p>

          <h2>3. The 3PL service</h2>
          <p>
            Vendors send inventory to our warehouse, we receive and store it, and we pick, pack
            and ship orders on the vendor&apos;s behalf. Pricing is published at{" "}
            <Link href="/pricing" className="underline">/pricing</Link> and may be updated with
            notice. Storage, fulfilment, returns and other operational details are governed by the{" "}
            <Link href="/legal/vendor-agreement" className="underline">Vendor Agreement</Link>.
          </p>

          <h2>4. The Personal Shopper service</h2>
          <p>
            For each Personal Shopper request the buyer pays an upfront intake amount (items
            estimate + service commission + estimated U.S. sales tax), we procure the items, and
            we ship to the address on file. After procurement we reconcile actual cost vs estimate
            and either invoice the buyer for any shortfall or refund the difference to the original
            payment method.
          </p>
          <p>
            The service commission is non-refundable once we&apos;ve started procurement. Refunds
            are issued automatically when actuals come in lower than the intake estimate, or when
            we cancel before procurement begins. Cancellations after items have been purchased
            are subject to a deduction equal to non-recoverable retailer charges (e.g.
            non-returnable items, restocking fees levied on us). All amounts are settled in U.S.
            dollars unless otherwise agreed.
          </p>

          <h2>5. Payment &amp; refunds</h2>
          <p>
            We use Stripe to process card payments. By submitting payment information you authorise
            us to charge the amounts shown at checkout, plus any subsequent reconciliation amount
            you approve. Refunds settle to the original payment method; bank/network settlement
            timing (typically 5–10 business days) is outside our control.
          </p>
          <p>
            Vendors maintain a wallet balance from which we debit fees and to which refunds and
            reversals are credited. The wallet ledger is append-only — every transaction is
            recoverable from the audit log on demand.
          </p>

          <h2>6. Acceptable use</h2>
          <p>
            You agree not to use the platform to procure, store or ship items that are illegal in
            the United States, the destination country, or any country of transit. You agree not
            to: misrepresent the contents or value of any shipment; attempt to circumvent customs,
            duties or sanctions; resell or redistribute access to your account; reverse-engineer
            or scrape the platform; or interfere with other users&apos; experience.
          </p>
          <p>
            We reserve the right to refuse, cancel or destroy items we reasonably believe violate
            this section, with notice and (where lawful) a refund of recoverable amounts.
          </p>

          <h2>7. Intellectual property</h2>
          <p>
            The USA Errands name, logo, website, and platform code are our property. You may not
            copy, modify, redistribute or otherwise exploit them without our written permission,
            except for reasonable personal or operational use of the service itself. You retain
            ownership of any inventory or content you upload; you grant us a non-exclusive licence
            to handle, store, photograph and ship that content as necessary to provide the
            service.
          </p>

          <h2>8. Disclaimers</h2>
          <p>
            The platform is provided &quot;as is.&quot; To the maximum extent permitted by law, we
            disclaim all implied warranties — including merchantability, fitness for a particular
            purpose and non-infringement. We don&apos;t guarantee the platform will be
            uninterrupted, error-free, or that any specific shipment will reach a specific
            destination by a specific date.
          </p>

          <h2>9. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, our aggregate liability arising out of or
            related to your use of the platform is limited to the greater of (a) the amount you
            paid us in the 12 months preceding the claim, or (b) US$100. We are not liable for
            indirect, incidental, special, consequential or punitive damages — including loss of
            profits, data, goodwill, or business opportunity — even if we&apos;ve been advised of
            the possibility.
          </p>
          <p>
            Carrier-handled shipments are subject to the carrier&apos;s liability limits; lost or
            damaged shipments are claimed against the carrier first. We&apos;ll assist with
            claims but aren&apos;t the insurer of record.
          </p>

          <h2>10. Indemnification</h2>
          <p>
            You agree to indemnify and hold us harmless from claims, losses and expenses
            (including reasonable legal fees) arising out of (a) your violation of these Terms,
            (b) your violation of any law or third-party right, or (c) inventory or content you
            upload to the platform.
          </p>

          <h2>11. Changes to these Terms</h2>
          <p>
            We may revise these Terms from time to time. Material changes will be posted here with
            an updated &quot;Last updated&quot; date and (for material vendor-facing changes)
            communicated via email. Continued use of the platform after the effective date
            constitutes acceptance.
          </p>

          <h2>12. Governing law &amp; disputes</h2>
          <p>
            These Terms are governed by the laws of the State of Delaware, without regard to its
            conflict-of-laws principles. Any dispute will be resolved exclusively in the state or
            federal courts located in Delaware, and you consent to personal jurisdiction in those
            courts.
          </p>
          <p>
            If any provision of these Terms is found unenforceable, the remainder stays in full
            force.
          </p>

          <h2>13. Contact</h2>
          <p>
            Questions about these Terms? Email{" "}
            <a href="mailto:legal@usa-errands.com" className="underline">
              legal@usa-errands.com
            </a>
            . For privacy specifically, see our{" "}
            <Link href="/legal/privacy" className="underline">Privacy Policy</Link>.
          </p>
        </article>

        <footer className="rounded-md border-l-4 border-line-strong bg-cream-soft p-5 text-body-sm text-text-muted">
          These Terms reflect the current published version. Earlier versions and the full revision
          history are kept in our compliance archive — email legal@usa-errands.com to request a
          copy.
        </footer>
      </div>

      {/* Local prose styling — keeps this page readable without pulling
          in @tailwindcss/typography. Mirrors the LEDGR design tokens
          and the prose-agreement style on the vendor agreement page. */}
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
