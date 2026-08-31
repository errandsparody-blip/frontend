"use client";

/**
 * Admin referrals — event campaigns + all referral attributions.
 *
 * Create an event campaign (code/QR for the booth), see how many brands
 * registered through it, and browse every referral with its status and
 * reward. Filter by campaign to get a clean list of "who registered at
 * the event."
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { normalizeError } from "@/lib/errors";

interface Campaign {
  id: string;
  code: string;
  name: string;
  rewardCents: number;
  active: boolean;
  signups: number;
}
interface ReferralRow {
  id: string;
  referredVendor: string;
  referrerVendor: string | null;
  campaign: string | null;
  refCode: string | null;
  status: string;
  rewardCents: number;
  createdAt: string;
  rewardedAt: string | null;
}

function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function date(s: string | null): string {
  return s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
}

export default function AdminReferralsPage(): JSX.Element {
  const qc = useQueryClient();
  const [campaignFilter, setCampaignFilter] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const campaignsQ = useQuery({
    queryKey: ["admin", "referrals", "campaigns"],
    queryFn: () => api.get<{ items: Campaign[] }>("/admin/referrals/campaigns"),
  });
  const listQ = useQuery({
    queryKey: ["admin", "referrals", "list", campaignFilter],
    queryFn: () =>
      api.get<{ items: ReferralRow[] }>(
        `/admin/referrals${campaignFilter ? `?campaign=${encodeURIComponent(campaignFilter)}` : ""}`,
      ),
  });

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [reward, setReward] = useState("50");

  const createMut = useMutation({
    mutationFn: () =>
      api.post("/admin/referrals/campaigns", {
        code,
        name,
        rewardDollars: Number(reward) || 0,
      }),
    onMutate: () => setErr(null),
    onSuccess: async () => {
      setCode("");
      setName("");
      setReward("50");
      await qc.invalidateQueries({ queryKey: ["admin", "referrals", "campaigns"] });
    },
    onError: (e) => setErr(normalizeError(e).entry.title),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post(`/admin/referrals/campaigns/${id}/${active ? "activate" : "deactivate"}`, {}),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "referrals", "campaigns"] });
    },
    onError: (e) => setErr(normalizeError(e).entry.title),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Growth"
        title="Referrals & events"
        description="Create an event campaign for the booth, track who registered, and see every referral and its $50/$50 reward."
      />

      {err ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-3 text-body-sm text-error">{err}</div>
      ) : null}

      {/* Campaigns */}
      <section className="rounded-md border border-line bg-white p-6">
        <div className="mb-3 font-mono text-mono-label uppercase text-text-muted">Event campaigns</div>

        <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto_auto] sm:items-end">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">Code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="LAGOS-2026"
              className="h-10 rounded-md border border-line bg-cream-soft px-3 text-body-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Lagos Brand Expo 2026"
              className="h-10 rounded-md border border-line bg-cream-soft px-3 text-body-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">Reward $ / side</span>
            <input
              type="number"
              min={0}
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              className="h-10 w-28 rounded-md border border-line bg-cream-soft px-3 text-body-sm"
            />
          </label>
          <button
            type="button"
            disabled={createMut.isPending || code.trim().length < 2 || name.trim().length < 2}
            onClick={() => createMut.mutate()}
            className="h-10 rounded-full bg-amber px-5 text-body-sm font-medium text-ink transition-colors hover:bg-amber-hi disabled:opacity-50"
          >
            {createMut.isPending ? "Creating…" : "Create campaign"}
          </button>
        </div>

        {campaignsQ.data && campaignsQ.data.items.length > 0 ? (
          <div className="overflow-hidden rounded-md border border-line">
            <table className="w-full text-body-sm">
              <thead className="bg-cream-soft">
                <tr className="text-left font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2 text-right">Reward</th>
                  <th className="px-4 py-2 text-right">Signups</th>
                  <th className="px-4 py-2 text-right">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {campaignsQ.data.items.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="px-4 py-2 font-mono text-ink">{c.code}</td>
                    <td className="px-4 py-2 text-text">{c.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{usd(c.rewardCents)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <button
                        type="button"
                        className="underline-offset-2 hover:underline"
                        onClick={() => setCampaignFilter(c.code)}
                      >
                        {c.signups}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={c.active ? "text-success" : "text-text-muted"}>
                        {c.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                        onClick={() => toggleMut.mutate({ id: c.id, active: !c.active })}
                      >
                        {c.active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-body-sm text-text-muted">No campaigns yet. Create one for your event.</div>
        )}
      </section>

      {/* Referrals list */}
      <section className="rounded-md border border-line bg-white p-6">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="font-mono text-mono-label uppercase text-text-muted">
            Referrals{campaignFilter ? ` · ${campaignFilter}` : ""}
          </div>
          {campaignFilter ? (
            <button
              type="button"
              className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
              onClick={() => setCampaignFilter("")}
            >
              Clear filter
            </button>
          ) : null}
        </div>

        {listQ.data && listQ.data.items.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-body-sm">
              <thead className="bg-cream-soft">
                <tr className="text-left font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
                  <th className="px-4 py-2">Referred brand</th>
                  <th className="px-4 py-2">Referred by</th>
                  <th className="px-4 py-2">Campaign</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Reward</th>
                  <th className="px-4 py-2">Registered</th>
                  <th className="px-4 py-2">Rewarded</th>
                </tr>
              </thead>
              <tbody>
                {listQ.data.items.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-4 py-2 text-ink">{r.referredVendor}</td>
                    <td className="px-4 py-2 text-text-muted">{r.referrerVendor ?? "—"}</td>
                    <td className="px-4 py-2 text-text-muted">{r.campaign ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          r.status === "REWARDED"
                            ? "text-success"
                            : r.status === "QUALIFIED"
                              ? "text-amber"
                              : "text-text-muted"
                        }
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.status === "REWARDED" ? usd(r.rewardCents) : "—"}
                    </td>
                    <td className="px-4 py-2 text-text-muted">{date(r.createdAt)}</td>
                    <td className="px-4 py-2 text-text-muted">{date(r.rewardedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-body-sm text-text-muted">
            {listQ.isLoading ? "Loading…" : "No referrals yet."}
          </div>
        )}
      </section>
    </div>
  );
}
