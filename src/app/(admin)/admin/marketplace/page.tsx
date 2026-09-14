"use client";

/**
 * Admin marketplace (Migration 0059) — super-admin marketplace discount codes
 * (all vendors or a targeted subset) + a cross-vendor storefront orders view.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

interface MarketplaceCode {
  id: string;
  code: string;
  discount_type: string;
  value_bps: number | null;
  value_cents: number | null;
  active: boolean;
  redemption_count: number;
  vendor_ids: string[];
}
interface AdminStorefrontOrder {
  reference: string;
  business_name: string;
  buyer_email: string;
  status: string;
  total_cents: number;
  shipping_speed: string;
  tracking_number: string | null;
}
interface AdminFailedPayout {
  reference: string;
  business_name: string;
  processor: string;
  total_cents: number;
  platform_fee_cents: number;
  payout_status: string;
  created_at: string;
}

export default function AdminMarketplacePage() {
  const { bannerError, handle, clear } = useApiErrorHandler();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Marketplace" description="Marketplace discount codes and storefront orders." />
      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner error={bannerError} onAction={() => clear()} />
        </div>
      ) : null}
      <div className="flex flex-col gap-8">
        <MarketplaceDiscounts onError={handle} clearError={clear} />
        <ReservationSweep onError={handle} clearError={clear} />
        <ReturnsQueue onError={handle} clearError={clear} />
        <FailedPayouts onError={handle} clearError={clear} />
        <StorefrontOrders />
      </div>
    </div>
  );
}

function MarketplaceDiscounts({ onError, clearError }: { onError: (e: unknown) => void; clearError: () => void }) {
  const qc = useQueryClient();
  const codes = useQuery({
    queryKey: ["admin-marketplace-discounts"],
    queryFn: () => api.get<MarketplaceCode[]>("/admin/marketplace/discounts"),
  });
  const [code, setCode] = useState("");
  const [type, setType] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [value, setValue] = useState("");
  const [vendorIds, setVendorIds] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.post("/admin/marketplace/discounts", {
        code: code.trim().toUpperCase(),
        discountType: type,
        valueBps: type === "PERCENT" ? Math.round(Number(value) * 100) : undefined,
        valueCents: type === "FIXED" ? Math.round(Number(value) * 100) : undefined,
        vendorIds: vendorIds.trim()
          ? vendorIds.split(",").map((v) => v.trim()).filter(Boolean)
          : undefined,
      }),
    onSuccess: () => {
      setCode(""); setValue(""); setVendorIds("");
      void qc.invalidateQueries({ queryKey: ["admin-marketplace-discounts"] });
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/marketplace/discounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-marketplace-discounts"] }),
    onError,
  });

  return (
    <section className="rounded-lg border border-line bg-white p-6">
      <h2 className="mb-4 font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted">
        Marketplace discount codes
      </h2>
      <div className="flex flex-wrap items-end gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BLKFRI" className="w-32" />
        <select value={type} onChange={(e) => setType(e.target.value as "PERCENT" | "FIXED")}
          className="rounded-md border border-line-strong bg-white px-3 py-2 text-body-sm">
          <option value="PERCENT">% off</option>
          <option value="FIXED">$ off</option>
        </select>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === "PERCENT" ? "10" : "5.00"} className="w-24" />
        <Input value={vendorIds} onChange={(e) => setVendorIds(e.target.value)} placeholder="vendor ids (blank = all)" className="w-64" />
        <Button variant="primary" loading={create.isPending} onClick={() => { clearError(); create.mutate(); }}>Create</Button>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {(codes.data ?? []).map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-body-sm">
            <span className="font-mono font-medium text-ink">{c.code}</span>
            <span className="text-text-muted">
              {c.discount_type === "PERCENT" ? `${(c.value_bps ?? 0) / 100}%` : usd(c.value_cents ?? 0)}
              {" · "}{c.vendor_ids.length === 0 ? "all vendors" : `${c.vendor_ids.length} vendor(s)`}
              {" · "}{c.redemption_count} used
            </span>
            <button type="button" onClick={() => remove.mutate(c.id)}
              className={`text-[12px] ${c.active ? "text-error hover:underline" : "text-text-subtle"}`}>
              {c.active ? "Deactivate" : "Inactive"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReservationSweep({ onError, clearError }: { onError: (e: unknown) => void; clearError: () => void }) {
  const [released, setReleased] = useState<number | null>(null);
  const sweep = useMutation({
    mutationFn: () => api.post<{ released: number }>("/admin/storefront/orders/reservations/sweep", {}),
    onSuccess: (r) => setReleased(r.released),
    onError,
  });
  return (
    <section className="rounded-lg border border-line bg-white p-6">
      <h2 className="mb-2 font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted">
        Inventory reservations
      </h2>
      <p className="mb-4 max-w-2xl text-body-sm text-text-muted">
        Checkout holds a product&apos;s stock the moment a buyer reaches the payment step. If they don&apos;t pay, that
        stock is released automatically within a few minutes — but you can free it now. Use this if a product has
        disappeared from the storefront after abandoned or test checkouts (its available stock hit zero because units
        are still reserved).
      </p>
      <div className="flex items-center gap-3">
        <Button variant="outline" loading={sweep.isPending} onClick={() => { clearError(); setReleased(null); sweep.mutate(); }}>
          Release abandoned-cart stock
        </Button>
        {released != null ? (
          <span role="status" className="text-body-sm text-emerald-600">
            {released === 0 ? "Nothing to release — no abandoned checkouts." : `Released ${released} abandoned checkout${released === 1 ? "" : "s"}.`}
          </span>
        ) : null}
      </div>
    </section>
  );
}

interface ReturnRequest {
  id: string;
  reference: string;
  status: string;
  reason: string;
  order_reference: string;
  buyer_email: string;
  total_cents: number;
  business_name: string;
  created_at: string;
}

function ReturnsQueue({ onError, clearError }: { onError: (e: unknown) => void; clearError: () => void }) {
  const qc = useQueryClient();
  const returns = useQuery({
    queryKey: ["admin-storefront-returns"],
    queryFn: () => api.get<ReturnRequest[]>("/admin/storefront/returns?status=REQUESTED"),
  });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-storefront-returns"] });
    void qc.invalidateQueries({ queryKey: ["admin-storefront-orders"] });
  };
  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/admin/storefront/returns/${id}/approve`, {}),
    onSuccess: invalidate,
    onError,
  });
  const reject = useMutation({
    mutationFn: (v: { id: string; note: string }) =>
      api.post(`/admin/storefront/returns/${v.id}/reject`, { note: v.note }),
    onSuccess: invalidate,
    onError,
  });

  return (
    <section className="rounded-lg border border-line bg-white p-6">
      <h2 className="mb-4 font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted">
        Return requests
      </h2>
      {returns.isLoading ? (
        <div className="py-8 text-center font-mono text-mono-label text-text-subtle">Loading…</div>
      ) : (returns.data ?? []).length === 0 ? (
        <div className="py-8 text-center text-body-sm text-text-muted">No open return requests.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {(returns.data ?? []).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-3 py-3 text-body-sm">
              <div className="min-w-0">
                <div className="font-mono font-medium text-ink">
                  {r.reference} · {r.order_reference}
                </div>
                <div className="text-text-muted">
                  {r.business_name} · {r.buyer_email} · {usd(r.total_cents)}
                </div>
                <div className="mt-1 text-text-2">“{r.reason}”</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={approve.isPending}
                  onClick={() => {
                    if (window.confirm(`Approve return ${r.reference} and refund ${usd(r.total_cents)}?`)) {
                      clearError();
                      approve.mutate(r.id);
                    }
                  }}
                  className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-white hover:bg-ink-elev disabled:opacity-50"
                >
                  Approve + refund
                </button>
                <button
                  type="button"
                  disabled={reject.isPending}
                  onClick={() => {
                    const note = window.prompt("Reason for declining (optional):") ?? "";
                    clearError();
                    reject.mutate({ id: r.id, note });
                  }}
                  className="rounded-md border border-line-strong px-3 py-1.5 text-[12px] font-medium text-text-muted hover:border-ink"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FailedPayouts({ onError, clearError }: { onError: (e: unknown) => void; clearError: () => void }) {
  const qc = useQueryClient();
  const rows = useQuery({
    queryKey: ["admin-failed-payouts"],
    queryFn: () => api.get<AdminFailedPayout[]>("/admin/storefront/orders/payouts/failed"),
  });
  const retry = useMutation({
    mutationFn: (reference: string) =>
      api.post(`/admin/storefront/orders/${encodeURIComponent(reference)}/payout/retry`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-failed-payouts"] }),
    onError,
  });
  const data = rows.data ?? [];
  return (
    <section className="rounded-lg border border-line bg-white p-6">
      <h2 className="mb-4 font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted">
        Failed vendor payouts
      </h2>
      {rows.isLoading ? (
        <div className="py-8 text-center font-mono text-mono-label text-text-subtle">Loading…</div>
      ) : data.length === 0 ? (
        <div className="py-8 text-center text-body-sm text-text-muted">No failed payouts.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((p) => (
            <div key={p.reference} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-3 py-3 text-body-sm">
              <div className="min-w-0">
                <div className="font-mono font-medium text-ink">{p.reference}</div>
                <div className="text-text-muted">
                  {p.business_name} · {p.processor} · payout {usd(p.total_cents - p.platform_fee_cents)}
                </div>
              </div>
              <button
                type="button"
                disabled={retry.isPending}
                onClick={() => { clearError(); retry.mutate(p.reference); }}
                className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-white hover:bg-ink-elev disabled:opacity-50"
              >
                Retry payout
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StorefrontOrders() {
  const qc = useQueryClient();
  const orders = useQuery({
    queryKey: ["admin-storefront-orders"],
    queryFn: () => api.get<AdminStorefrontOrder[]>("/admin/storefront/orders"),
  });
  const refund = useMutation({
    mutationFn: (reference: string) =>
      api.post(`/admin/storefront/orders/${encodeURIComponent(reference)}/refund`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-storefront-orders"] }),
  });
  const REFUNDABLE = new Set(["PAID", "FULFILLING", "SHIPPED", "DELIVERED"]);
  return (
    <section className="rounded-lg border border-line bg-white p-6">
      <h2 className="mb-4 font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted">
        Storefront orders
      </h2>
      {orders.isLoading ? (
        <div className="py-8 text-center font-mono text-mono-label text-text-subtle">Loading…</div>
      ) : (orders.data ?? []).length === 0 ? (
        <div className="py-8 text-center text-body-sm text-text-muted">No storefront orders yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[1.2px] text-text-subtle">
                <th className="px-3 py-2">Order</th><th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Buyer</th><th className="px-3 py-2">Paid</th>
                <th className="px-3 py-2">Speed</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Tracking</th><th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(orders.data ?? []).map((o) => (
                <tr key={o.reference} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-mono font-medium text-ink">{o.reference}</td>
                  <td className="px-3 py-2 text-text-muted">{o.business_name}</td>
                  <td className="px-3 py-2 text-text-muted">{o.buyer_email}</td>
                  <td className="px-3 py-2 font-medium text-ink">{usd(o.total_cents)}</td>
                  <td className="px-3 py-2 text-text-muted">{o.shipping_speed}</td>
                  <td className="px-3 py-2">
                    <StatusPill tone={o.status === "SHIPPED" || o.status === "DELIVERED" ? "success" : "info"}>
                      {o.status.replace(/_/g, " ")}
                    </StatusPill>
                  </td>
                  <td className="px-3 py-2 font-mono text-[12px] text-text-muted">{o.tracking_number ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {REFUNDABLE.has(o.status) ? (
                      <button
                        type="button"
                        disabled={refund.isPending}
                        onClick={() => {
                          if (window.confirm(`Refund order ${o.reference} in full (${usd(o.total_cents)})?`)) {
                            refund.mutate(o.reference);
                          }
                        }}
                        className="text-[12px] font-medium text-error hover:underline disabled:opacity-50"
                      >
                        Refund
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
