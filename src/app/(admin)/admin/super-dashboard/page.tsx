/**
 * /admin/super-dashboard — Phase H.
 *
 * SUPER_ADMIN-only platform-wide dashboard. Renders the aggregate
 * snapshot from /v1/admin/super-dashboard with:
 *   * Revenue cards (24h / 7d / 30d + fulfillment vs shipping split)
 *   * Wallet totals + low-balance vendor count
 *   * Vendor status breakdown
 *   * Order status breakdown (with a highlight on v2 in-flight)
 *   * Warehouse KPIs (packaging, locations, barcode coverage)
 *   * CSV import throughput (24h / 7d + success rate)
 *   * Recent orders + recent vendors panels
 *
 * SOLID / code-quality notes:
 *   * Presentation-only. All aggregation is on the server; this file
 *     only formats and lays out.
 *   * `MetricCard` and `StatRow` are stateless components so the
 *     JSX reads top-to-bottom with no hidden coupling.
 *   * The type shape is a verbatim mirror of the backend's
 *     `SuperAdminSnapshot`; a change on either side surfaces the
 *     other as a tsc error.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useApiErrorHandler } from "@/lib/errors";

type OrderStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "ALLOCATED"
  | "LABEL_PURCHASED"
  | "PICKING"
  | "PACKED"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "HANDED_OFF"
  | "PENDING_PACKING"
  | "PACKING_COMPLETED"
  | "AWAITING_SHIPPING_SELECTION"
  | "AWAITING_WALLET_FUNDING"
  | "SHIPPING_PAID"
  | "EXCEPTION"
  | "CANCELLED"
  | "RETURNED";

type VendorStatus = "ACTIVE" | "PENDING_KYC" | "SUSPENDED" | "CLOSED";

interface SuperAdminSnapshot {
  revenue: {
    last24hCents: number;
    last7dCents: number;
    last30dCents: number;
    last30dFulfillmentCents: number;
    last30dShippingCents: number;
  };
  wallets: {
    totalBalanceCents: number;
    vendorCount: number;
    lowBalanceCount: number;
  };
  vendors: {
    total: number;
    byStatus: Record<VendorStatus, number>;
  };
  orders: {
    total: number;
    byStatus: Partial<Record<OrderStatus, number>>;
    v2InFlight: number;
  };
  warehouse: {
    packagingOptionsActive: number;
    inventoryLocationsActive: number;
    productsWithBarcode: number;
    productsTotal: number;
  };
  imports: {
    last24h: number;
    last7d: number;
    successRate7dPercent: number;
  };
  recent: {
    orders: Array<{
      id: string;
      orderNumber: number;
      vendorBusinessName: string;
      status: OrderStatus;
      totalChargedCents: number;
      createdAt: string;
    }>;
    vendors: Array<{
      id: string;
      businessName: string;
      status: VendorStatus;
      createdAt: string;
    }>;
  };
  generatedAt: string;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function SuperAdminDashboardPage(): JSX.Element {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { bannerError, handle } = useApiErrorHandler();

  useEffect(() => {
    if (authLoading) return;
    if (user?.role !== "SUPER_ADMIN") router.replace("/admin");
  }, [authLoading, user, router]);

  const snapshotQ = useQuery({
    queryKey: ["admin", "super-dashboard"],
    queryFn: () => api.get<SuperAdminSnapshot>("/admin/super-dashboard"),
    enabled: !authLoading && user?.role === "SUPER_ADMIN",
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (snapshotQ.error) handle(snapshotQ.error);
  }, [snapshotQ.error, handle]);

  const s = snapshotQ.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Platform"
        title="Super admin dashboard"
        description="Platform-wide aggregate view. Only SUPER_ADMIN can see finance-sensitive numbers like wallet totals and revenue slices."
      />

      {bannerError ? <ErrorBanner error={bannerError} /> : null}

      {snapshotQ.isLoading ? (
        <div className="rounded-md border border-line bg-white p-6 text-body-sm text-text-muted">
          Loading snapshot…
        </div>
      ) : s ? (
        <>
          {/* Revenue */}
          <section className="grid gap-4 md:grid-cols-3">
            <MetricCard
              title="Revenue · 24h"
              value={dollars(s.revenue.last24hCents)}
            />
            <MetricCard
              title="Revenue · 7d"
              value={dollars(s.revenue.last7dCents)}
            />
            <MetricCard
              title="Revenue · 30d"
              value={dollars(s.revenue.last30dCents)}
              detail={
                <>
                  Fulfillment {dollars(s.revenue.last30dFulfillmentCents)} ·
                  Shipping {dollars(s.revenue.last30dShippingCents)}
                </>
              }
            />
          </section>

          {/* Wallets + Vendors + Warehouse + Imports */}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Wallet totals"
              value={dollars(s.wallets.totalBalanceCents)}
              detail={
                <>
                  {s.wallets.vendorCount} vendor wallets ·{" "}
                  <span className={s.wallets.lowBalanceCount > 0 ? "text-amber" : ""}>
                    {s.wallets.lowBalanceCount} low
                  </span>
                </>
              }
            />
            <MetricCard
              title="Vendors"
              value={String(s.vendors.total)}
              detail={
                <>
                  Active {s.vendors.byStatus.ACTIVE} · Onboarding{" "}
                  {s.vendors.byStatus.PENDING_KYC} · Suspended{" "}
                  {s.vendors.byStatus.SUSPENDED}
                </>
              }
            />
            <MetricCard
              title="Warehouse"
              value={`${s.warehouse.packagingOptionsActive} / ${s.warehouse.inventoryLocationsActive}`}
              detail={
                <>
                  Packaging / Locations · Barcodes{" "}
                  {s.warehouse.productsTotal === 0
                    ? "n/a"
                    : `${Math.round(
                        (s.warehouse.productsWithBarcode * 100) /
                          s.warehouse.productsTotal,
                      )}%`}
                </>
              }
            />
            <MetricCard
              title="Imports · 24h"
              value={String(s.imports.last24h)}
              detail={
                <>
                  {s.imports.last7d} in 7d · {s.imports.successRate7dPercent}%
                  success
                </>
              }
            />
          </section>

          {/* Order status breakdown */}
          <section className="rounded-md border border-line bg-white p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-h3 font-semibold text-ink">Orders by status</h2>
              <div className="font-mono text-body-sm text-text-muted">
                Total {s.orders.total} · v2 in-flight {s.orders.v2InFlight}
              </div>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(s.orders.byStatus).map(([status, count]) => (
                <StatRow
                  key={status}
                  label={status.replace(/_/g, " ")}
                  value={count ?? 0}
                />
              ))}
            </div>
          </section>

          {/* Recent activity */}
          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-md border border-line bg-white p-6">
              <h2 className="text-h3 font-semibold text-ink">Recent orders</h2>
              <div className="mt-4">
                {s.recent.orders.length === 0 ? (
                  <div className="text-body-sm text-text-muted">
                    No orders yet.
                  </div>
                ) : (
                  <DataTable>
                    <THead>
                      <Th>Order</Th>
                      <Th>Vendor</Th>
                      <Th>Status</Th>
                      <Th align="right">Total</Th>
                    </THead>
                    <TBody>
                      {s.recent.orders.map((o) => (
                        <TR key={o.id}>
                          <Td mono>
                            <Link
                              href={`/admin/orders/${o.id}`}
                              className="hover:text-amber"
                            >
                              #{o.orderNumber}
                            </Link>
                          </Td>
                          <Td>{o.vendorBusinessName}</Td>
                          <Td>
                            <StatusPill tone="info">
                              {o.status.replace(/_/g, " ")}
                            </StatusPill>
                          </Td>
                          <Td num>{dollars(o.totalChargedCents)}</Td>
                        </TR>
                      ))}
                    </TBody>
                  </DataTable>
                )}
              </div>
            </div>
            <div className="rounded-md border border-line bg-white p-6">
              <h2 className="text-h3 font-semibold text-ink">Recent vendors</h2>
              <div className="mt-4">
                {s.recent.vendors.length === 0 ? (
                  <div className="text-body-sm text-text-muted">
                    No vendors yet.
                  </div>
                ) : (
                  <DataTable>
                    <THead>
                      <Th>Vendor</Th>
                      <Th>Status</Th>
                      <Th>Joined</Th>
                    </THead>
                    <TBody>
                      {s.recent.vendors.map((v) => (
                        <TR key={v.id}>
                          <Td>
                            <Link
                              href={`/admin/vendors/${v.id}`}
                              className="hover:text-amber"
                            >
                              {v.businessName}
                            </Link>
                          </Td>
                          <Td>
                            <StatusPill
                              tone={
                                v.status === "ACTIVE"
                                  ? "success"
                                  : v.status === "SUSPENDED" || v.status === "CLOSED"
                                    ? "error"
                                    : "info"
                              }
                            >
                              {v.status.replace(/_/g, " ")}
                            </StatusPill>
                          </Td>
                          <Td mono className="text-text-muted">
                            {new Date(v.createdAt).toLocaleDateString()}
                          </Td>
                        </TR>
                      ))}
                    </TBody>
                  </DataTable>
                )}
              </div>
            </div>
          </section>

          <div className="text-right font-mono text-body-xs text-text-muted">
            Snapshot generated {new Date(s.generatedAt).toLocaleString()}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function MetricCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted">
        {title}
      </div>
      <div className="mt-2 font-mono text-h2 font-semibold text-ink">{value}</div>
      {detail ? (
        <div className="mt-1 text-body-sm text-text-muted">{detail}</div>
      ) : null}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-md border border-line bg-cream-soft px-3 py-2">
      <span className="font-mono text-body-sm text-text">{label}</span>
      <span className="font-mono text-body-sm font-semibold text-ink">{value}</span>
    </div>
  );
}
