/**
 * Admin vendor management list. Default view is the KYC review queue —
 * vendors who need a manual decision. The status filter lets reviewers also
 * see approved / rejected histories.
 *
 * Pairs with /admin/vendors/[id] (the detail screen with action buttons).
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";

type KycStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "REQUIRES_RESUBMISSION"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED";

interface AdminVendorRow {
  id: string;
  businessName: string;
  country: string;
  kycStatus: KycStatus;
  status: "PENDING_KYC" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  socialVerifiedAt: string | null;
  hasSocialHandles: boolean;
  agreementAcceptedAt: string | null;
  createdAt: string;
}

const QUEUE_FILTER = "PENDING,IN_PROGRESS,REQUIRES_RESUBMISSION";

const FILTER_OPTIONS: Array<{ id: string; label: string; query: string }> = [
  { id: "queue", label: "Review queue", query: QUEUE_FILTER },
  { id: "approved", label: "Approved", query: "APPROVED" },
  { id: "rejected", label: "Rejected", query: "REJECTED" },
  { id: "all", label: "All", query: "" },
];

function kycPillTone(s: KycStatus): "success" | "error" | "warning" {
  if (s === "APPROVED") return "success";
  if (s === "REJECTED" || s === "EXPIRED") return "error";
  return "warning";
}

export default function AdminVendorsPage() {
  const [search, setSearch] = useState("");
  const [filterId, setFilterId] = useState<string>("queue");
  const filter = FILTER_OPTIONS.find((f) => f.id === filterId)!;

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "vendors", { filter: filter.id, search }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (filter.query) params.set("kycStatus", filter.query);
      if (search) params.set("search", search);
      return api.get<{ items: AdminVendorRow[]; nextCursor: string | null }>(
        `/admin/vendors?${params.toString()}`,
      );
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Vendors"
        title="KYC & vendor review"
        description="Review pending vendors, verify their public footprint, and approve or reject onboarding."
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[260px] max-w-md">
          <Input
            type="text"
            placeholder="Search by business name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div
          role="tablist"
          aria-label="KYC status filter"
          className="flex flex-wrap gap-1 rounded-sm border border-line p-1"
        >
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              role="tab"
              type="button"
              aria-selected={filterId === opt.id}
              onClick={() => setFilterId(opt.id)}
              className={
                "px-3 py-1.5 font-mono text-[11px] uppercase tracking-[1.2px] transition-colors " +
                (filterId === opt.id
                  ? "bg-ink text-cream"
                  : "text-text-muted hover:text-ink")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : error ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          {(error as { message?: string }).message ?? "Failed to load vendors."}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No vendors match"
          description={
            filter.id === "queue"
              ? "The review queue is clear. Switch to All to see approved and rejected accounts."
              : "Try a different filter or search term."
          }
        />
      ) : (
        <DataTable>
          <THead>
            <Th>Vendor</Th>
            <Th>Country</Th>
            <Th>KYC</Th>
            <Th>Social</Th>
            <Th>Agreement</Th>
            <Th>Signed up</Th>
            <Th align="right">Action</Th>
          </THead>
          <TBody>
            {data.items.map((v) => (
              <TR key={v.id}>
                <Td strong>{v.businessName}</Td>
                <Td mono>{v.country}</Td>
                <Td>
                  <StatusPill tone={kycPillTone(v.kycStatus)}>
                    {v.kycStatus.replace(/_/g, " ")}
                  </StatusPill>
                </Td>
                <Td>
                  {v.socialVerifiedAt ? (
                    <StatusPill tone="success">Verified</StatusPill>
                  ) : v.hasSocialHandles ? (
                    <StatusPill tone="warning">Submitted</StatusPill>
                  ) : (
                    <span className="font-mono text-mono-label uppercase text-text-muted">
                      Not provided
                    </span>
                  )}
                </Td>
                <Td>
                  {v.agreementAcceptedAt ? (
                    <span className="font-mono text-body-sm text-text">
                      {new Date(v.agreementAcceptedAt).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="font-mono text-mono-label uppercase text-text-muted">
                      Not yet
                    </span>
                  )}
                </Td>
                <Td>
                  <span className="font-mono text-body-sm text-text-muted">
                    {new Date(v.createdAt).toLocaleDateString()}
                  </span>
                </Td>
                <Td align="right">
                  <Link
                    href={`/admin/vendors/${v.id}`}
                    className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                  >
                    Review →
                  </Link>
                </Td>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}
    </div>
  );
}
