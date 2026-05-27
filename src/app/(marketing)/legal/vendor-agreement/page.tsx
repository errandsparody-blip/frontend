/**
 * /legal/vendor-agreement — public agreement page + in-place acceptance.
 *
 * Two roles in one page:
 *   1. Anonymous reader (prospects, lawyers reviewing terms)
 *      → renders the agreement text only.
 *   2. Authenticated vendor admin
 *      → renders the agreement text PLUS an acceptance form that posts
 *        to POST /v1/vendors/me/agreement with the current published
 *        version. Sub-users can read but can't accept (the API enforces
 *        this; the UI mirrors the constraint).
 *
 * The legal text below is the published USA Errands Vendor Agreement.
 * Subsequent revisions land through the same route — bump
 * `agreement_version` in /admin/config/policy alongside any meaningful
 * change so existing vendors get re-prompted via the AgreementVersionGuard.
 */

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/status-pill";
import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useApiErrorHandler } from "@/lib/errors";

interface VendorProfile {
  id: string;
  businessName: string;
  agreementAcceptedAt: string | null;
  agreementVersion: string | null;
  currentAgreementVersion: string;
  agreementUpToDate: boolean;
}

export default function VendorAgreementPage(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <VendorAgreementInner />
    </Suspense>
  );
}

function VendorAgreementInner(): JSX.Element {
  const params = useSearchParams();
  const isReaccept = params.get("reaccept") === "1";

  return (
    <div className="bg-cream">
      <div className="mx-auto flex max-w-[60rem] flex-col gap-8 px-8 py-16">
        <header>
          <div className="font-mono text-mono-eyebrow uppercase text-amber">
            [Legal / Vendor agreement]
          </div>
          <h1 className="mt-3 text-display font-medium tracking-[-0.8px] text-ink">
            Vendor Agreement
          </h1>
          <p className="mt-3 max-w-prose text-body text-text-muted">
            The terms governing how USA Errands stores and ships your inventory on your
            behalf, what we charge for it, and what either side can do if something goes
            wrong. Read carefully — your account uses these terms whether or not you click
            accept.
          </p>
        </header>

        <AcceptanceCard isReaccept={isReaccept} />

        <article className="prose-agreement">
          <AgreementText />
        </article>

      </div>

      {/* Local prose styling — keeps the agreement readable without pulling
          in @tailwindcss/typography. Mirrors the LEDGR design tokens. */}
      <style jsx global>{`
        .prose-agreement h2 {
          font-family: var(--font-sans);
          font-weight: 600;
          font-size: 22px;
          color: var(--ink, #0f0f0e);
          margin-top: 2.25rem;
          margin-bottom: 0.75rem;
          letter-spacing: -0.2px;
        }
        .prose-agreement h3 {
          font-family: var(--font-sans);
          font-weight: 600;
          font-size: 16px;
          color: var(--ink, #0f0f0e);
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .prose-agreement p,
        .prose-agreement li {
          color: var(--text, #2b2b29);
          line-height: 1.6;
          font-size: 15px;
        }
        .prose-agreement p {
          margin-top: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .prose-agreement ul,
        .prose-agreement ol {
          margin: 0.75rem 0;
          padding-left: 1.5rem;
          list-style: disc;
        }
        .prose-agreement ol {
          list-style: decimal;
        }
        .prose-agreement li + li {
          margin-top: 0.4rem;
        }
        .prose-agreement strong {
          font-weight: 600;
          color: var(--ink, #0f0f0e);
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Acceptance card — reads vendor profile, switches between modes.
// ---------------------------------------------------------------------------

function AcceptanceCard({ isReaccept }: { isReaccept: boolean }): JSX.Element {
  const { user, loading } = useAuth();

  // Anonymous visitor — show a marketing-style hint, no form.
  if (loading) {
    return (
      <section className="rounded-md border border-line bg-white p-6 font-mono text-mono-label uppercase text-text-muted">
        Checking your session…
      </section>
    );
  }

  if (!user) {
    return (
      <section className="rounded-md border border-line bg-white p-6">
        <div className="font-mono text-mono-label uppercase text-text-muted">
          Reading mode
        </div>
        <p className="mt-2 max-w-prose text-body text-text">
          You&apos;re viewing the agreement as a guest. To accept these terms and activate
          a USA Errands vendor account, you need to sign in (or create an account first).
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/login">
            <Button variant="amber" withArrow>
              Sign in
            </Button>
          </Link>
          <Link
            href="/signup"
            className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
          >
            Create account →
          </Link>
        </div>
      </section>
    );
  }

  // Sub-users can't accept on the vendor's behalf. The backend enforces this;
  // we surface a clear explanation in the UI rather than a confusing 403.
  if (user.role === "VENDOR_SUB_USER") {
    return (
      <section className="rounded-md border-l-4 border-amber bg-amber/10 p-5">
        <div className="font-mono text-mono-label uppercase text-amber">Read-only</div>
        <p className="mt-1 text-body-sm text-text">
          Sub-users can read the agreement but only the primary vendor admin on the
          account can accept it. Ask the account owner to sign in and complete this step.
        </p>
      </section>
    );
  }

  if (user.role !== "VENDOR") {
    // Admin staff — they don't have a vendor agreement to accept.
    return (
      <section className="rounded-md border border-line bg-white p-6 text-body-sm text-text-muted">
        You&apos;re signed in as platform staff. The vendor agreement applies to vendor
        accounts only — there&apos;s nothing to accept here.
      </section>
    );
  }

  return <VendorAcceptanceForm isReaccept={isReaccept} />;
}

// ---------------------------------------------------------------------------
// Acceptance form (vendor admin only)
// ---------------------------------------------------------------------------

const formSchema = z.object({
  acknowledged: z.literal(true, {
    errorMap: () => ({ message: "Tick the box to confirm you've read the terms." }),
  }),
  signatureName: z
    .string()
    .trim()
    .min(2, "Type your full name as your e-signature.")
    .max(120, "Keep your name under 120 characters."),
});
type FormInput = z.infer<typeof formSchema>;

function VendorAcceptanceForm({ isReaccept }: { isReaccept: boolean }): JSX.Element {
  const router = useRouter();
  const qc = useQueryClient();

  const profileQ = useQuery({
    queryKey: ["vendor", "me"],
    queryFn: () => api.get<VendorProfile>("/vendors/me"),
  });

  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: { acknowledged: false as unknown as true, signatureName: "" },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  const { bannerError, handle, clear } = useApiErrorHandler(form);

  const acceptMut = useMutation({
    mutationFn: (input: FormInput) =>
      api.post<VendorProfile>("/vendors/me/agreement", {
        version: profileQ.data!.currentAgreementVersion,
        signatureName: input.signatureName,
      }),
    onMutate: clear,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["vendor", "me"] });
      // Land them somewhere useful: verification page if they still need
      // KYC, otherwise dashboard.
      router.push("/verification");
    },
    onError: (err) => handle(err),
  });

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "support") window.location.href = "mailto:hello@myusaerrands.com";
  }

  if (profileQ.isLoading) {
    return (
      <section className="rounded-md border border-line bg-white p-6 font-mono text-mono-label uppercase text-text-muted">
        Loading your account…
      </section>
    );
  }
  if (profileQ.error || !profileQ.data) {
    return (
      <section className="rounded-md border-l-4 border-error bg-error/10 p-5">
        <div className="font-mono text-mono-label uppercase text-error">
          Couldn&apos;t load your account
        </div>
        <p className="mt-1 text-body-sm text-text">
          Reload the page or try signing out and back in.
        </p>
      </section>
    );
  }

  const v = profileQ.data;

  // Already up-to-date — no form, just confirmation.
  if (v.agreementUpToDate && !isReaccept) {
    return (
      <section className="rounded-md border-l-4 border-success bg-success/10 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-mono-label uppercase text-success">
              Agreement on file
            </div>
            <p className="mt-1 text-body-sm text-text">
              {v.businessName} accepted version{" "}
              <span className="font-mono">v{v.agreementVersion}</span>
              {v.agreementAcceptedAt
                ? ` on ${new Date(v.agreementAcceptedAt).toLocaleDateString()}`
                : ""}
              .
            </p>
          </div>
          <Link
            href="/dashboard"
            className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
          >
            Back to portal →
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-line bg-white p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-h3 font-semibold text-ink">
            {v.agreementAcceptedAt ? "Re-accept the updated agreement" : "Accept and continue"}
          </h2>
          <p className="mt-1 max-w-prose text-body-sm text-text-muted">
            {v.agreementAcceptedAt
              ? `You previously accepted v${v.agreementVersion}. We've published a new version (v${v.currentAgreementVersion}). Read the changes below and accept to continue using the platform.`
              : `Once accepted, your account moves to the next step (KYC review if not yet done, otherwise activation). You're accepting on behalf of ${v.businessName}.`}
          </p>
        </div>
        <StatusPill tone="warning">v{v.currentAgreementVersion}</StatusPill>
      </header>

      <form onSubmit={handleSubmit((vals) => acceptMut.mutate(vals))} noValidate className="mt-6 flex flex-col gap-5">
        <label className="flex items-start gap-3 rounded-sm border border-line-strong bg-cream-soft p-4">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0"
            {...register("acknowledged")}
          />
          <span className="text-body-sm text-text">
            I have read the agreement above and I&apos;m accepting it on behalf of{" "}
            <strong>{v.businessName}</strong>. I have authority to bind this business.
          </span>
        </label>
        {errors.acknowledged ? (
          <span className="text-caption text-error">{errors.acknowledged.message}</span>
        ) : null}

        <Field
          label="Your full name (e-signature)"
          hint="Type your full legal name. We record this with the timestamp and your IP for the audit trail."
          error={errors.signatureName?.message}
        >
          <Input
            type="text"
            autoComplete="name"
            invalid={!!errors.signatureName}
            {...register("signatureName")}
          />
        </Field>

        <ErrorBanner error={bannerError} onAction={onAction} />

        <div className="flex justify-end">
          <Button
            type="submit"
            variant="amber"
            size="lg"
            withArrow
            loading={isSubmitting || acceptMut.isPending}
          >
            {v.agreementAcceptedAt ? "Re-accept terms" : "Accept and continue"}
          </Button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// USA Errands Vendor Agreement — final wording.
//
// Effective date below is the date THIS revision was published. To make every
// existing vendor re-accept after a future change, bump `agreement_version`
// in /admin/config/policy alongside any meaningful edit here. The
// AgreementVersionGuard on the API will then 412 every write until the
// vendor signs the new version.
// ---------------------------------------------------------------------------

const AGREEMENT_EFFECTIVE_DATE = "May 14, 2026";

function AgreementText(): JSX.Element {
  return (
    <>
      <p className="text-body-sm text-text-muted">
        <strong>Effective Date:</strong> {AGREEMENT_EFFECTIVE_DATE}
      </p>
      <p>
        This Vendor Services Agreement (&quot;Agreement&quot;) is entered into between{" "}
        <strong>USA Errands</strong>, operating through{" "}
        <strong>MyUSAErrands.com</strong> (&quot;USA Errands,&quot; &quot;Company,&quot;
        &quot;We,&quot; &quot;Us,&quot; &quot;Our&quot;) and the{" "}
        <strong>Vendor</strong> (&quot;Vendor,&quot; &quot;You,&quot; &quot;Your&quot;).
      </p>
      <p>
        By registering an account, submitting inventory, funding a wallet, requesting
        services, or using the USA Errands platform in any manner, Vendor agrees to all
        terms contained herein.
      </p>

      <h2>1. Services Provided</h2>
      <p>
        USA Errands provides third-party logistics and fulfillment services, including
        but not limited to:
      </p>
      <ul>
        <li>inventory receiving</li>
        <li>inventory storage</li>
        <li>SKU assignment and inventory tracking</li>
        <li>order fulfillment</li>
        <li>shipping coordination</li>
        <li>shipping label generation</li>
        <li>optional returns handling</li>
        <li>optional personal shopper and package forwarding services</li>
      </ul>
      <p>
        USA Errands does not manufacture, own, market, distribute, or sell Vendor
        products. USA Errands acts solely as a logistics and operational service
        provider.
      </p>

      <h2>2. Vendor Responsibilities</h2>
      <p>Vendor is solely responsible for:</p>
      <ul>
        <li>product legality</li>
        <li>product safety</li>
        <li>product authenticity</li>
        <li>taxes and duties</li>
        <li>customs compliance</li>
        <li>intellectual property compliance</li>
        <li>customer service</li>
        <li>product warranties</li>
        <li>product labeling requirements</li>
        <li>product recalls</li>
        <li>customer disputes</li>
      </ul>
      <p>
        Vendor agrees all products stored or shipped through USA Errands comply with:
      </p>
      <ul>
        <li>U.S. federal laws</li>
        <li>state laws</li>
        <li>carrier regulations</li>
        <li>import/export regulations</li>
      </ul>
      <p>Vendor shall not use USA Errands for unlawful activity.</p>

      <h2>3. Prohibited Products</h2>
      <p>Vendor may not store, ship, or process:</p>
      <ul>
        <li>illegal products</li>
        <li>counterfeit goods</li>
        <li>hazardous materials</li>
        <li>explosives</li>
        <li>firearms or weapon-related items</li>
        <li>restricted chemicals</li>
        <li>prohibited pharmaceuticals</li>
        <li>perishable goods without written approval</li>
        <li>products prohibited by carriers or applicable law</li>
      </ul>
      <p>USA Errands reserves the right to:</p>
      <ul>
        <li>reject</li>
        <li>quarantine</li>
        <li>return</li>
        <li>destroy</li>
        <li>report</li>
      </ul>
      <p>prohibited inventory without liability. Any associated costs shall be charged to Vendor.</p>

      <h2>4. Account Registration &amp; KYC</h2>
      <p>Vendor must provide accurate onboarding information including:</p>
      <ul>
        <li>legal identity</li>
        <li>business details</li>
        <li>government-issued identification</li>
        <li>contact information</li>
      </ul>
      <p>USA Errands reserves the right to:</p>
      <ul>
        <li>approve or reject applications</li>
        <li>request additional verification</li>
        <li>suspend accounts for inaccurate information</li>
      </ul>
      <p>
        Vendor authorizes USA Errands to verify submitted information through third-party
        verification providers.
      </p>

      <h2>5. Inventory Receiving &amp; Storage</h2>
      <h3>5.1 Receiving</h3>
      <p>All inbound inventory must:</p>
      <ul>
        <li>match submitted shipment information in PSN</li>
        <li>use accurate declared value and product weight when submitting PSN</li>
        <li>be packaged appropriately</li>
        <li>comply with USA Errands receiving standards</li>
      </ul>
      <p>USA Errands will inspect inbound inventory upon receipt. Inventory discrepancies may result in:</p>
      <ul>
        <li>delays</li>
        <li>additional fees</li>
        <li>rejection</li>
        <li>inventory hold</li>
      </ul>

      <h3>5.2 Storage Fees</h3>
      <p>Storage fees are based on:</p>
      <ul>
        <li>inventory dimensions</li>
        <li>storage tier</li>
        <li>occupied warehouse space</li>
      </ul>
      <h3>Important Billing Policy</h3>
      <p>Storage fees are automatically billed on the first day of every month.</p>
      <p>
        Vendor is solely responsible for maintaining sufficient wallet balance prior to
        monthly billing.
      </p>
      <p>Failure to maintain sufficient balance may result in:</p>
      <ul>
        <li>account restrictions</li>
        <li>fulfillment suspension</li>
        <li>overdue penalties</li>
        <li>inventory hold</li>
      </ul>
      <p>Storage fees continue accruing while inventory remains stored.</p>

      <h3>5.3 Storage Tier Audits &amp; Optimization</h3>
      <p>
        USA Errands may conduct periodic inventory audits and storage assessments to:
      </p>
      <ul>
        <li>optimize warehouse space</li>
        <li>recommend consolidation</li>
        <li>reduce unnecessary storage costs</li>
      </ul>
      <p>USA Errands reserves the right to:</p>
      <ul>
        <li>reclassify improperly categorized inventory</li>
        <li>adjust storage tiers based on actual dimensions or usage</li>
      </ul>
      <p>Vendor will be notified of material billing changes where applicable.</p>

      <h2>6. Wallet System &amp; Payments</h2>
      <p>USA Errands operates on a prepaid wallet-based billing system. Vendor agrees:</p>
      <ul>
        <li>all services are prepaid</li>
        <li>no negative balances are permitted</li>
        <li>fees and recurring storage fees may be automatically deducted from wallet balance</li>
      </ul>
      <p>Fees may include:</p>
      <ul>
        <li>onboarding fees</li>
        <li>receiving fees</li>
        <li>storage fees</li>
        <li>fulfillment fees</li>
        <li>shipping fees</li>
        <li>returns fees</li>
        <li>payment processing fees</li>
        <li>handling charges</li>
      </ul>
      <p>Vendor is solely responsible for:</p>
      <ul>
        <li>maintaining sufficient wallet balance</li>
        <li>monitoring account activity</li>
      </ul>
      <p>USA Errands shall not be liable for operational delays caused by insufficient wallet funds.</p>

      <h2>7. Payment Processing</h2>
      <p>Payments may be processed through:</p>
      <ul>
        <li>Stripe</li>
        <li>other approved providers</li>
      </ul>
      <p>Vendor authorizes automatic fee deductions where applicable.</p>
      <p>Payment processor fees may be passed through to Vendor.</p>
      <p>USA Errands reserves the right to:</p>
      <ul>
        <li>suspend orders pending payment verification</li>
        <li>delay fulfillment for fraud review</li>
        <li>reject high-risk transactions</li>
      </ul>

      <h2>8. Order Fulfillment &amp; Shipping</h2>
      <p>Vendor submits fulfillment requests through the platform. USA Errands shall:</p>
      <ul>
        <li>pick inventory</li>
        <li>pack orders</li>
        <li>generate labels</li>
        <li>coordinate shipment dispatch</li>
      </ul>
      <p>Estimated timelines are not guaranteed. USA Errands is not liable for:</p>
      <ul>
        <li>shipping carrier delays</li>
        <li>customs delays</li>
        <li>weather events</li>
        <li>delivery failures</li>
        <li>incorrect addresses supplied by Vendor</li>
        <li>package theft after carrier-confirmed delivery</li>
      </ul>
      <p>Shipping fees are separate from fulfillment fees. Shipping costs may vary based on:</p>
      <ul>
        <li>dimensions</li>
        <li>weight</li>
        <li>carrier</li>
        <li>destination</li>
        <li>delivery speed</li>
      </ul>

      <h2>9. Returns Management</h2>
      <p>Returns handling is optional and subject to approval. Returned inventory may:</p>
      <ul>
        <li>be restocked</li>
        <li>quarantined</li>
        <li>discarded</li>
        <li>returned to Vendor</li>
      </ul>
      <p>Additional fees may apply. USA Errands is not liable for:</p>
      <ul>
        <li>return fraud</li>
        <li>damaged returned goods</li>
        <li>customer misuse</li>
      </ul>

      <h2>10. Inventory Liability Limitations</h2>
      <p>USA Errands shall exercise commercially reasonable care in handling inventory.</p>
      <p>However, USA Errands shall not be liable for:</p>
      <ul>
        <li>force majeure events</li>
        <li>theft outside reasonable control</li>
        <li>hidden product defects</li>
        <li>manufacturer defects</li>
        <li>carrier damage</li>
        <li>customs seizure</li>
        <li>natural disasters</li>
        <li>acts of government</li>
        <li>cyber incidents beyond reasonable control</li>
      </ul>
      <h3>Liability Cap</h3>
      <p>USA Errands&apos; total liability for any claim shall not exceed the lesser of:</p>
      <ul>
        <li>declared inventory value</li>
        <li>actual replacement cost</li>
        <li>$100 per affected storage unit</li>
      </ul>
      <p>unless otherwise agreed in writing.</p>
      <p>Vendor is strongly encouraged to maintain independent inventory insurance.</p>

      <h2>11. Abandoned Inventory</h2>
      <p>Inventory may be deemed abandoned if:</p>
      <ul>
        <li>storage fees remain unpaid</li>
        <li>Vendor becomes unreachable</li>
        <li>account remains inactive</li>
        <li>balances remain overdue</li>
      </ul>
      <p>USA Errands may:</p>
      <ul>
        <li>dispose</li>
        <li>liquidate</li>
        <li>recycle</li>
        <li>donate</li>
        <li>destroy</li>
      </ul>
      <p>abandoned inventory after reasonable notice. Vendor remains responsible for all associated costs.</p>

      <h2>12. Platform Access &amp; Acceptable Use</h2>
      <p>Vendor receives limited, revocable access to the USA Errands platform. Vendor may not:</p>
      <ul>
        <li>attempt unauthorized access</li>
        <li>interfere with platform operations</li>
        <li>exploit vulnerabilities</li>
        <li>misuse payment systems</li>
        <li>engage in fraudulent activity</li>
      </ul>
      <p>USA Errands may suspend or terminate access at its sole discretion.</p>

      <h2>13. Intellectual Property</h2>
      <p>Vendor retains ownership of:</p>
      <ul>
        <li>trademarks</li>
        <li>product content</li>
        <li>branding</li>
      </ul>
      <p>Vendor grants USA Errands limited rights necessary to:</p>
      <ul>
        <li>process fulfillment</li>
        <li>generate labels</li>
        <li>display inventory information operationally</li>
      </ul>

      <h2>14. Confidentiality</h2>
      <p>Both parties agree to maintain confidentiality regarding:</p>
      <ul>
        <li>operational information</li>
        <li>pricing</li>
        <li>customer data</li>
        <li>business information</li>
      </ul>
      <p>except where disclosure is legally required.</p>

      <h2>15. Disclaimer of Warranties</h2>
      <p>
        USA Errands services are provided <strong>&quot;AS IS&quot;</strong> and{" "}
        <strong>&quot;AS AVAILABLE&quot;</strong>. USA Errands makes no guarantees
        regarding:
      </p>
      <ul>
        <li>uninterrupted availability</li>
        <li>error-free operation</li>
        <li>guaranteed delivery times</li>
        <li>profitability</li>
      </ul>

      <h2>16. Limitation of Liability</h2>
      <p>To the maximum extent permitted by law, USA Errands shall not be liable for:</p>
      <ul>
        <li>indirect damages</li>
        <li>consequential damages</li>
        <li>lost profits</li>
        <li>reputational harm</li>
        <li>business interruption</li>
        <li>loss of goodwill</li>
      </ul>
      <p>
        Total liability shall not exceed amounts paid by Vendor within the preceding 30
        days for affected services.
      </p>

      <h2>17. Indemnification</h2>
      <p>
        Vendor agrees to indemnify and hold harmless USA Errands, its owners, employees,
        affiliates, and contractors from claims arising from:
      </p>
      <ul>
        <li>Vendor products</li>
        <li>legal violations</li>
        <li>intellectual property claims</li>
        <li>customs violations</li>
        <li>customer claims</li>
        <li>prohibited products</li>
        <li>tax obligations</li>
      </ul>

      <h2>18. Termination</h2>
      <p>Either party may terminate this Agreement at any time. Vendor remains responsible for:</p>
      <ul>
        <li>outstanding balances</li>
        <li>storage fees</li>
        <li>removal costs</li>
        <li>unpaid invoices</li>
      </ul>
      <p>Storage charges continue until inventory is removed.</p>

      <h2>19. Modifications</h2>
      <p>USA Errands reserves the right to modify:</p>
      <ul>
        <li>pricing</li>
        <li>policies</li>
        <li>platform features</li>
        <li>operational procedures</li>
      </ul>
      <p>Continued use constitutes acceptance of revised terms.</p>

      <h2>20. Governing Law &amp; Disputes</h2>
      <p>
        This Agreement shall be governed under the laws of the State of Texas, United
        States.
      </p>
      <p>Any disputes shall be resolved through:</p>
      <ul>
        <li>binding arbitration, or</li>
        <li>courts located within the governing jurisdiction</li>
      </ul>
      <p>at USA Errands&apos; discretion. Vendor waives participation in class-action proceedings.</p>

      <h2>21. Force Majeure</h2>
      <p>USA Errands shall not be liable for delays or failures caused by:</p>
      <ul>
        <li>natural disasters</li>
        <li>war</li>
        <li>labor disputes</li>
        <li>internet outages</li>
        <li>government actions</li>
        <li>pandemics</li>
        <li>carrier disruptions</li>
      </ul>

      <h2>22. Entire Agreement</h2>
      <p>
        This Agreement constitutes the full agreement between parties and supersedes
        prior understandings.
      </p>

      <h2>23. Acceptance</h2>
      <p>
        By checking the agreement box, creating an account, shipping inventory, funding a
        wallet, or using USA Errands services, Vendor acknowledges and agrees to all
        terms herein.
      </p>

      <p className="mt-10 text-body-sm text-text-muted">
        <em>
          Vendor acceptance — including timestamp, IP address, and the agreement version
          shown above — is recorded automatically when you tick the acceptance box and
          submit your full legal name as your e-signature. A downloadable copy of the
          accepted agreement is available from your account settings at any time.
        </em>
      </p>
    </>
  );
}
