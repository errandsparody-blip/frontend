"use client";

import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";

import {
  FilterBar,
  FilterDateRange,
  FilterField,
  FilterSelect,
} from "@/components/admin/filters";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";

interface AuditRow {
  id: string;
  createdAt: string;
  actor: { id: string; email: string; role: string } | null;
  actorRole: string | null;
  onBehalfOfVendorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  sourceIp: string | null;
  correlationId: string | null;
  beforeState: unknown;
  afterState: unknown;
}

const RESOURCE_TYPES = [
  "",
  "user",
  "vendor",
  "wallet",
  "ledger",
  "psn",
  "product",
  "sku",
  "order",
  "return",
  "session",
  "configuration",
  "system",
  "email",
  "kyc",
] as const;

export default function AdminAuditPage() {
  const [actionFilter, setActionFilter] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [opened, setOpened] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "audit", { actionFilter, resourceType, from, to }],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (actionFilter) params.set("action", actionFilter);
      if (resourceType) params.set("resourceType", resourceType);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return api.get<{ items: AuditRow[]; nextCursor: string | null }>(`/admin/audit?${params.toString()}`);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Audit"
        title="Audit log"
        description="Every privileged action lands here. The viewer itself is logged — you cannot read this page silently."
      />

      <FilterBar
        gridClassName="md:grid-cols-[1fr_200px_200px_200px]"
        onClear={() => {
          setActionFilter("");
          setResourceType("");
          setFrom("");
          setTo("");
        }}
        canClear={actionFilter !== "" || resourceType !== "" || from !== "" || to !== ""}
      >
        <FilterField
          label="Action contains"
          type="text"
          value={actionFilter}
          onChange={setActionFilter}
          placeholder="wallet.debit"
        />
        <FilterSelect
          label="Resource type"
          value={resourceType}
          onChange={setResourceType}
          options={RESOURCE_TYPES.map((t) => ({ value: t, label: t || "any" }))}
        />
        <FilterDateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </FilterBar>

      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : error ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          {(error as { message?: string }).message ?? "Failed to load audit log."}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No audit entries" description="Try widening the filters." />
      ) : (
        <DataTable>
          <THead>
            <Th>When</Th>
            <Th>Actor</Th>
            <Th>Action</Th>
            <Th>Resource</Th>
            <Th>IP</Th>
            <Th align="right">Detail</Th>
          </THead>
          <TBody>
            {data.items.map((e) => (
              <Fragment key={e.id}>
                <TR>
                  <Td mono className="text-text-muted">
                    {new Date(e.createdAt).toLocaleString()}
                  </Td>
                  <Td>
                    {e.actor ? (
                      <div className="flex flex-col">
                        <span className="text-body-sm text-text">{e.actor.email}</span>
                        <span className="font-mono text-mono-label uppercase text-text-muted">{e.actor.role}</span>
                      </div>
                    ) : (
                      <span className="font-mono text-mono-label uppercase text-text-muted">system</span>
                    )}
                  </Td>
                  <Td mono>{e.action}</Td>
                  <Td>
                    <span className="font-mono text-mono-label uppercase text-text-muted">{e.resourceType}</span>
                    {e.resourceId ? (
                      <span className="ml-2 font-mono text-body-sm text-text">{e.resourceId.slice(0, 8)}</span>
                    ) : null}
                  </Td>
                  <Td mono className="text-text-muted">
                    {e.sourceIp ?? "—"}
                  </Td>
                  <Td align="right">
                    <button
                      type="button"
                      onClick={() => setOpened(opened === e.id ? null : e.id)}
                      className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
                    >
                      {opened === e.id ? "Hide" : "View"}
                    </button>
                  </Td>
                </TR>
                {opened === e.id ? (
                  <TR>
                    <Td colSpan={6} className="bg-cream-soft align-top">
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <div className="font-mono text-mono-label uppercase text-text-muted">Before</div>
                          <pre className="mt-1 max-h-64 overflow-auto rounded-sm border border-line bg-white p-3 font-mono text-body-sm">
                            {JSON.stringify(e.beforeState, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <div className="font-mono text-mono-label uppercase text-text-muted">After</div>
                          <pre className="mt-1 max-h-64 overflow-auto rounded-sm border border-line bg-white p-3 font-mono text-body-sm">
                            {JSON.stringify(e.afterState, null, 2)}
                          </pre>
                        </div>
                      </div>
                      {e.correlationId ? (
                        <div className="mt-2 font-mono text-mono-label uppercase text-text-muted">
                          correlation: {e.correlationId}
                        </div>
                      ) : null}
                    </Td>
                  </TR>
                ) : null}
              </Fragment>
            ))}
          </TBody>
        </DataTable>
      )}
    </div>
  );
}
