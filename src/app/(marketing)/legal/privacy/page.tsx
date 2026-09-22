/**
 * /legal/privacy — public Privacy Policy.
 *
 * Linked from the marketing footer. Plain prose page — no acceptance flow.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · USA Errands",
  description:
    "How USA Errands collects, uses, stores, and shares personal information — and the choices available to you.",
};

const LAST_UPDATED = "2026-09-22";

export default function PrivacyPage(): JSX.Element {
  return (
    <div className="bg-cream">
      <div className="mx-auto flex max-w-[60rem] flex-col gap-8 px-6 py-16 sm:px-8">
        <header>
          <div className="font-mono text-mono-eyebrow uppercase text-amber">[Legal / Privacy]</div>
          <h1 className="mt-3 text-display font-medium tracking-[-0.8px] text-ink">Privacy Policy</h1>
          <p className="mt-3 max-w-prose text-body text-text-muted">
            At USA Errands, we believe privacy should be simple. This Privacy Policy explains what
            information we collect, how we use it, and the choices available to you when you use our
            services.
          </p>
          <div className="mt-2 font-mono text-mono-label uppercase text-text-muted">
            Last updated · {LAST_UPDATED}
          </div>
        </header>

        <article className="prose-legal">
          <h2>1. Information we collect</h2>
          <p>We collect only the information reasonably needed to provide and improve our services. This may include:</p>
          <ul>
            <li>
              <strong>Account information</strong> — such as your name, email address, and account details.
            </li>
            <li>
              <strong>Order and shipping information</strong> — including names, addresses, phone numbers, product details, tracking information, and delivery instructions.
            </li>
            <li>
              <strong>Shopping information</strong> — including product links, requests, messages, and files you provide when asking us to purchase or ship items.
            </li>
            <li>
              <strong>Payment information</strong> — payment and transaction details handled through our payment providers. We do not store full payment card numbers.
            </li>
            <li>
              <strong>Technical information</strong> — such as IP address, browser or device information, and basic usage information needed to operate and secure our website.
            </li>
          </ul>

          <h2>2. How we use your information</h2>
          <p>We use your information to:</p>
          <ul>
            <li>Provide and manage your USA Errands account</li>
            <li>Process purchases, orders, payments, and shipments</li>
            <li>Communicate with you about your orders and account</li>
            <li>Provide customer support</li>
            <li>Prevent fraud, abuse, and unauthorized activity</li>
            <li>Improve the reliability and functionality of our services</li>
            <li>Meet legal, tax, and regulatory requirements</li>
          </ul>
          <p>We do not sell your personal information.</p>

          <h2>3. When we share information</h2>
          <p>
            We may share information with service providers that help us operate USA Errands,
            including payment processors, shipping carriers, technology providers, and
            customer-support services.
          </p>
          <p>
            For example, when you request a shipment, we may provide the carrier with the
            recipient&apos;s name, address, phone number, and information necessary to complete
            delivery.
          </p>
          <p>
            We may also disclose information when required by law or when reasonably necessary to
            protect our customers, our business, or others.
          </p>
          <p>
            We do not permit service providers to use your information for purposes unrelated to the
            services they provide to us.
          </p>

          <h2>4. International use</h2>
          <p>
            USA Errands is based in the United States. If you use our services from another country,
            your information may be processed in the United States or other countries where our
            service providers operate.
          </p>

          <h2>5. How long we keep information</h2>
          <p>
            We keep information for as long as reasonably necessary to provide our services, maintain
            required business and financial records, resolve disputes, prevent fraud, and meet legal
            obligations.
          </p>
          <p>When information is no longer needed, we may delete or securely dispose of it.</p>

          <h2>6. Your privacy rights</h2>
          <p>
            Depending on where you live, you may have rights to access, correct, delete, or receive a
            copy of your personal information, as well as other rights provided by applicable law.
          </p>
          <p>
            To submit a privacy request, contact{" "}
            <a href="mailto:privacy@myusaerrands.com" className="underline">privacy@myusaerrands.com</a>.
            We may need to verify your identity before completing certain requests.
          </p>

          <h2>7. Security</h2>
          <p>
            We use reasonable technical and organizational safeguards designed to protect your
            information against unauthorized access, loss, misuse, or disclosure.
          </p>
          <p>
            No online service can guarantee complete security, but we take the protection of your
            information seriously.
          </p>

          <h2>8. Cookies</h2>
          <p>
            We use cookies and similar technologies to keep our website functioning, remember
            preferences, maintain sessions, and understand basic website usage.
          </p>
          <p>We do not use third-party advertising cookies to sell your personal information.</p>

          <h2>9. Children</h2>
          <p>
            USA Errands is not intended for children under 16, and we do not knowingly collect
            personal information from children under 16.
          </p>
          <p>
            If you believe a child has provided us with personal information, please contact us at{" "}
            <a href="mailto:privacy@myusaerrands.com" className="underline">privacy@myusaerrands.com</a>.
          </p>

          <h2>10. Changes to this policy</h2>
          <p>
            We may update this Privacy Policy from time to time. If we make material changes, we will
            update the date at the top of this page and, where appropriate, provide additional notice.
          </p>

          <h2>11. Contact</h2>
          <p>
            Questions about privacy or your personal information?{" "}
            <a href="mailto:privacy@myusaerrands.com" className="underline">privacy@myusaerrands.com</a>
          </p>
          <p>
            <strong>USA Errands</strong>
            <br />
            U.S.-based personal shopping, purchasing, and logistics services.
          </p>
        </article>
      </div>

      {/* `.prose-legal` styles live in src/styles/globals.css. */}
    </div>
  );
}
