"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { api } from "@/lib/api-client";

interface VendorMe {
  id: string;
  businessName: string;
  country: string;
  kycStatus: "PENDING" | "IN_PROGRESS" | "REQUIRES_RESUBMISSION" | "APPROVED" | "REJECTED" | "EXPIRED";
  agreementAcceptedAt: string | null;
  agreementVersion: string | null;
  status: "PENDING_KYC" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  createdAt: string;
}

const KYC_TONE = {
  PENDING: "warning",
  IN_PROGRESS: "info",
  REQUIRES_RESUBMISSION: "warning",
  APPROVED: "success",
  REJECTED: "error",
  EXPIRED: "error",
} as const;

export default function DashboardPage() {
  const meQ = useQuery({
    queryKey: ["vendors", "me"],
    queryFn: () => api.get<VendorMe>("/vendors/me"),
  });
  const productsQ = useQuery({
    queryKey: ["products", { limit: 1 }],
    queryFn: () => api.get<{ items: unknown[]; nextCursor: string | null }>("/products?limit=1"),
  });
  const psnQ = useQuery({
    queryKey: ["psns", { limit: 1 }],
    queryFn: () => api.get<{ items: unknown[]; nextCursor: string | null }>("/psns?limit=1"),
  });

  const me = meQ.data;
  const productsCount = productsQ.data?.items.length ?? 0;
  const psnCount = psnQ.data?.items.length ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="[01] Overview"
        title={me ? me.businessName : "Welcome"}
        description={
          me
            ? `Account active since ${new Date(me.createdAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}.`
            : "Loading account…"
        }
        actions={
          me ? <StatusPill tone={KYC_TONE[me.kycStatus]}>{`KYC: ${me.kycStatus.replace("_", " ")}`}</StatusPill> : null
        }
      />

      {me ? <VerificationCard me={me} /> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Tile
          eyebrow="[A] Catalogue"
          value={productsCount.toString()}
          unit={productsCount === 1 ? "product" : "products"}
          ctaHref="/products"
          ctaLabel="Manage products"
        />
        <Tile
          eyebrow="[B] Inbound"
          value={psnCount.toString()}
          unit={psnCount === 1 ? "PSN" : "PSNs"}
          ctaHref="/psn"
          ctaLabel="View PSNs"
        />
        <Tile eyebrow="[C] Inventory" value="—" unit="on hand" ctaHref="/inventory" ctaLabel="Open inventory" />
      </section>
    </div>
  );
}

function Tile(props: {
  eyebrow: string;
  value: string;
  unit: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <Link
      href={props.ctaHref}
      className="group flex flex-col gap-3 rounded-md border border-line bg-white p-6 transition-colors duration-fast ease-out hover:border-line-strong"
    >
      <div className="font-mono text-mono-eyebrow uppercase text-amber">{props.eyebrow}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-display-lg font-medium tabular-nums text-ink">{props.value}</span>
        <span className="font-mono text-mono-label uppercase text-text-muted">{props.unit}</span>
      </div>
      <span className="mt-2 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted group-hover:text-ink">
        {props.ctaLabel} →
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// VerificationCard — first-class dashboard surface for the KYC flow.
//
// Why a card and not the previous thin banner: when a vendor lands on the
// dashboard for the first time, the banner is easy to skim past. KYC is the
// thing they have to do BEFORE the platform is useful, so it gets the same
// visual weight as Catalogue / Inbound / Inventory below.
//
// The card's content adapts to status:
//   PENDING / EXPIRED                 → green-light to start
//   IN_PROGRESS                       → "in review, sit tight"
//   REQUIRES_RESUBMISSION             → "fix and resubmit"
//   REJECTED                          → "contact support"
//   APPROVED                          → card is hidden (account is verified)
// ---------------------------------------------------------------------------

interface VerificationCardCopy {
  /** Border + accent color. */
  tone: "amber" | "error" | "success";
  /** Mono-eyebrow text above the headline. */
  eyebrow: string;
  /** Big headline. */
  title: string;
  /** Body paragraph. */
  body: string;
  /** Primary CTA (omit for terminal states like APPROVED / hidden). */
  cta: { label: string; href: string } | null;
}

function copyForStatus(
  status: VendorMe["kycStatus"],
  agreementAcceptedAt: string | null,
): VerificationCardCopy | null {
  switch (status) {
    case "APPROVED":
      if (!agreementAcceptedAt) {
        // KYC done, but the vendor agreement is still unsigned — they're
        // still locked out of shipping. Route the operator straight to
        // the page that *actually accepts the agreement* (the legal
        // vendor-agreement view, which has a sign + accept button). The
        // older copy here sent them to /settings, which only displays
        // the acceptance status and has no signing action — vendors
        // reported it felt like a dead-end "page isn't here" moment.
        return {
          tone: "amber",
          eyebrow: "Verification · One step left",
          title: "Accept the vendor agreement to activate your account.",
          body: "Your KYC is approved. Read and accept the vendor agreement to unlock shipments and orders.",
          cta: { label: "Read & accept →", href: "/legal/vendor-agreement" },
        };
      }
      // Verified + agreement signed — no need to nag. Card is hidden.
      return null;
    case "IN_PROGRESS":
      return {
        tone: "amber",
        eyebrow: "Verification · In review",
        title: "We're verifying your business.",
        body: "Our team is reviewing your details. Most accounts are verified within one business day. We'll email you the result.",
        cta: { label: "View status →", href: "/verification" },
      };
    case "REQUIRES_RESUBMISSION":
      return {
        tone: "amber",
        eyebrow: "Verification · Action needed",
        title: "Almost there — small fixes needed.",
        body: "Our reviewer left a note. Address it and resubmit; we'll re-review automatically.",
        cta: { label: "See note & resubmit →", href: "/verification" },
      };
    case "REJECTED":
      return {
        tone: "error",
        eyebrow: "Verification · Declined",
        title: "We couldn't verify your account.",
        body: "Reach out if you have additional documentation that addresses our reviewer's note.",
        cta: { label: "Contact support →", href: "mailto:support@myusaerrands.com" },
      };
    case "EXPIRED":
      return {
        tone: "amber",
        eyebrow: "Verification · Expired",
        title: "Your verification expired.",
        body: "Confirm your details are current, then resubmit for a fresh review.",
        cta: { label: "Resubmit →", href: "/verification" },
      };
    case "PENDING":
    default:
      return {
        tone: "amber",
        eyebrow: "Verification · Required",
        title: "Verify your business to unlock the platform.",
        body: "You can't ship inventory in or place orders until your account is verified. It usually takes one business day once you submit.",
        cta: { label: "Start verification →", href: "/verification" },
      };
  }
}

const TONE_STYLES: Record<VerificationCardCopy["tone"], { border: string; accent: string }> = {
  amber: { border: "border-amber", accent: "text-amber" },
  error: { border: "border-error", accent: "text-error" },
  success: { border: "border-success", accent: "text-success" },
};

function VerificationCard({ me }: { me: VendorMe }) {
  const copy = copyForStatus(me.kycStatus, me.agreementAcceptedAt);
  if (!copy) return null;
  const styles = TONE_STYLES[copy.tone];

  return (
    <section
      className={`rounded-md border-l-4 ${styles.border} bg-white p-6`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-prose">
          <div
            className={`font-mono text-mono-eyebrow uppercase ${styles.accent}`}
          >
            {copy.eyebrow}
          </div>
          <h2 className="mt-2 text-h2 font-semibold text-ink">{copy.title}</h2>
          <p className="mt-2 text-body-sm text-text-muted">{copy.body}</p>
        </div>
        {copy.cta ? (
          <Link
            href={copy.cta.href}
            className={`shrink-0 self-start whitespace-nowrap rounded-sm bg-ink px-5 py-3 font-mono text-[11px] uppercase tracking-[1.4px] text-text-inv transition-colors duration-fast ease-out hover:bg-ink/90`}
          >
            {copy.cta.label}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
