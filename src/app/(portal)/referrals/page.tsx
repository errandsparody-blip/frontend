"use client";

/**
 * Vendor referral page — the vendor's shareable link, live stats, and a
 * plain explainer of how the $50/$50 program works.
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";

interface ReferralSummary {
  code: string;
  referredCount: number;
  rewardedCount: number;
  earnedCents: number;
}

function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function ReferralsPage(): JSX.Element {
  const { data, isLoading, error } = useQuery({
    queryKey: ["referrals", "me"],
    queryFn: () => api.get<ReferralSummary>("/referrals/me"),
  });

  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = data ? `${origin}/signup?ref=${encodeURIComponent(data.code)}` : "";

  async function copy(): Promise<void> {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Referrals"
        title="Refer a brand, you both earn $50"
        description="Share your link with other brands. When they join and their first shipment reaches our warehouse, you each get $50."
      />

      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : error ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          {(error as { message?: string }).message ?? "Couldn't load your referral details."}
        </div>
      ) : data ? (
        <>
          {/* Share link */}
          <section className="rounded-2xl border border-line bg-white p-6 shadow-1">
            <div className="font-mono text-mono-label uppercase text-text-muted">Your referral link</div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-md border border-line bg-cream-soft px-3 py-2 font-mono text-body-sm text-ink"
              />
              <button
                type="button"
                onClick={copy}
                className="shrink-0 rounded-full bg-amber px-5 py-2.5 text-body-sm font-medium text-ink transition-colors hover:bg-amber-hi"
              >
                {copied ? "Copied ✓" : "Copy link"}
              </button>
            </div>
            <div className="mt-2 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
              Code: {data.code}
            </div>
          </section>

          {/* Stats */}
          <section className="grid gap-4 sm:grid-cols-3">
            <Stat label="Brands referred" value={data.referredCount.toLocaleString()} />
            <Stat label="Rewarded" value={data.rewardedCount.toLocaleString()} />
            <Stat label="You've earned" value={usd(data.earnedCents)} amber />
          </section>

          {/* Explainer */}
          <section className="rounded-2xl border border-line bg-cream-soft p-6">
            <div className="font-mono text-mono-label uppercase text-text-muted">How it works</div>
            <ol className="mt-4 flex flex-col gap-4">
              <Step n={1} title="Share your link">
                Send your referral link to another brand. They sign up through it — that&apos;s
                all it takes to connect the referral to you.
              </Step>
              <Step n={2} title="They send their first shipment">
                Once the brand ships their first inventory to our U.S. warehouse and we receive it
                (their first PSN), the referral qualifies.
              </Step>
              <Step n={3} title="You both get $50">
                We credit <strong>$50 to your wallet</strong> and <strong>$50 to theirs</strong> —
                automatically, once per referred brand. You&apos;ll both get an email when it lands.
              </Step>
            </ol>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, amber }: { label: string; value: string; amber?: boolean }): JSX.Element {
  return (
    <div className="rounded-2xl border border-line bg-white p-6 shadow-1">
      <div className="font-mono text-mono-label uppercase text-text-muted">{label}</div>
      <div className={"mt-2 text-display-lg font-medium tabular-nums " + (amber ? "text-amber" : "text-ink")}>
        {value}
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }): JSX.Element {
  return (
    <li className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber font-mono text-[13px] font-semibold text-white">
        {n}
      </div>
      <div>
        <div className="text-h3 font-medium text-ink">{title}</div>
        <p className="mt-1 text-body-sm text-text-muted">{children}</p>
      </div>
    </li>
  );
}
