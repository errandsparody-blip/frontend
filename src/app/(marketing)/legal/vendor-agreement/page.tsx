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

        <footer className="rounded-md border-l-4 border-line-strong bg-cream-soft p-5 text-body-sm text-text-muted">
          Questions about these terms? Contact{" "}
          <a
            href="mailto:legal@usa-errands.com"
            className="font-medium text-ink underline-offset-4 hover:underline"
          >
            legal@usa-errands.com
          </a>
          .
        </footer>
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
    if (handler === "support") window.location.href = "mailto:support@usa-errands.com";
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

const AGREEMENT_EFFECTIVE_DATE = "May 9, 2026";

function AgreementText(): JSX.Element {
  return (
    <>
      <p className="text-body-sm text-text-muted">
        <strong>Effective Date:</strong> {AGREEMENT_EFFECTIVE_DATE}
      </p>
      <p>
        This Vendor Agreement (&quot;Agreement&quot;) is entered into between{" "}
        <strong>USA Errands</strong>, operating through{" "}
        <strong>MyUSAErrands.com</strong> (&quot;Company,&quot; &quot;USA Errands,&quot;
        &quot;We,&quot; &quot;Us&quot;) and the <strong>Vendor</strong> (&quot;Vendor,&quot;
        &quot;You,&quot; &quot;Your&quot;).
      </p>
      <p>
        By creating an account, using the platform, shipping inventory, or requesting
        fulfillment services, Vendor agrees to all terms below.
      </p>

      <h2>1. Services Provided</h2>
      <p>USA Errands provides:</p>
      <ul>
        <li>Inventory receiving</li>
        <li>Inventory storage</li>
        <li>SKU inventory tracking</li>
        <li>Order fulfillment</li>
        <li>Shipping label generation</li>
        <li>Shipping coordination</li>
        <li>Optional returns handling (if enabled)</li>
      </ul>
      <p>
        USA Errands acts solely as a logistics and fulfillment provider and does not own
        Vendor inventory.
      </p>

      <h2>2. Vendor Responsibilities</h2>
      <p>Vendor agrees to:</p>
      <ul>
        <li>Provide accurate product information</li>
        <li>Ensure all products are legal for sale and shipment in the United States</li>
        <li>Maintain sufficient wallet balance at all times</li>
        <li>Ensure product quality and compliance</li>
        <li>Provide accurate shipping information for all fulfillment requests</li>
      </ul>
      <p>Vendor remains fully responsible for:</p>
      <ul>
        <li>product legality</li>
        <li>product safety</li>
        <li>taxes</li>
        <li>customs compliance</li>
        <li>intellectual property claims</li>
        <li>customer disputes regarding products</li>
      </ul>

      <h2>3. Prohibited Products</h2>
      <p>Vendor may NOT ship or store:</p>
      <ul>
        <li>Illegal products</li>
        <li>Hazardous materials</li>
        <li>Weapons or firearm-related items</li>
        <li>Explosives</li>
        <li>Counterfeit products</li>
        <li>Perishable goods (unless approved)</li>
        <li>Restricted medical products</li>
        <li>Any product prohibited by U.S. law or carrier policies</li>
      </ul>
      <p>
        USA Errands reserves the right to reject, quarantine, or dispose of prohibited
        inventory at Vendor&apos;s expense.
      </p>

      <h2>4. Inventory Receiving &amp; Onboarding</h2>
      <p>Vendor inventory must:</p>
      <ul>
        <li>
          Be properly packaged using our declared storage-tier box dimensions to ensure
          proper storage-fee generation during PSN creation
        </li>
        <li>Include accurate shipment details</li>
        <li>Match submitted inventory records</li>
      </ul>
      <p>Upon receiving inventory:</p>
      <ul>
        <li>USA Errands will inspect packages</li>
        <li>SKUs may be assigned or generated</li>
        <li>
          Inventory quantities will be acknowledged to match the manifest before being
          reflected in the system and the vendor inventory dashboard
        </li>
      </ul>
      <p>
        An onboarding fee, consisting of a stocking fee plus the first month&apos;s
        storage, applies to every new PSN. Beginning the second month, only storage fees
        apply to the referenced PSN.
      </p>

      <h2>5. Storage Fees</h2>
      <p>
        Storage fees are billed monthly based on the assigned storage-box tier declared
        during PSN creation.
      </p>
      <h3>Important Billing Policy</h3>
      <p>Storage fees are automatically billed on the first day of every month.</p>
      <p>
        Vendor is solely responsible for ensuring sufficient wallet balance is available
        before monthly billing occurs.
      </p>
      <p>Storage fees apply regardless of whether inventory sells or ships.</p>
      <p>Failure to maintain sufficient balance may result in:</p>
      <ul>
        <li>fulfillment suspension</li>
        <li>order processing delays</li>
        <li>inventory hold</li>
        <li>restricted account access</li>
        <li>eventual inventory disposal after notice period</li>
      </ul>
      <p>
        USA Errands reserves the right to continue charging storage fees while inventory
        remains in storage.
      </p>

      <h2>5A. Storage Tier Review &amp; Inventory Optimization</h2>
      <p>
        USA Errands may conduct periodic inventory storage reviews and audits, including
        quarterly storage-tier assessments, to ensure efficient warehouse space
        utilization.
      </p>
      <p>During these reviews, USA Errands may:</p>
      <ul>
        <li>evaluate inventory dimensions and storage usage</li>
        <li>recommend inventory consolidation</li>
        <li>recommend repackaging or space optimization</li>
        <li>recommend movement to more suitable storage tiers</li>
      </ul>
      <p>The purpose of these reviews is to:</p>
      <ul>
        <li>improve storage efficiency</li>
        <li>reduce unnecessary storage costs for Vendors</li>
        <li>maintain organized warehouse operations</li>
      </ul>
      <p>Vendor acknowledges that:</p>
      <ul>
        <li>
          New storage fees will be based on the assigned storage-box tier reclassified
          following the periodic or quarterly storage audit
        </li>
        <li>inventory configuration may impact monthly storage costs</li>
        <li>USA Errands may provide recommendations to optimize storage expenses</li>
      </ul>
      <p>
        Any changes affecting billing or storage-tier classification will be communicated
        to Vendor before implementation where applicable.
      </p>
      <p>
        USA Errands reserves the right to reclassify improperly categorized inventory if
        actual storage usage materially differs from declared storage requirements.
      </p>

      <h2>6. Wallet &amp; Payments</h2>
      <p>USA Errands operates on a prepaid wallet system. Vendor agrees that:</p>
      <ul>
        <li>all services are prepaid</li>
        <li>orders will not process without sufficient balance</li>
        <li>fees may be automatically deducted from the wallet balance</li>
      </ul>
      <p>Fees may include:</p>
      <ul>
        <li>onboarding fees</li>
        <li>storage fees</li>
        <li>fulfillment fees</li>
        <li>shipping costs</li>
        <li>returns handling fees</li>
        <li>payment processing fees</li>
      </ul>
      <p>Vendor is responsible for maintaining sufficient wallet balance at all times.</p>
      <p>USA Errands shall not be liable for delays caused by insufficient wallet funds.</p>

      <h2>7. Order Fulfillment</h2>
      <p>Vendor submits fulfillment requests through the platform. USA Errands will:</p>
      <ul>
        <li>pick inventory</li>
        <li>pack orders</li>
        <li>print generated shipping labels</li>
        <li>dispatch shipments</li>
      </ul>
      <p>Estimated processing timelines are not guaranteed.</p>
      <p>USA Errands is not liable for:</p>
      <ul>
        <li>shipping carrier delays</li>
        <li>public holiday or festive-celebration carrier delays</li>
        <li>weather disruptions</li>
        <li>customs delays</li>
        <li>incorrect addresses provided by Vendor</li>
      </ul>

      <h2>8. Shipping &amp; Labels</h2>
      <p>
        Shipping costs are calculated using carrier rates through integrated shipping
        APIs. Vendor agrees that:
      </p>
      <ul>
        <li>shipping fees must be prepaid</li>
        <li>
          shipping charges may vary by weight, dimensions, destination, and carrier
          selected
        </li>
      </ul>
      <p>Tracking information will be provided once labels are generated.</p>
      <p>
        USA Errands reserves the right to adjust shipping charges if package measurements
        differ from vendor-provided information.
      </p>

      <h2>9. Returns Management</h2>
      <p>Returns handling is optional and must be enabled by Vendor. If enabled:</p>
      <ul>
        <li>returned inventory may be inspected</li>
        <li>additional handling or storage fees may apply</li>
        <li>USA Errands is not responsible for damaged returned products</li>
      </ul>
      <p>Vendor may be charged:</p>
      <ul>
        <li>return processing fees</li>
        <li>restocking fees</li>
        <li>additional storage fees</li>
      </ul>

      <h2>10. Inventory Liability</h2>
      <p>USA Errands will exercise utmost care in handling inventory. However, USA Errands is NOT responsible for:</p>
      <ul>
        <li>manufacturer defects</li>
        <li>hidden product damage</li>
        <li>loss caused by carriers</li>
        <li>force majeure events</li>
        <li>unavoidable operational errors</li>
        <li>customer misuse of products</li>
      </ul>
      <p>Vendor is encouraged to maintain inventory insurance where necessary.</p>

      <h2>11. Abandoned Inventory</h2>
      <p>Inventory may be considered abandoned if:</p>
      <ul>
        <li>Vendor account remains unpaid up to 30 days after due date</li>
        <li>Vendor becomes unreachable</li>
        <li>Inventory remains inactive for extended periods</li>
        <li>Wallet balance remains overdue beyond stated notice periods</li>
      </ul>
      <p>
        USA Errands may dispose of, liquidate, recycle, or donate abandoned inventory
        after reasonable notice.
      </p>
      <p>Any disposal or removal costs may be charged to Vendor.</p>

      <h2>12. Platform Access</h2>
      <p>Vendor receives limited access to:</p>
      <ul>
        <li>inventory dashboard</li>
        <li>wallet system</li>
        <li>order system</li>
        <li>shipment tracking</li>
      </ul>
      <p>Vendor may not:</p>
      <ul>
        <li>attempt unauthorized system access</li>
        <li>misuse platform tools</li>
        <li>interfere with platform operations</li>
        <li>manipulate wallet or payment systems</li>
      </ul>
      <p>
        USA Errands may suspend accounts for abuse, fraud, suspicious activity, or
        policy violations.
      </p>

      <h2>13. Limitation of Liability</h2>
      <p>USA Errands&apos; total liability shall not exceed:</p>
      <ul>
        <li>
          the amount paid by Vendor for the affected services within the previous 30 days
        </li>
      </ul>
      <p>USA Errands shall not be liable for:</p>
      <ul>
        <li>indirect damages</li>
        <li>lost profits</li>
        <li>business interruption</li>
        <li>reputational loss</li>
        <li>carrier-related delivery failures</li>
      </ul>

      <h2>14. Termination</h2>
      <p>
        Either party may terminate this Agreement at any time, provided there are no
        overdue or pending payments.
      </p>
      <p>Vendor remains responsible for:</p>
      <ul>
        <li>outstanding fees</li>
        <li>inventory removal costs</li>
        <li>unpaid storage fees</li>
      </ul>
      <p>Inventory must be removed within the stated notice period after termination.</p>
      <p>
        Storage fees continue accruing until inventory is removed from USA Errands
        facilities.
      </p>

      <h2>15. Modifications</h2>
      <p>
        USA Errands may update pricing, policies, platform features, or operational
        procedures periodically. Continued use of services constitutes acceptance of
        updated terms.
      </p>

      <h2>16. Governing Law</h2>
      <p>
        This Agreement shall be governed under the laws of the State of Texas, United
        States.
      </p>

      <h2>17. Acceptance</h2>
      <p>
        By signing up, checking the acceptance box, shipping inventory, funding a wallet,
        or using USA Errands services, Vendor confirms agreement to all terms stated
        herein.
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
