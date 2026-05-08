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
 * The legal text below is a v0 PLACEHOLDER. Engineering can wire any
 * subsequent revision through the same route — bumping
 * `agreement_version` in /admin/config/policy is what makes existing
 * vendors get prompted to re-accept (via the AgreementVersionGuard).
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
// The agreement text itself — a v0 placeholder. Replace with the legal
// team's final wording when ready. Bumping the wording here without also
// bumping `agreement_version` in /admin/config/policy means existing
// vendors WON'T be re-prompted, so coordinate the two.
// ---------------------------------------------------------------------------

function AgreementText(): JSX.Element {
  return (
    <>
      <h2>1. The relationship</h2>
      <p>
        These terms (the &quot;Agreement&quot;) form a contract between you (the
        &quot;Vendor&quot;) and USA Errands, Inc. (&quot;USA Errands,&quot; &quot;we,&quot;
        or &quot;us&quot;). By creating a vendor account or clicking &quot;Accept&quot;
        below, you agree to be bound by the Agreement on behalf of the business you
        represent. You confirm that you have authority to enter into this Agreement on
        the business&apos;s behalf.
      </p>

      <h2>2. What we do</h2>
      <p>
        USA Errands provides U.S.-based receiving, storage, fulfillment, and returns
        services for inventory you ship to our warehouse. Specifically:
      </p>
      <ul>
        <li>We receive and inspect inbound boxes you declare in a Pre-Shipment Notice (PSN).</li>
        <li>We store accepted inventory and bill monthly storage at the rates published in the fee schedule.</li>
        <li>We pick, pack, label, and hand off orders you submit to us, charging the published fulfillment fee.</li>
        <li>We process returns sent to our address, charging the published returns-handling fee.</li>
      </ul>
      <p>
        We do not act as a merchant of record, do not collect sales tax on your behalf,
        and do not advise on customs or tax positions for any specific jurisdiction.
      </p>

      <h2>3. Fees and the wallet</h2>
      <p>
        All fees are debited from your USA Errands wallet. You are responsible for
        funding the wallet via Stripe, Wise, Payoneer, or another method we support. If
        the wallet has insufficient funds, we may pause new shipments and orders until
        the balance is restored. Specific rates are published at the &quot;Pricing&quot;
        page and in the fee schedule the platform reads at submit time. We may update
        published fees with at least thirty (30) days&apos; notice.
      </p>
      <ul>
        <li>
          <strong>Onboarding fee.</strong> Charged when you submit a PSN. Computed from the
          declared box mix at the rates in effect on the submission date.
        </li>
        <li>
          <strong>Storage.</strong> Recurring monthly charge per box still in inventory at
          bill date. Pallet rates are negotiated separately.
        </li>
        <li>
          <strong>Fulfillment.</strong> Per-order base fee plus a per-additional-unit fee.
        </li>
        <li>
          <strong>Returns handling.</strong> Per-return inspection / restock fee.
        </li>
        <li>
          <strong>Repackaging.</strong> Charged when inbound packaging is non-standard and
          we have to repack into our tier system.
        </li>
      </ul>

      <h2>4. Inventory and risk of loss</h2>
      <p>
        Title to your inventory remains with you at all times. We will exercise reasonable
        commercial care while inventory is in our custody, including standard insurance
        on the warehouse premises. We are not liable for loss or damage caused by carrier
        handling, force majeure, or your packaging deficiencies. For high-value
        inventory, you may purchase additional carrier insurance at quote time.
      </p>

      <h2>5. Prohibited inventory</h2>
      <p>
        You will not ship and we will not accept any inventory that is illegal under
        U.S. federal law, hazardous, perishable, regulated as a firearm or weapon, or
        otherwise prohibited under our Acceptable Inventory Policy (referenced from this
        Agreement and updated from time to time). We may refuse, dispose of, or return at
        your cost any non-compliant inventory we discover at receiving.
      </p>

      <h2>6. Compliance and KYC</h2>
      <p>
        Before activation, we verify your business identity (&quot;KYC&quot;) using public
        information, social handles, and a vendor agreement on file. We may pause or
        suspend your account if we cannot verify identity, if we receive credible reports
        of policy violations, or if required by law.
      </p>

      <h2>7. Data, privacy, and audit logs</h2>
      <p>
        We capture a tamper-evident audit log of every operational change you make
        (PSNs, orders, returns, settings, agreement acceptance) along with timestamps and
        actor information. We retain this log for at least seven (7) years for compliance
        purposes. Personal data is handled in accordance with our Privacy Policy.
      </p>

      <h2>8. Suspension and termination</h2>
      <p>
        Either party may end this Agreement on thirty (30) days&apos; written notice. We
        may suspend or terminate immediately for prohibited inventory, sustained
        non-payment after notice, fraud, or breach of this Agreement that is not cured
        within fifteen (15) days. Upon termination you have ninety (90) days to retrieve
        any remaining inventory at your cost; after that we may dispose of it.
      </p>

      <h2>9. Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, USA ERRANDS&apos;S TOTAL LIABILITY UNDER
        THIS AGREEMENT IS LIMITED TO THE FEES YOU PAID US IN THE TWELVE MONTHS PRECEDING
        THE EVENT GIVING RISE TO THE CLAIM. NEITHER PARTY IS LIABLE FOR INDIRECT,
        SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.
      </p>

      <h2>10. Governing law and disputes</h2>
      <p>
        This Agreement is governed by the laws of the State of Delaware, without regard to
        conflicts of law principles. Any dispute arising from or relating to this
        Agreement will be resolved exclusively by binding arbitration in New Castle
        County, Delaware, administered by the AAA under its Commercial Arbitration
        Rules.
      </p>

      <h2>11. Updates to this Agreement</h2>
      <p>
        We may publish revised versions of this Agreement. When we do, we increment the
        version number visible above. Continued use of your account after the new
        version&apos;s effective date constitutes acceptance, and the platform will prompt
        you to formally re-accept on next sign-in. If you do not accept, we will pause
        write actions on your account until you do.
      </p>

      <p className="mt-10 text-body-sm text-text-muted">
        <em>
          DRAFT v0 placeholder — replace with your legal team&apos;s final wording
          before launch. Bumping the legal text here without bumping{" "}
          <code>agreement_version</code> in <code>/admin/config/policy</code> means
          existing vendors will NOT be re-prompted.
        </em>
      </p>
    </>
  );
}
