/**
 * Buyer Terms of Service content (shown in the checkout gate modal).
 * Bump BUYER_TERMS_VERSION whenever the text materially changes so a fresh
 * acceptance is required.
 */

export const BUYER_TERMS_VERSION = "2026-09";

export function BuyerTermsContent() {
  return (
    <div className="flex flex-col gap-5 text-[13px] leading-relaxed text-text-muted">
      <p className="text-text-muted">
        These Terms of Service are entered into between <strong className="text-ink">USA Errands</strong>{" "}
        (&ldquo;USA Errands,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) and the
        buyer accepting them (&ldquo;Buyer,&rdquo; &ldquo;you,&rdquo; or &ldquo;your&rdquo;). They
        apply to purchases made through any Storefront or the Marketplace.
      </p>
      <p className="font-mono text-[11px] uppercase tracking-[1.4px] text-text-subtle">
        Last updated: September 2026
      </p>

      <Section n="1" title="Pricing & Payment">
        Prices are shown in the currency displayed at checkout. Payment is processed securely at the
        time of purchase; USA Errands does not store your full card details. By placing an order, you
        authorize us to charge your chosen payment method for the order total, including applicable
        shipping.
      </Section>

      <Section n="2" title="Duties & Taxes">
        Orders shipping to Canada may attract duties and taxes upon delivery, separate from what you
        pay at checkout. Orders shipping within the United States do not attract additional duties or
        taxes on delivery. You&apos;re responsible for any such charges assessed by customs or your
        local authority.
      </Section>

      <Section n="3" title="Shipping & Delivery">
        Every order ships locally from the US once processed — not internationally — so delivery is
        typically just a few working days from the time an order ships. Delivery estimates aren&apos;t
        guarantees; actual times can vary by carrier, destination, and circumstances outside our
        control.
      </Section>

      <Section n="4" title="Returns & Refunds">
        Return eligibility and the return window are set individually by each store — check the product
        page before you buy. USA Errands offers returns only, not exchanges. If your order includes
        items from more than one store, each is returned separately under that store&apos;s own policy.
        <span className="mt-3 block rounded-lg border border-line bg-white p-3 text-text-muted">
          <strong className="text-ink">Refund amount:</strong> approved refunds go to your original
          payment method, <strong className="text-ink">less the original shipping fee, handling fee,
          and the platform processing fee.</strong> Shipping fees on an order that has already shipped
          are <strong className="text-ink">not refundable</strong> — this applies whether or not the
          item itself is returned.
        </span>
      </Section>

      <Section n="5" title="Order Cancellations">
        Once an order has entered fulfillment, it generally can&apos;t be cancelled. If you need to
        change or cancel an order, contact us as soon as possible — we&apos;ll do what we can before it
        ships, but can&apos;t guarantee a change once processing has started.
      </Section>

      <Section n="6" title="Prohibited Conduct">
        When buying through the Marketplace or a Storefront, you agree not to:
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Provide false, inaccurate, or fraudulent payment or account information</li>
          <li>Abuse the returns process, including filing false claims of non-delivery or damage</li>
          <li>Use the Marketplace or a Storefront for any unlawful purpose</li>
        </ul>
        <span className="mt-2 block">
          We reserve the right to limit or decline current or future orders for accounts that show a
          pattern of abuse.
        </span>
      </Section>

      <Section n="7" title="Liability">
        USA Errands&apos; total liability to you under these Terms is limited to the amount you paid
        for the order giving rise to the claim. USA Errands is not liable for indirect or
        consequential damages arising from your use of the Marketplace or a Storefront.
      </Section>

      <Section n="8" title="Changes to These Terms">
        We may update these Terms from time to time. The version shown at checkout is the one that
        applies to your order; material changes take effect when posted.
      </Section>

      <Section n="9" title="Contact">
        Questions about these Terms? Email{" "}
        <a href="mailto:hello@myusaerrands.com" className="text-ink underline">hello@myusaerrands.com</a>
        {" "}or call +1 (737) 328-6316.
      </Section>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-[14px] font-semibold text-ink">
        {n}. {title}
      </h3>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}
