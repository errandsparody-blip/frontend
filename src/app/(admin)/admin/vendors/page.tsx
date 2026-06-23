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

import {
  FilterBar,
  FilterDateRange,
  FilterField,
  FilterSelect,
} from "@/components/admin/filters";
import { EmptyState } from "@/components/ui/empty-state";
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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filter = FILTER_OPTIONS.find((f) => f.id === filterId)!;

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "vendors", { filter: filter.id, search, from, to }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (filter.query) params.set("kycStatus", filter.query);
      if (search) params.set("search", search);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
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

      <FilterBar
        gridClassName="md:grid-cols-[1fr_200px_200px_200px]"
        onClear={() => {
          setFilterId("queue");
          setSearch("");
          setFrom("");
          setTo("");
        }}
        canClear={filterId !== "queue" || search !== "" || from !== "" || to !== ""}
      >
        <FilterField
          label="Search"
          type="search"
          value={search}
          onChange={setSearch}
          placeholder="Search by business name…"
        />
        <FilterSelect
          label="Status"
          value={filterId}
          onChange={setFilterId}
          options={FILTER_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
        />
        <FilterDateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </FilterBar>

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
