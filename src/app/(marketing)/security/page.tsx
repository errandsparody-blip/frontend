/**
 * Security marketing page.
 *
 * Copy per the "Security section — update" brief: a plain-English promise that
 * money, inventory, and personal data are protected, five "how we protect you"
 * cards, a responsible-disclosure contact, and a closing note.
 */

import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Security — USA Errands",
  description:
    "Your money. Your inventory. Our responsibility. How USA Errands protects your account, data, and funds — and how to report a security issue.",
};

export default function SecurityPage() {
  return (
    <>
      {/* HERO */}
      <section className="border-b border-line bg-cream">
        <div className="mx-auto max-w-[84rem] px-5 py-16 sm:px-8 sm:py-24 lg:py-32">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">Security</div>
          <h1 className="mt-3 max-w-3xl text-display font-medium leading-[1.05] tracking-[-0.6px] text-ink sm:text-display-lg sm:tracking-[-1.2px]">
            Your money. Your inventory.
            <br />
            <span className="text-amber">Our responsibility.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-body sm:mt-8 sm:text-body-lg text-text-muted">
            At USA Errands, security is built into every part of our platform. We protect your
            account, inventory, and funds with safeguards designed to keep your information secure and
            your transactions trustworthy.
          </p>
        </div>
      </section>

      {/* HOW WE PROTECT YOU */}
      <section className="mx-auto max-w-[84rem] px-5 py-14 sm:px-8 sm:py-20">
        <div className="font-mono text-mono-eyebrow uppercase text-amber">How we protect you</div>
        <h2 className="mt-3 max-w-2xl text-h1 sm:text-display font-medium leading-[1.05] tracking-[-0.4px] sm:tracking-[-0.8px] text-ink">
          Safeguards on your account, data, and funds.
        </h2>

        <div className="mt-10 grid gap-4 sm:gap-6 md:grid-cols-2">
          <Promise
            title="Your account is protected"
            body="We use strong authentication and security controls to help prevent unauthorized access. Multi-factor authentication is required, and sensitive actions may require additional verification."
          />
          <Promise
            title="Your data stays isolated"
            body="Your account and business data are kept separate from other customers. Access is restricted to the information associated with your account."
          />
          <Promise
            title="Financial records are protected"
            body="Wallet balances, transactions, and audit records are protected using database-level controls designed to prevent unauthorized changes. Financial records are regularly reconciled to help maintain accuracy."
          />
          <Promise
            title="Sensitive information is encrypted"
            body="Passwords and sensitive authentication information are securely protected using industry-standard encryption and hashing technologies. Our platform also uses additional security measures to protect data and connections."
          />
          <Promise
            title="We monitor for suspicious activity"
            body="We use security controls designed to detect and limit suspicious login attempts and unauthorized session activity. Higher-value transactions may require additional authentication."
          />
          <Promise
            title="Built with security in mind"
            body="USA Errands provides logistics infrastructure for international sellers and shopping services for buyers. Protecting your information, inventory, and funds is fundamental to how we operate."
          />
        </div>
      </section>

      {/* SEE SOMETHING? TELL US — disclosure + CTA */}
      <section className="mx-auto max-w-[84rem] px-5 py-14 sm:px-8 sm:py-24">
        <div className="rounded-md border border-line bg-ink p-6 text-text-inv sm:p-12">
          <div className="font-mono text-mono-eyebrow uppercase text-amber">See something? Tell us.</div>
          <h2 className="mt-3 max-w-2xl text-h1 sm:text-display font-medium leading-[1.05] tracking-[-0.4px] sm:tracking-[-0.8px]">
            Report a security issue.
          </h2>
          <p className="mt-4 max-w-xl text-body sm:text-body-lg text-text-inv/75">
            Security is an ongoing responsibility. If you believe you&apos;ve discovered a security
            issue or vulnerability, please let us know so we can investigate and address it. We take
            every report seriously and appreciate responsible disclosure.
          </p>
          <p className="mt-4 text-body sm:text-body-lg">
            <span className="font-mono text-mono-label uppercase text-amber">Security contact</span>
            <br />
            <a
              href="mailto:security@myusaerrands.com"
              className="text-amber underline-offset-2 hover:underline"
            >
              security@myusaerrands.com
            </a>
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

function Promise({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-md border border-line bg-white p-6 sm:p-7">
      <h3 className="text-h2 sm:text-h1 font-semibold tracking-[-0.2px] text-ink">{title}</h3>
      <p className="mt-3 text-body sm:text-body-lg text-text-muted">{body}</p>
    </article>
  );
}
