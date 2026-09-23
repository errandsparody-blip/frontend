/**
 * Vendor Storefront & Marketplace Policy content (shown in the go-live gate).
 * Bump VENDOR_POLICY_VERSION when the text materially changes.
 */

export const VENDOR_POLICY_VERSION = "2026-09";

export function VendorPolicyContent() {
  return (
    <div className="flex flex-col gap-5 text-[13px] leading-relaxed text-text-muted">
      <p>
        This Policy is entered into between <strong className="text-ink">USA Errands</strong>{" "}
        (&ldquo;USA Errands,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) and the
        vendor accepting it (&ldquo;Vendor,&rdquo; &ldquo;you,&rdquo; or &ldquo;your&rdquo;). It applies
        for as long as you operate a Storefront and/or list products on the Marketplace, and works
        alongside USA Errands&apos; core storage and fulfillment terms and general Terms of Service.
      </p>
      <p className="font-mono text-[11px] uppercase tracking-[1.4px] text-text-subtle">
        Last updated: September 2026
      </p>

      <Section n="1" title="Eligibility">
        To create a Storefront, you must already store inventory with USA Errands. Payout accounts are
        only available in countries where our payout provider, Flutterwave, is operational — this
        determines where a Storefront can be created.
      </Section>

      <Section n="2" title="Storefront Fees">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong className="text-ink">Creation fee:</strong> a one-time $50 fee, charged to your Wallet when your Storefront is created.</li>
          <li><strong className="text-ink">Sales commission:</strong> none. USA Errands does not take a percentage of your Storefront sales.</li>
          <li><strong className="text-ink">Payout remitting fee:</strong> charged by Flutterwave on payouts, not by USA Errands — factor this into your retail pricing.</li>
          <li><strong className="text-ink">Fulfillment fee:</strong> charged to your Wallet per order, the same as any other fulfillment request.</li>
          <li><strong className="text-ink">Shipping:</strong> paid by the customer at checkout and remitted to USA Errands directly — not charged to your Wallet.</li>
        </ul>
      </Section>

      <Section n="3" title="Prices & Discount Codes">
        You set your own retail prices and may create discount codes at any time. You&apos;re responsible
        for ensuring your pricing and promotions comply with applicable law, including accurate
        representation of any discount.
      </Section>

      <Section n="4" title="Payout Account">
        Payouts are handled through Flutterwave. You&apos;re responsible for keeping your payout account
        information accurate and current — USA Errands is not responsible for payouts misdirected due to
        information you&apos;ve provided incorrectly.
      </Section>

      <Section n="5" title="Declaring Your Return Policy">
        Before your Storefront goes live, you must declare whether you accept returns and, if so, your
        return window — how many days after delivery a customer can request one. This is shown to
        customers before they buy, and it determines the payout timing described in Section 7.
      </Section>

      <Section n="6" title="Returns Only, No Exchanges">
        USA Errands processes returns only — exchanges aren&apos;t offered on the Marketplace or any
        Storefront. Where you accept returns, an approved return results in a refund to the customer.
        The standard USA Errands return processing fee applies to approved returns, and return shipping
        is the customer&apos;s responsibility, not yours.
      </Section>

      <Section n="7" title="Payout Timing & the Return Window">
        If your Storefront accepts returns, payout for a given order is{" "}
        <strong className="text-ink">held until that order&apos;s return window has closed</strong> — not
        released immediately after it ships.
        <span className="mt-2 block rounded-lg border border-line bg-white p-3">
          <strong className="text-ink">Why:</strong> this ensures a customer&apos;s eligibility to
          request a return or refund on that order has fully passed before funds are released to you.
        </span>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li><strong className="text-ink">No return requested</strong> — once the window closes, the full payout for that order (less applicable fees) is released on the standard schedule.</li>
          <li><strong className="text-ink">Return requested and approved</strong> — the refund, return processing fee, and any other deductions are subtracted first; the remaining balance, if any, is released once the return is processed.</li>
        </ul>
        <span className="mt-2 block">
          If your Storefront doesn&apos;t accept returns, no return-window hold applies — payout is
          released on the standard schedule.
        </span>
      </Section>

      <Section n="8" title="Order Fulfillment">
        Orders placed through your Storefront or the Marketplace flow to USA Errands automatically — no
        manual fulfillment request is required. We pick, pack, and ship each order the same way we
        handle any other fulfillment request on your account.
      </Section>

      <Section n="9" title="Inventory Requirements">
        Only inventory currently stored with USA Errands may be featured on your Storefront or the
        Marketplace. Listing a product you haven&apos;t shipped to us, or that&apos;s no longer in our
        inventory, violates this Policy and may result in the listing being removed or your Storefront
        being suspended.
      </Section>

      <Section n="10" title="Marketplace Participation">
        Listing on the Marketplace is optional, free, and requires that your Storefront already exists.
        You can toggle Marketplace participation on or off at any time. Toggling it on doesn&apos;t
        change what customers see on your dedicated Storefront link — they&apos;ll still see only your
        products there.
      </Section>

      <Section n="11" title="Multi-Store Orders">
        On the Marketplace, a single order can include products from more than one store, shipped
        together as one delivery. Returns, refunds, and payout timing are still calculated{" "}
        <strong className="text-ink">per item, per store</strong> — your items follow your declared
        return policy and payout terms, independent of what other vendors in the same order have
        declared.
      </Section>

      <Section n="12" title="Wallet & Other Fees">
        USA Errands does not charge receiving fees or inventory setup fees — only storage fees are due
        on incoming shipments, in addition to the Storefront-specific fees described in Section 2.
        You&apos;re responsible for maintaining a sufficient Wallet balance to avoid disruptions to
        fulfillment or your Storefront.
      </Section>

      <Section n="13" title="Intellectual Property">
        You retain ownership of your brand name, logo, product content, and any other intellectual
        property you upload to your Storefront. By creating a Storefront, you grant USA Errands a
        limited license to display that content as needed to operate your Storefront and, if enabled,
        your Marketplace listings. You&apos;re responsible for ensuring you have the rights to any
        content you upload.
      </Section>

      <Section n="14" title="Prohibited Items & Conduct">
        You may not list items that are illegal, counterfeit, hazardous, or that infringe on another
        party&apos;s intellectual property. You agree not to misrepresent your products, manipulate
        reviews or ratings, or use your Storefront for any unlawful purpose.
      </Section>

      <Section n="15" title="Compliance with This Policy">
        You agree to honor the return policy you declare, keep your inventory and pricing accurate, and
        not attempt to circumvent the payout hold described in Section 7. Misrepresenting your
        Storefront&apos;s terms, or violating this Policy in any other way, may result in the actions
        described in Section 16.
      </Section>

      <Section n="16" title="Suspension & Termination">
        USA Errands may suspend or remove your Storefront, or a specific listing, for violations of this
        Policy, misrepresented inventory, unresolved customer complaints, or non-payment of Wallet fees.
        Where possible, we&apos;ll notify you and give you an opportunity to resolve the issue first. You
        may request that your Storefront be closed at any time.
      </Section>

      <Section n="17" title="Liability">
        USA Errands&apos; total liability to you under this Policy is limited to the fees you&apos;ve paid
        to USA Errands for the Storefront or order giving rise to the claim. USA Errands is not liable
        for indirect or consequential damages, including lost sales, arising from your use of the
        Storefront or Marketplace.
      </Section>

      <Section n="18" title="Changes to This Policy">
        We may update this Policy from time to time. Material changes will be reflected by an updated
        &ldquo;Last updated&rdquo; date above. Continuing to operate your Storefront or list on the
        Marketplace after changes take effect constitutes acceptance of the revised Policy.
      </Section>

      <Section n="19" title="Contact">
        Questions about this Policy can be sent to{" "}
        <a href="mailto:hello@myusaerrands.com" className="text-ink underline">hello@myusaerrands.com</a>
        {" "}or +1 (737) 328-6316.
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
