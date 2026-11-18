"use client";

/**
 * /admin/errors — SUPER_ADMIN view of client-side errors vendors hit in the
 * browser. Lets the operator see what a vendor experienced (failed/blocked API
 * calls, page crashes, uncaught JS) without logging into their account.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

interface ClientError {
  id: string;
  vendorId: string | null;
  vendorName: string | null;
  userEmail: string | null;
  role: string | null;
  kind: string;
  message: string;
  code: string | null;
  statusCode: number | null;
  path: string | null;
  createdAt: string;
}

interface ListResponse {
  items: ClientError[];
  nextBefore: string | null;
}

const KINDS: Array<{ value: string; label: string }> = [
  { value: "", label: "All kinds" },
  { value: "server_error", label: "Server error (5xx)" },
  { value: "api_error", label: "API error" },
  { value: "blocked_action", label: "Blocked action" },
  { value: "window_error", label: "JS error" },
  { value: "unhandled_rejection", label: "Promise rejection" },
  { value: "render_error", label: "Render crash" },
];

function kindTone(kind: string): string {
  if (
    kind === "server_error" ||
    kind === "window_error" ||
    kind === "unhandled_rejection" ||
    kind === "render_error"
  ) {
    return "bg-error/10 text-error";
  }
  return "bg-ink/5 text-text-muted";
}

export default function AdminErrorsPage(): JSX.Element | null {
  const { user, loading } = useAuth();
  const [kind, setKind] = useState("");

  const q = useQuery({
    queryKey: ["admin", "client-errors", { kind }],
    queryFn: () =>
      api.get<ListResponse>(`/admin/client-errors?limit=100${kind ? `&kind=${kind}` : ""}`),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
    enabled: !loading && user?.role === "SUPER_ADMIN",
  });

  // auto-refresh handled by refetchInterval; keep the dependency array honest.
  useEffect(() => {}, [kind]);

  if (loading || !user) return null;
  if (user.role !== "SUPER_ADMIN") return null;

  const items = q.data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Diagnostics"
        title="Vendor errors"
        description="Errors vendors hit in their browser — failed or blocked actions, and crashes. See what a vendor experienced without logging into their account. Updates automatically."
      />

      <div className="flex items-center gap-3">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="h-9 rounded-sm border border-line-strong bg-white px-2 font-mono text-body-sm text-text outline-none focus:border-ink"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        {q.isFetching ? (
          <span className="font-mono text-mono-label uppercase text-text-muted">Refreshing…</span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-line bg-white px-5 py-8 text-center font-mono text-mono-label uppercase text-text-muted">
          No errors logged{kind ? " for this filter" : ""} yet.
        </div>
      ) : (
        <DataTable>
          <THead>
            <Th>When</Th>
            <Th>Vendor / user</Th>
            <Th>Kind</Th>
            <Th>Status</Th>
            <Th>Message</Th>
            <Th>Page</Th>
          </THead>
          <TBody>
            {items.map((e) => (
              <TR key={e.id}>
                <Td mono className="whitespace-nowrap text-text-muted">
                  {new Date(e.createdAt).toLocaleString()}
                </Td>
                <Td>
                  <div className="text-body-sm text-ink">{e.vendorName ?? "—"}</div>
                  <div className="font-mono text-[11px] text-text-muted">
                    {e.userEmail ?? e.role ?? ""}
                  </div>
                </Td>
                <Td>
                  <span
                    className={`inline-flex rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase tracking-[1px] ${kindTone(
                      e.kind,
                    )}`}
                  >
                    {e.kind.replace(/_/g, " ")}
                  </span>
                </Td>
                <Td mono className="text-text-muted">
                  {e.statusCode ?? "—"}
                  {e.code ? <div className="text-[11px]">{e.code}</div> : null}
                </Td>
                <Td>
                  <div className="max-w-[28rem] text-body-sm text-text">{e.message}</div>
                </Td>
                <Td mono className="text-text-muted">
                  {e.path ?? "—"}
                </Td>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}
    </div>
  );
}
