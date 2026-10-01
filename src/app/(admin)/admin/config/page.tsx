"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";

interface ConfigRow {
  key: string;
  description: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

// Map config keys → the friendly editor that handles them. Keys not in this
// map fall back to the raw JSON editor at /admin/config/[key].
const FRIENDLY_EDITORS: Record<string, { href: string; label: string }> = {
  fee_schedule: { href: "/admin/config/fees", label: "Edit pricing →" },
  tier_dimensions: { href: "/admin/config/box-tiers", label: "Edit box tiers →" },
  repackaging_fees: { href: "/admin/config/box-tiers", label: "Edit box tiers →" },
  quarantine_daily_fee_cents: { href: "/admin/config/policy", label: "Edit policy →" },
  reassessment_threshold: { href: "/admin/config/policy", label: "Edit policy →" },
  agreement_version: { href: "/admin/config/policy", label: "Edit policy →" },
  // All four shopper-related rows share one friendly editor so admins
  // can adjust commission, warehouse state, tax rates, and per-method
  // freight rates in one place.
  shopper_commission_bps: { href: "/admin/config/shopper", label: "Edit shopper →" },
  shopper_warehouse_state: { href: "/admin/config/shopper", label: "Edit shopper →" },
  shopper_tax_rates: { href: "/admin/config/shopper", label: "Edit shopper →" },
  shopper_freight_rates: { href: "/admin/config/shopper", label: "Edit shopper →" },
  // Migration 0039 — dedicated matrix editor for the ADMIN role's
  // page permissions. Backed by the sanitising service; the raw
  // JSON is discouraged but still editable via the generic
  // /admin/config/:key path for emergencies.
  admin_role_page_permissions: {
    href: "/admin/config/admin-permissions",
    label: "Edit admin access →",
  },
  // Migration 0040 — Fulfillment v2 shipping-point range table.
  // The friendly editor validates coherence (no overlap, ordered
  // buckets, dollars-min ≤ dollars-max) before saving.
  shipping_point_estimate_ranges: {
    href: "/admin/config/shipping-point-ranges",
    label: "Edit shipping ranges →",
  },
  // Migration 0047 — Fulfillment v1 abolished. The
  // `fulfillment_v2_enabled` config row is retained in the DB as a
  // read-only tombstone (see migration 0047) but no longer has a UI
  // toggle. Every order is v2 unconditionally.
};

// Editors that live under /admin/config but are NOT backed by rows in
// the `configuration` table. Rendered as a separate card above the
// generic config list so they're discoverable even before their
// underlying table has any rows.
const VIRTUAL_EDITORS: Array<{ href: string; title: string; description: string }> = [
  {
    href: "/admin/config/packaging",
    title: "Packaging library",
    description:
      "Preset boxes and mailers the warehouse can pick during the pack step. Deactivated presets stay in the DB but no longer appear in the picker.",
  },
  {
    href: "/admin/config/inventory-locations",
    title: "Inventory locations",
    description:
      "Warehouse locations (aisle / bay / shelf / bin) that SKUs can be assigned to. Shown to operators on pack + PSN receive so they can walk to the item.",
  },
];

interface EmailTestResult {
  ok: boolean;
  to: string;
  providerId: string | null;
  error: string | null;
  sentAt: string;
}

/**
 * Diagnostics card — sends a one-off test email through the real
 * transactional pipeline (POST /admin/email-test) so an admin can
 * confirm deliverability after a DNS / domain change without placing a
 * real order. On failure the exact provider code is shown (e.g.
 * `resend_403` = sending domain not verified).
 */
function EmailTestCard(): JSX.Element {
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<EmailTestResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

  async function send() {
    if (!emailValid || sending) return;
    setSending(true);
    setResult(null);
    setErr(null);
    try {
      const res = await api.post<EmailTestResult>("/admin/email-test", {
        to: to.trim(),
      });
      setResult(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-md border border-line bg-cream-soft p-4">
      <div className="mb-2 font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
        Diagnostics
      </div>
      <div className="rounded-md border border-line bg-white p-4">
        <div className="font-semibold text-ink">Send a test email</div>
        <p className="mt-1 text-body-sm text-text-muted">
          Sends one message through the real email pipeline — same path every
          receipt and notification uses. Use it to confirm delivery is working
          (or to read the exact failure code if it isn&apos;t).
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="email"
            inputMode="email"
            autoComplete="off"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="recipient@example.com"
            className="h-11 w-full rounded-sm border border-line-strong bg-white px-3 text-body-sm text-text sm:max-w-xs"
          />
          <button
            type="button"
            onClick={send}
            disabled={!emailValid || sending}
            className="h-11 shrink-0 rounded-sm bg-ink px-4 font-mono text-[11px] uppercase tracking-[1.2px] text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? "Sending…" : "Send test email"}
          </button>
        </div>

        {result ? (
          result.ok ? (
            <div
              role="status"
              className="mt-3 rounded-md border-l-4 border-success bg-success/10 px-4 py-3"
            >
              <div className="font-mono text-mono-label uppercase text-success">
                Sent
              </div>
              <p className="mt-1 text-body-sm text-text">
                Delivered to <strong>{result.to}</strong>. Check the inbox (and
                spam). Provider id:{" "}
                <span className="font-mono text-[12px]">
                  {result.providerId ?? "—"}
                </span>
              </p>
            </div>
          ) : (
            <div
              role="alert"
              className="mt-3 rounded-md border-l-4 border-error bg-error/10 px-4 py-3"
            >
              <div className="font-mono text-mono-label uppercase text-error">
                Not sent
              </div>
              <p className="mt-1 text-body-sm text-text">
                The provider rejected it. Code:{" "}
                <span className="font-mono text-[12px]">{result.error}</span>
                {result.error === "resend_403" ? (
                  <>
                    {" "}
                    — the sending domain is not verified. Check the domain in
                    Resend and its DNS records.
                  </>
                ) : result.error === "resend_api_key_missing" ? (
                  <> — RESEND_API_KEY is not set on the server.</>
                ) : null}
              </p>
            </div>
          )
        ) : null}

        {err ? (
          <div
            role="alert"
            className="mt-3 rounded-md border-l-4 border-error bg-error/10 px-4 py-3"
          >
            <div className="font-mono text-mono-label uppercase text-error">
              Couldn&apos;t reach the server
            </div>
            <p className="mt-1 text-body-sm text-text">{err}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function AdminConfigPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "config"],
    queryFn: () => api.get<{ items: ConfigRow[] }>("/admin/config"),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Configuration"
        title="Platform configuration"
        description="Fee schedule, tier dimensions, repackaging fees. Every change is captured in the audit log with the full before/after JSON."
      />

      <EmailTestCard />

      {/* Migration 0043 — links to editors that don't correspond to
          rows in the configuration table (e.g. packaging_options is
          its own model). Kept separate from the generic list below so
          they're always visible. */}
      <section className="rounded-md border border-line bg-cream-soft p-4">
        <div className="mb-2 font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
          Editors
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {VIRTUAL_EDITORS.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              className="block rounded-md border border-line bg-white p-3 hover:bg-cream-soft"
            >
              <div className="font-semibold text-ink">{e.title}</div>
              <div className="mt-1 text-body-sm text-text-muted">
                {e.description}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No configuration keys"
          description="Run `pnpm prisma:seed` to seed fee_schedule, tier_dimensions, and repackaging_fees."
        />
      ) : (
        <DataTable>
          <THead>
            <Th>Key</Th>
            <Th>Description</Th>
            <Th>Last updated</Th>
            <Th align="right">Action</Th>
          </THead>
          <TBody>
            {data.items.map((c) => (
              <TR key={c.key}>
                <Td mono strong>
                  {c.key}
                </Td>
                <Td className="text-text-muted">{c.description ?? "—"}</Td>
                <Td mono className="text-text-muted">
                  {new Date(c.updatedAt).toLocaleString()}
                </Td>
                <Td align="right">
                  {FRIENDLY_EDITORS[c.key] ? (
                    <div className="flex justify-end gap-3">
                      <Link
                        href={FRIENDLY_EDITORS[c.key]!.href}
                        className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                      >
                        {FRIENDLY_EDITORS[c.key]!.label}
                      </Link>
                      <Link
                        href={`/admin/config/${encodeURIComponent(c.key)}`}
                        className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
                      >
                        JSON
                      </Link>
                    </div>
                  ) : (
                    <Link
                      href={`/admin/config/${encodeURIComponent(c.key)}`}
                      className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                    >
                      Edit →
                    </Link>
                  )}
                </Td>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}
    </div>
  );
}
