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

export default function AdminConfigPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "config"],
    queryFn: () => api.get<{ items: ConfigRow[] }>("/admin/config"),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="[07] Configuration"
        title="Platform configuration"
        description="Fee schedule, tier dimensions, repackaging fees. Every change is captured in the audit log with the full before/after JSON."
      />

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
                  <Link
                    href={`/admin/config/${encodeURIComponent(c.key)}`}
                    className="font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                  >
                    Edit →
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
