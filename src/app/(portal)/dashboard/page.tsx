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

      {me && me.status === "PENDING_KYC" ? (
        <div className="rounded-md border-l-4 border-amber bg-amber/10 px-5 py-4">
          <div className="font-mono text-mono-label uppercase text-amber">Action required</div>
          <p className="mt-1 text-body-sm text-text">
            Your account is pending KYC verification. Until KYC is approved and the vendor agreement is
            accepted, you cannot ship inventory in or place orders.
          </p>
        </div>
      ) : null}

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
