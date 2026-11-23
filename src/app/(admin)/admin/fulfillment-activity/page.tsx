"use client";

/**
 * /admin/fulfillment-activity — SUPER_ADMIN report: one row per processed
 * (packed) order showing the fulfillment price charged, the admin account that
 * processed it, and the date — filterable by processing admin, date range and
 * country, with a running total. Implements the spec's §1 "record the actual
 * processing user … filter orders by processing Admin … and date" and §6
 * processing-activity filters.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

interface ActivityRow {
  orderId: string;
  orderNumber: number;
  vendorName: string | null;
  country: string;
  fulfillmentFeeCents: number;
  processedByUserId: string | null;
  processedByEmail: string | null;
  packedAt: string;
  status: string;
}

interface ActivityResponse {
  items: ActivityRow[];
  nextBefore: string | null;
  totals: { count: number; fulfillmentFeeCents: number };
}

interface AdminUser {
  id: string;
  email: string;
  role: string;
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function FulfillmentActivityPage(): JSX.Element | null {
  const { user, loading } = useAuth();

  const [adminId, setAdminId] = useState("");
  const [country, setCountry] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Admins for the processing-admin filter dropdown.
  const adminsQ = useQuery({
    queryKey: ["admin", "users", "for-activity-filter"],
    queryFn: () => api.get<{ items: AdminUser[] }>("/admin/users?limit=100"),
    enabled: !loading && user?.role === "SUPER_ADMIN",
  });

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", "100");
    if (adminId) p.set("adminId", adminId);
    if (country) p.set("country", country);
    if (from) p.set("from", new Date(`${from}T00:00:00`).toISOString());
    if (to) {
      // `to` is exclusive server-side; add a day so the chosen end date is
      // fully included.
      const d = new Date(`${to}T00:00:00`);
      d.setDate(d.getDate() + 1);
      p.set("to", d.toISOString());
    }
    return p.toString();
  }, [adminId, country, from, to]);

  const q = useQuery({
    queryKey: ["admin", "fulfillment-activity", query],
    queryFn: () =>
      api.get<ActivityResponse>(`/admin/super-dashboard/fulfillment-activity?${query}`),
    placeholderData: keepPreviousData,
    enabled: !loading && user?.role === "SUPER_ADMIN",
  });

  if (loading || !user) return null;
  if (user.role !== "SUPER_ADMIN") return null;

  const items = q.data?.items ?? [];
  const totals = q.data?.totals ?? { count: 0, fulfillmentFeeCents: 0 };
  const capped = totals.count > items.length;

  const admins = (adminsQ.data?.items ?? []).filter(
    (a) => a.role !== "VENDOR" && a.role !== "VENDOR_SUB_USER",
  );

  const resetDisabled = !adminId && !country && !from && !to;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Reports"
        title="Fulfillment activity"
        description="Every processed order with its fulfillment price, the admin who processed it, and the date. Filter by admin, date range and country."
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
            Processed by
          </span>
          <select
            value={adminId}
            onChange={(e) => setAdminId(e.target.value)}
            className="h-9 rounded-sm border border-line-strong bg-white px-2 font-mono text-body-sm text-text outline-none focus:border-ink"
          >
            <option value="">All admins</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
            Country
          </span>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="h-9 rounded-sm border border-line-strong bg-white px-2 font-mono text-body-sm text-text outline-none focus:border-ink"
          >
            <option value="">All countries</option>
            <option value="US">USA</option>
            <option value="CA">Canada</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
            From
          </span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-sm border border-line-strong bg-white px-2 font-mono text-body-sm text-text outline-none focus:border-ink"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
            To
          </span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-sm border border-line-strong bg-white px-2 font-mono text-body-sm text-text outline-none focus:border-ink"
          />
        </label>

        <button
          type="button"
          onClick={() => {
            setAdminId("");
            setCountry("");
            setFrom("");
            setTo("");
          }}
          disabled={resetDisabled}
          className="h-9 rounded-sm border border-line-strong px-3 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset
        </button>

        {q.isFetching ? (
          <span className="font-mono text-mono-label uppercase text-text-muted">Loading…</span>
        ) : null}
      </div>

      {/* Totals */}
      <div className="flex flex-wrap gap-6 rounded-md border border-line bg-white px-6 py-4">
        <div>
          <div className="font-mono text-mono-label uppercase text-text-muted">Orders processed</div>
          <div className="text-h2 font-medium tabular-nums text-ink">{totals.count}</div>
        </div>
        <div>
          <div className="font-mono text-mono-label uppercase text-text-muted">
            Total fulfillment fees
          </div>
          <div className="text-h2 font-medium tabular-nums text-ink">
            {money(totals.fulfillmentFeeCents)}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-line bg-white px-5 py-8 text-center font-mono text-mono-label uppercase text-text-muted">
          No processed orders for this filter.
        </div>
      ) : (
        <>
          <DataTable>
            <THead>
              <Th>Order</Th>
              <Th>Vendor</Th>
              <Th>Country</Th>
              <Th>Processed by</Th>
              <Th>Date processed</Th>
              <Th align="right">Fulfillment fee</Th>
              <Th>Status</Th>
            </THead>
            <TBody>
              {items.map((r) => (
                <TR key={r.orderId}>
                  <Td mono>#{r.orderNumber}</Td>
                  <Td>{r.vendorName ?? "—"}</Td>
                  <Td>
                    <span
                      className={`inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[1px] ${
                        r.country === "CA" ? "bg-amber/20 text-amber" : "bg-ink/5 text-text-muted"
                      }`}
                    >
                      {r.country === "CA" ? "Canada" : "USA"}
                    </span>
                  </Td>
                  <Td className="font-mono text-[11px] text-text-muted">
                    {r.processedByEmail ?? "—"}
                  </Td>
                  <Td mono className="whitespace-nowrap text-text-muted">
                    {new Date(r.packedAt).toLocaleString()}
                  </Td>
                  <Td num className="tabular-nums">
                    {money(r.fulfillmentFeeCents)}
                  </Td>
                  <Td mono className="text-text-muted">
                    {r.status.replace(/_/g, " ")}
                  </Td>
                </TR>
              ))}
            </TBody>
          </DataTable>
          {capped ? (
            <p className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
              Showing the latest {items.length} of {totals.count}. Narrow the date range to see
              more; the totals above cover the full filter.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
