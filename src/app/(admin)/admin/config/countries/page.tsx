"use client";

/**
 * SUPER_ADMIN — USA & Canada controls.
 *
 * One screen for the operational settings that previously had no UI:
 *   1. Canada switch-over (country routing on/off + Dishie readiness).
 *   2. Admin country scoping.
 *   3. Vendor ⇄ operational-admin assignments.
 *   4. Per-vendor flat-fee pricing.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

type Country = "US" | "CA";

interface AdminUser {
  id: string;
  email: string;
  role: string;
  adminCountry: string | null;
}
interface VendorRow {
  id: string;
  businessName: string;
}
interface Assignment {
  vendorId: string;
  vendorBusinessName: string;
  country: Country;
  adminUserId: string;
  adminEmail: string;
  updatedAt: string;
}
interface Readiness {
  countryRoutingEnabled: boolean;
  vendorsNeedingCanadaStock: Array<{ vendorId: string; businessName: string; canadaOrderCount: number }>;
  canadaStockBuckets: number;
}
interface SenderProfile {
  key: string; label: string; name: string; phone: string; email: string;
  line1: string; line2: string | null; city: string; state: string; postalCode: string; country: string;
}
type SenderForm = {
  key: string; label: string; name: string; phone: string; email: string;
  line1: string; line2: string; city: string; state: string; postalCode: string; country: Country;
};

export default function CountryControlsPage(): JSX.Element {
  const { user, loading } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && user?.role !== "SUPER_ADMIN") router.replace("/admin");
  }, [loading, user, router]);

  const enabled = !loading && user?.role === "SUPER_ADMIN";

  const readinessQ = useQuery({
    queryKey: ["admin", "migration", "readiness"],
    queryFn: () => api.get<Readiness>("/admin/migration/readiness"),
    enabled,
  });
  const adminsQ = useQuery({
    queryKey: ["admin", "users", "all"],
    queryFn: () => api.get<{ items: AdminUser[] }>("/admin/users?limit=100"),
    enabled,
  });
  const vendorsQ = useQuery({
    queryKey: ["admin", "finance", "vendors", "all"],
    queryFn: () => api.get<{ items: VendorRow[] }>("/admin/finance/vendors?limit=100"),
    enabled,
  });
  const assignmentsQ = useQuery({
    queryKey: ["admin", "vendor-assignments"],
    queryFn: () => api.get<Assignment[]>("/admin/vendor-assignments"),
    enabled,
  });

  const invalidate = (keys: string[][]) =>
    Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));

  // --- switch-over ---------------------------------------------------------
  const enableRouting = useMutation({
    mutationFn: (ack: boolean) =>
      api.post("/admin/migration/enable-routing", { confirm: true, acknowledgePendingCanada: ack }),
    onSuccess: () => invalidate([["admin", "migration", "readiness"]]),
  });
  const disableRouting = useMutation({
    mutationFn: () => api.post("/admin/migration/disable-routing", {}),
    onSuccess: () => invalidate([["admin", "migration", "readiness"]]),
  });

  // --- admin country -------------------------------------------------------
  const setCountry = useMutation({
    mutationFn: (v: { id: string; country: Country | null }) =>
      api.put(`/admin/admins/${v.id}/country`, { country: v.country }),
    onSuccess: () => invalidate([["admin", "users", "all"]]),
  });

  // --- assignment ----------------------------------------------------------
  const [asgVendor, setAsgVendor] = useState("");
  const [asgCountry, setAsgCountry] = useState<Country>("US");
  const [asgAdmin, setAsgAdmin] = useState("");
  const assign = useMutation({
    mutationFn: () =>
      api.put("/admin/vendor-assignments", {
        vendorId: asgVendor,
        country: asgCountry,
        adminUserId: asgAdmin,
      }),
    onSuccess: () => {
      setAsgVendor(""); setAsgAdmin("");
      return invalidate([["admin", "vendor-assignments"]]);
    },
  });
  const unassign = useMutation({
    mutationFn: (v: { vendorId: string; country: Country }) =>
      api.delete(`/admin/vendor-assignments?vendorId=${v.vendorId}&country=${v.country}`),
    onSuccess: () => invalidate([["admin", "vendor-assignments"]]),
  });

  // Admins eligible for a given country (must be scoped to it).
  const adminsForCountry = (c: Country) =>
    (adminsQ.data?.items ?? []).filter((a) => a.role === "ADMIN" && a.adminCountry === c);

  // --- flat fee ------------------------------------------------------------
  const [ffVendor, setFfVendor] = useState("");
  const [ffEnabled, setFfEnabled] = useState(false);
  const [ffFee, setFfFee] = useState("");
  const [ffUnits, setFfUnits] = useState("");
  const saveFlatFee = useMutation({
    mutationFn: () =>
      api.put(`/admin/vendors/${ffVendor}/flat-fee`, {
        enabled: ffEnabled,
        ...(ffEnabled
          ? { feeCents: Math.round(parseFloat(ffFee || "0") * 100), maxUnits: parseInt(ffUnits || "0", 10) }
          : {}),
      }),
  });

  // --- Shippo sender profiles ---------------------------------------------
  const sendersQ = useQuery({
    queryKey: ["admin", "shippo-senders"],
    queryFn: () => api.get<SenderProfile[]>("/admin/shippo-senders"),
    enabled,
  });
  const emptySender = {
    key: "DEFAULT", label: "Default (all orders)", name: "", phone: "", email: "",
    line1: "", line2: "", city: "", state: "", postalCode: "", country: "US" as Country,
  };
  const [sender, setSender] = useState<SenderForm>(emptySender);
  const setS = (k: keyof SenderForm, v: string) => setSender((p) => ({ ...p, [k]: v }));
  const saveSender = useMutation({
    mutationFn: () => api.put("/admin/shippo-senders", sender),
    onSuccess: () => { setSender(emptySender); return invalidate([["admin", "shippo-senders"]]); },
  });
  const deleteSender = useMutation({
    mutationFn: (key: string) => api.delete(`/admin/shippo-senders/${encodeURIComponent(key)}`),
    onSuccess: () => invalidate([["admin", "shippo-senders"]]),
  });

  const vendors = vendorsQ.data?.items ?? [];
  const admins = adminsQ.data?.items ?? [];
  const r = readinessQ.data;
  const pending = r?.vendorsNeedingCanadaStock ?? [];

  const selectCls =
    "h-11 w-full rounded-sm border border-line-strong bg-white px-3 font-sans text-body text-text outline-none focus:border-ink";

  const vendorName = useMemo(
    () => new Map(vendors.map((v) => [v.id, v.businessName])),
    [vendors],
  );

  if (loading || user?.role !== "SUPER_ADMIN") {
    return <div className="p-8 font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="  Platform / USA & Canada"
        title="USA & Canada controls"
        description="Turn on country routing, scope admins to a country, assign vendors to admins, and set negotiated flat-fee pricing."
      />

      {/* 1. Switch-over */}
      <section className="rounded-md border border-line bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-mono text-mono-label uppercase text-text-muted">Canada switch-over</h2>
            <p className="mt-1 text-body-sm text-text-muted">
              When on, USA orders use USA stock and Canada orders use Canada stock.
            </p>
          </div>
          <StatusPill tone={r?.countryRoutingEnabled ? "success" : "neutral"}>
            {r?.countryRoutingEnabled ? "Routing ON" : "Routing OFF"}
          </StatusPill>
        </div>

        {pending.length > 0 ? (
          <div className="mt-4 rounded-sm border-l-4 border-amber bg-amber/10 px-4 py-3 text-body-sm text-text">
            <strong className="font-mono text-mono-label uppercase text-amber">Dishie checkpoint</strong>
            <p className="mt-1">
              These vendors have Canada orders but no received Canada stock. Receive their Canada PSN
              first, or acknowledge to proceed (their orders will be held for review, not pulled from USA):
            </p>
            <ul className="mt-2 list-disc pl-5">
              {pending.map((p) => (
                <li key={p.vendorId}>
                  {p.businessName} — {p.canadaOrderCount} Canada order(s)
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-body-sm text-text-muted">
            No vendors have Canada orders without Canada stock. Canada stock buckets on platform:{" "}
            {r?.canadaStockBuckets ?? 0}.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          {r?.countryRoutingEnabled ? (
            <Button variant="outline" loading={disableRouting.isPending} onClick={() => disableRouting.mutate()}>
              Turn routing OFF
            </Button>
          ) : (
            <Button
              variant="amber"
              loading={enableRouting.isPending}
              onClick={() => enableRouting.mutate(pending.length > 0)}
            >
              {pending.length > 0 ? "Acknowledge & turn routing ON" : "Turn routing ON"}
            </Button>
          )}
        </div>
        {enableRouting.isError ? (
          <p className="mt-2 text-body-sm text-error">Couldn&apos;t enable — check the readiness above.</p>
        ) : null}
      </section>

      {/* 2. Admin country */}
      <section className="rounded-md border border-line bg-white p-6">
        <h2 className="font-mono text-mono-label uppercase text-text-muted">Admin country</h2>
        <p className="mt-1 mb-4 text-body-sm text-text-muted">
          Scope each operational admin (ADMIN role) to a country. They only see that country&apos;s records.
        </p>
        <DataTable>
          <THead>
            <Th>Admin</Th>
            <Th>Role</Th>
            <Th>Country</Th>
          </THead>
          <TBody>
            {admins.filter((a) => a.role === "ADMIN").map((a) => (
              <TR key={a.id}>
                <Td>{a.email}</Td>
                <Td mono className="text-text-muted">{a.role}</Td>
                <Td>
                  <select
                    className={selectCls}
                    value={a.adminCountry ?? ""}
                    onChange={(e) =>
                      setCountry.mutate({
                        id: a.id,
                        country: e.target.value ? (e.target.value as Country) : null,
                      })
                    }
                  >
                    <option value="">— none —</option>
                    <option value="US">USA</option>
                    <option value="CA">Canada</option>
                  </select>
                </Td>
              </TR>
            ))}
          </TBody>
        </DataTable>
      </section>

      {/* 3. Assignments */}
      <section className="rounded-md border border-line bg-white p-6">
        <h2 className="font-mono text-mono-label uppercase text-text-muted">Vendor assignments</h2>
        <p className="mt-1 mb-4 text-body-sm text-text-muted">
          Assign a vendor to an operational admin for a country (one admin per vendor per country).
        </p>
        <div className="mb-5 grid gap-3 md:grid-cols-4">
          <Field label="Vendor">
            <select className={selectCls} value={asgVendor} onChange={(e) => setAsgVendor(e.target.value)}>
              <option value="">Pick a vendor…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.businessName}</option>
              ))}
            </select>
          </Field>
          <Field label="Country">
            <select
              className={selectCls}
              value={asgCountry}
              onChange={(e) => { setAsgCountry(e.target.value as Country); setAsgAdmin(""); }}
            >
              <option value="US">USA</option>
              <option value="CA">Canada</option>
            </select>
          </Field>
          <Field label="Operational admin">
            <select className={selectCls} value={asgAdmin} onChange={(e) => setAsgAdmin(e.target.value)}>
              <option value="">Pick an admin…</option>
              {adminsForCountry(asgCountry).map((a) => (
                <option key={a.id} value={a.id}>{a.email}</option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <Button
              variant="primary"
              disabled={!asgVendor || !asgAdmin}
              loading={assign.isPending}
              onClick={() => assign.mutate()}
            >
              Assign
            </Button>
          </div>
        </div>
        {adminsForCountry(asgCountry).length === 0 ? (
          <p className="mb-4 text-body-sm text-amber">
            No admins are scoped to {asgCountry === "CA" ? "Canada" : "USA"} yet — set an admin&apos;s country above first.
          </p>
        ) : null}
        <DataTable>
          <THead>
            <Th>Vendor</Th>
            <Th>Country</Th>
            <Th>Admin</Th>
            <Th align="right">Remove</Th>
          </THead>
          <TBody>
            {(assignmentsQ.data ?? []).map((a) => (
              <TR key={`${a.vendorId}-${a.country}`}>
                <Td>{a.vendorBusinessName || vendorName.get(a.vendorId) || a.vendorId}</Td>
                <Td mono>{a.country}</Td>
                <Td>{a.adminEmail}</Td>
                <Td align="right">
                  <button
                    type="button"
                    onClick={() => unassign.mutate({ vendorId: a.vendorId, country: a.country })}
                    className="font-mono text-[11px] uppercase tracking-[1.2px] text-error hover:text-ink"
                  >
                    remove
                  </button>
                </Td>
              </TR>
            ))}
          </TBody>
        </DataTable>
      </section>

      {/* 4. Flat fee */}
      <section className="rounded-md border border-line bg-white p-6">
        <h2 className="font-mono text-mono-label uppercase text-text-muted">Flat-fee pricing</h2>
        <p className="mt-1 mb-4 text-body-sm text-text-muted">
          Put a vendor on a negotiated flat fulfillment fee. Within the item limit they pay the flat fee;
          above it, the normal maximum applies. New orders only.
        </p>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Vendor">
            <select className={selectCls} value={ffVendor} onChange={(e) => setFfVendor(e.target.value)}>
              <option value="">Pick a vendor…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.businessName}</option>
              ))}
            </select>
          </Field>
          <Field label="Flat fee enabled">
            <select
              className={selectCls}
              value={ffEnabled ? "yes" : "no"}
              onChange={(e) => setFfEnabled(e.target.value === "yes")}
            >
              <option value="no">Off (default schedule)</option>
              <option value="yes">On (flat fee)</option>
            </select>
          </Field>
          <Field label="Flat fee ($)">
            <Input
              type="number"
              step="0.01"
              min={0}
              disabled={!ffEnabled}
              value={ffFee}
              onChange={(e) => setFfFee(e.target.value)}
              placeholder="5.00"
            />
          </Field>
          <Field label="Max items">
            <Input
              type="number"
              min={1}
              disabled={!ffEnabled}
              value={ffUnits}
              onChange={(e) => setFfUnits(e.target.value)}
              placeholder="10"
            />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button
            variant="primary"
            disabled={!ffVendor || (ffEnabled && (!ffFee || !ffUnits))}
            loading={saveFlatFee.isPending}
            onClick={() => saveFlatFee.mutate()}
          >
            Save pricing
          </Button>
          {saveFlatFee.isSuccess ? <span className="text-body-sm text-success">Saved.</span> : null}
          {saveFlatFee.isError ? <span className="text-body-sm text-error">Couldn&apos;t save.</span> : null}
        </div>
      </section>

      {/* 5. Shippo sender profiles */}
      <section className="rounded-md border border-line bg-white p-6">
        <h2 className="font-mono text-mono-label uppercase text-text-muted">Shippo sender profiles</h2>
        <p className="mt-1 mb-4 text-body-sm text-text-muted">
          The "ship from" address printed on labels. An order&apos;s label uses the profile of the admin
          who processed it; if none, the <strong>Default</strong> profile; if none, the system warehouse
          address. Set the Default plus one per admin.
        </p>

        <DataTable>
          <THead>
            <Th>Profile</Th>
            <Th>Name</Th>
            <Th>Address</Th>
            <Th align="right">Edit</Th>
          </THead>
          <TBody>
            {(sendersQ.data ?? []).map((p) => (
              <TR key={p.key}>
                <Td>{p.label}</Td>
                <Td>{p.name}</Td>
                <Td className="text-text-muted">
                  {p.line1}, {p.city}, {p.state} {p.postalCode} · {p.country}
                </Td>
                <Td align="right">
                  <button
                    type="button"
                    className="font-mono text-[11px] uppercase tracking-[1.2px] text-text hover:text-ink"
                    onClick={() => setSender({ ...p, line2: p.line2 ?? "", country: (p.country as Country) })}
                  >
                    edit
                  </button>
                  {p.key !== "DEFAULT" ? (
                    <button
                      type="button"
                      className="ml-3 font-mono text-[11px] uppercase tracking-[1.2px] text-error hover:text-ink"
                      onClick={() => deleteSender.mutate(p.key)}
                    >
                      remove
                    </button>
                  ) : null}
                </Td>
              </TR>
            ))}
          </TBody>
        </DataTable>

        <div className="mt-5 border-t border-line pt-5">
          <div className="mb-3 font-mono text-mono-label uppercase text-text-muted">Add / edit a profile</div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="For (profile)">
              <select
                className={selectCls}
                value={sender.key}
                onChange={(e) => {
                  const key = e.target.value;
                  const label =
                    key === "DEFAULT"
                      ? "Default (all orders)"
                      : admins.find((a) => a.id === key)?.email ?? "Admin";
                  setSender((p) => ({ ...p, key, label }));
                }}
              >
                <option value="DEFAULT">Default (all orders)</option>
                {admins.filter((a) => a.role === "ADMIN").map((a) => (
                  <option key={a.id} value={a.id}>{a.email}</option>
                ))}
              </select>
            </Field>
            <Field label="Sender name"><Input value={sender.name} onChange={(e) => setS("name", e.target.value)} /></Field>
            <Field label="Phone"><Input value={sender.phone} onChange={(e) => setS("phone", e.target.value)} /></Field>
            <Field label="Email"><Input value={sender.email} onChange={(e) => setS("email", e.target.value)} /></Field>
            <Field label="Address line 1"><Input value={sender.line1} onChange={(e) => setS("line1", e.target.value)} /></Field>
            <Field label="Address line 2"><Input value={sender.line2} onChange={(e) => setS("line2", e.target.value)} /></Field>
            <Field label="City"><Input value={sender.city} onChange={(e) => setS("city", e.target.value)} /></Field>
            <Field label="State/Province"><Input value={sender.state} onChange={(e) => setS("state", e.target.value)} /></Field>
            <Field label="Postal code"><Input value={sender.postalCode} onChange={(e) => setS("postalCode", e.target.value)} /></Field>
            <Field label="Country">
              <select className={selectCls} value={sender.country} onChange={(e) => setS("country", e.target.value)}>
                <option value="US">USA</option>
                <option value="CA">Canada</option>
              </select>
            </Field>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button
              variant="primary"
              loading={saveSender.isPending}
              disabled={!sender.name || !sender.line1 || !sender.city || !sender.state || !sender.postalCode || !sender.phone || !sender.email}
              onClick={() => saveSender.mutate()}
            >
              Save profile
            </Button>
            {saveSender.isError ? <span className="text-body-sm text-error">Couldn&apos;t save — check the fields.</span> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
