"use client";

/**
 * Admin earnings & settlements (Phases 7 & 8).
 *   - Operational admins: see their settlements and confirm / dispute payment.
 *   - Super Admin: also edit fee percentages, create settlements, and mark paid.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

interface Settlement {
  id: string;
  admin_email: string;
  kind: "FULFILLMENT" | "STORAGE";
  period_start: string;
  period_end: string;
  gross_cents: number;
  platform_fee_cents: number;
  processing_fee_cents: number;
  net_cents: number;
  status: "PENDING" | "PAID_AWAITING" | "CONFIRMED" | "DISPUTED";
  receipt_url: string | null;
}
interface AdminUser { id: string; email: string; role: string }

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TONE: Record<Settlement["status"], "neutral" | "warning" | "success" | "error"> = {
  PENDING: "neutral", PAID_AWAITING: "warning", CONFIRMED: "success", DISPUTED: "error",
};

export default function EarningsPage(): JSX.Element {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isSuper = user?.role === "SUPER_ADMIN";
  const selectCls = "h-11 w-full rounded-sm border border-line-strong bg-white px-3 font-sans text-body text-text outline-none focus:border-ink";

  const mineQ = useQuery({
    queryKey: ["admin", "earnings", "mine"],
    queryFn: () => api.get<Settlement[]>("/admin/earnings/my-settlements"),
    enabled: !!user,
  });
  const allQ = useQuery({
    queryKey: ["admin", "earnings", "all"],
    queryFn: () => api.get<Settlement[]>("/admin/earnings/settlements"),
    enabled: isSuper,
  });
  const feesQ = useQuery({
    queryKey: ["admin", "earnings", "fees"],
    queryFn: () => api.get<{ platformBps: number; processingBps: number }>("/admin/earnings/fee-settings"),
    enabled: isSuper,
  });
  const adminsQ = useQuery({
    queryKey: ["admin", "users", "all"],
    queryFn: () => api.get<{ items: AdminUser[] }>("/admin/users?limit=100"),
    enabled: isSuper,
  });

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["admin", "earnings", "mine"] }),
      qc.invalidateQueries({ queryKey: ["admin", "earnings", "all"] }),
    ]);

  const respond = useMutation({
    mutationFn: (v: { id: string; outcome: "CONFIRMED" | "DISPUTED" }) =>
      api.post(`/admin/earnings/settlements/${v.id}/respond`, { outcome: v.outcome }),
    onSuccess: invalidate,
  });

  // Super admin: fee editor
  const [platformPct, setPlatformPct] = useState<string>("");
  const [processingPct, setProcessingPct] = useState<string>("");
  const saveFees = useMutation({
    mutationFn: () =>
      api.put("/admin/earnings/fee-settings", {
        platformBps: Math.round(parseFloat(platformPct || "0") * 100),
        processingBps: Math.round(parseFloat(processingPct || "0") * 100),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "earnings", "fees"] }),
  });

  // Super admin: create settlement
  const [cAdmin, setCAdmin] = useState("");
  const [cKind, setCKind] = useState<"FULFILLMENT" | "STORAGE">("FULFILLMENT");
  const [cFrom, setCFrom] = useState("");
  const [cTo, setCTo] = useState("");
  const createSettlement = useMutation({
    mutationFn: () =>
      api.post("/admin/earnings/settlements", { adminUserId: cAdmin, kind: cKind, from: cFrom, to: cTo }),
    onSuccess: invalidate,
  });

  // Super admin: mark paid
  const markPaid = useMutation({
    mutationFn: (v: { id: string; receiptUrl: string }) =>
      api.post(`/admin/earnings/settlements/${v.id}/paid`, v.receiptUrl ? { receiptUrl: v.receiptUrl } : {}),
    onSuccess: invalidate,
  });

  const fees = feesQ.data;
  const admins = (adminsQ.data?.items ?? []).filter((a) => a.role === "ADMIN");

  function SettlementRows({ rows, mine }: { rows: Settlement[]; mine: boolean }) {
    return (
      <DataTable>
        <THead>
          {!mine ? <Th>Admin</Th> : null}
          <Th>Kind</Th>
          <Th>Period</Th>
          <Th align="right">Gross</Th>
          <Th align="right">Net</Th>
          <Th>Status</Th>
          <Th align="right">Action</Th>
        </THead>
        <TBody>
          {rows.map((s) => (
            <TR key={s.id}>
              {!mine ? <Td>{s.admin_email}</Td> : null}
              <Td mono>{s.kind}</Td>
              <Td className="text-text-muted">
                {s.period_start.slice(0, 10)} → {s.period_end.slice(0, 10)}
              </Td>
              <Td num>{money(s.gross_cents)}</Td>
              <Td num strong>{money(s.net_cents)}</Td>
              <Td><StatusPill tone={TONE[s.status]}>{s.status.replace(/_/g, " ")}</StatusPill></Td>
              <Td align="right">
                {mine && s.status === "PAID_AWAITING" ? (
                  <span className="flex justify-end gap-2">
                    <button className="font-mono text-[11px] uppercase tracking-[1.2px] text-success hover:text-ink"
                      onClick={() => respond.mutate({ id: s.id, outcome: "CONFIRMED" })}>confirm</button>
                    <button className="font-mono text-[11px] uppercase tracking-[1.2px] text-error hover:text-ink"
                      onClick={() => respond.mutate({ id: s.id, outcome: "DISPUTED" })}>dispute</button>
                  </span>
                ) : null}
                {s.receipt_url ? (
                  <a href={s.receipt_url} target="_blank" rel="noreferrer"
                    className="font-mono text-[11px] uppercase tracking-[1.2px] text-text hover:text-ink">receipt</a>
                ) : null}
                {!mine && s.status === "PENDING" ? (
                  <button className="font-mono text-[11px] uppercase tracking-[1.2px] text-ink hover:text-amber"
                    onClick={() => {
                      const url = window.prompt("Receipt URL (optional):") ?? "";
                      markPaid.mutate({ id: s.id, receiptUrl: url });
                    }}>mark paid</button>
                ) : null}
              </Td>
            </TR>
          ))}
        </TBody>
      </DataTable>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="  Earnings" title="Admin earnings & payments"
        description="Your settlements and their payment status. Confirm once you've received a payment." />

      <section className="rounded-md border border-line bg-white p-6">
        <h2 className="mb-3 font-mono text-mono-label uppercase text-text-muted">My settlements</h2>
        {mineQ.data && mineQ.data.length > 0 ? (
          <SettlementRows rows={mineQ.data} mine />
        ) : (
          <p className="text-body-sm text-text-muted">No settlements yet.</p>
        )}
      </section>

      {isSuper ? (
        <>
          <section className="rounded-md border border-line bg-white p-6">
            <h2 className="mb-1 font-mono text-mono-label uppercase text-text-muted">Fee percentages</h2>
            <p className="mb-4 text-body-sm text-text-muted">
              Platform fee comes off gross fulfillment earnings; the processing fee comes off the remainder
              (and is the only deduction on Canada storage). Changes apply to future settlements only.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Platform fee (%)">
                <Input type="number" step="0.1" min={0} max={100}
                  placeholder={fees ? (fees.platformBps / 100).toString() : "6"}
                  value={platformPct} onChange={(e) => setPlatformPct(e.target.value)} />
              </Field>
              <Field label="Processing fee (%)">
                <Input type="number" step="0.1" min={0} max={100}
                  placeholder={fees ? (fees.processingBps / 100).toString() : "0"}
                  value={processingPct} onChange={(e) => setProcessingPct(e.target.value)} />
              </Field>
              <div className="flex items-end">
                <Button variant="primary" loading={saveFees.isPending} onClick={() => saveFees.mutate()}>
                  Save fees
                </Button>
              </div>
            </div>
            {fees ? (
              <p className="mt-2 text-body-sm text-text-muted">
                Current: platform {(fees.platformBps / 100).toFixed(1)}%, processing {(fees.processingBps / 100).toFixed(1)}%.
              </p>
            ) : null}
          </section>

          <section className="rounded-md border border-line bg-white p-6">
            <h2 className="mb-3 font-mono text-mono-label uppercase text-text-muted">Create a settlement</h2>
            <div className="grid gap-3 md:grid-cols-5">
              <Field label="Admin">
                <select className={selectCls} value={cAdmin} onChange={(e) => setCAdmin(e.target.value)}>
                  <option value="">Pick…</option>
                  {admins.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
                </select>
              </Field>
              <Field label="Kind">
                <select className={selectCls} value={cKind} onChange={(e) => setCKind(e.target.value as "FULFILLMENT" | "STORAGE")}>
                  <option value="FULFILLMENT">Fulfillment</option>
                  <option value="STORAGE">Storage</option>
                </select>
              </Field>
              <Field label="From"><Input type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} /></Field>
              <Field label="To"><Input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} /></Field>
              <div className="flex items-end">
                <Button variant="primary" disabled={!cAdmin || !cFrom || !cTo}
                  loading={createSettlement.isPending} onClick={() => createSettlement.mutate()}>
                  Create
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-md border border-line bg-white p-6">
            <h2 className="mb-3 font-mono text-mono-label uppercase text-text-muted">All settlements</h2>
            {allQ.data && allQ.data.length > 0 ? (
              <SettlementRows rows={allQ.data} mine={false} />
            ) : (
              <p className="text-body-sm text-text-muted">No settlements yet.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
