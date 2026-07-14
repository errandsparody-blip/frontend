"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

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
