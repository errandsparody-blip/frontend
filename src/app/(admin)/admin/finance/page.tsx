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

interface AdminVendor {
  id: string;
  businessName: string;
  country: string;
  kycStatus: "PENDING" | "IN_PROGRESS" | "REQUIRES_RESUBMISSION" | "APPROVED" | "REJECTED" | "EXPIRED";
  status: "PENDING_KYC" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  wallet: {
    balanceCents: number;
    status: "ACTIVE" | "STORAGE_OVERDUE" | "SUSPENDED" | "CLOSED";
    lowBalanceThresholdCents: number;
  } | null;
  createdAt: string;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function FinanceLandingPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "vendors", { search }],
    queryFn: () =>
      api.get<{ items: AdminVendor[]; nextCursor: string | null }>(
        `/admin/vendors?limit=50${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      ),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="[03] Finance"
        title="Vendors & wallets"
        description="Search a vendor to credit a manual deposit (Wise / Payoneer) or open the reconciliation report."
        actions={
          <Link
            href="/admin/finance/reconciliation"
            className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
          >
            Reconciliation report →
          </Link>
        }
      />

      <div className="max-w-md">
        <Input
          type="text"
          placeholder="Search by business name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : error ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          {(error as { message?: string }).message ?? "Failed to load vendors."}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No vendors match" description="Try a different search term." />
      ) : (
        <DataTable>
          <THead>
            <Th>Vendor</Th>
            <Th>Country</Th>
            <Th>KYC</Th>
            <Th>Wallet status</Th>
            <Th align="right">Balance</Th>
            <Th align="right">Action</Th>
          </THead>
          <TBody>
            {data.items.map((v) => (
              <TR key={v.id}>
                <Td strong>{v.businessName}</Td>
                <Td mono>{v.country}</Td>
                <Td>
                  <StatusPill
                    tone={
                      v.kycStatus === "APPROVED"
                        ? "success"
                        : v.kycStatus === "REJECTED" || v.kycStatus === "EXPIRED"
                          ? "error"
                          : "warning"
                    }
                  >
                    {v.kycStatus.replace(/_/g, " ")}
                  </StatusPill>
                </Td>
                <Td>
                  {v.wallet ? (
                    <StatusPill
                      tone={
                        v.wallet.status === "ACTIVE"
                          ? "success"
                          : v.wallet.status === "STORAGE_OVERDUE"
                            ? "error"
                            : "warning"
                      }
                    >
                      {v.wallet.status.replace(/_/g, " ")}
                    </StatusPill>
                  ) : (
                    <span className="font-mono text-mono-label uppercase text-text-muted">none</span>
                  )}
                </Td>
                <Td num strong>
                  {v.wallet ? formatCents(v.wallet.balanceCents) : "—"}
                </Td>
                <Td align="right">
                  <Link
                    href={`/admin/finance/credit/${v.id}`}
                    className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                  >
                    Credit deposit →
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
