"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Plug } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

// ---------------------------------------------------------------------------
// Types mirror the backend's IntegrationSettings / PublicApiKey shapes.
// ---------------------------------------------------------------------------

interface PublicApiKey {
  id: string;
  name: string;
  displayPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface IntegrationSettings {
  defaultCarrierService: string | null;
  defaultInsurance: boolean;
  keys: PublicApiKey[];
}

interface CreatedKey {
  fullKey: string;
  key: PublicApiKey;
}

// "Cheapest" is the sentinel the backend normalizes to null.
const CARRIER_OPTIONS = [
  { value: "CHEAPEST", label: "Cheapest available" },
  { value: "USPS Ground Advantage", label: "USPS Ground Advantage" },
  { value: "USPS Priority", label: "USPS Priority" },
  { value: "USPS Priority Express", label: "USPS Priority Express" },
];

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.myusaerrands.com/v1";

export default function IntegrationsPage(): JSX.Element {
  const { user } = useAuth();
  const isSubUser = user?.role === "VENDOR_SUB_USER";
  const qc = useQueryClient();
  const toast = useToast();

  const settingsQ = useQuery({
    queryKey: ["integration", "settings"],
    queryFn: () => api.get<IntegrationSettings>("/integration/settings"),
  });

  // Local form state for the default-shipping section.
  const [carrier, setCarrier] = useState("CHEAPEST");
  const [insurance, setInsurance] = useState(false);
  useEffect(() => {
    if (settingsQ.data) {
      setCarrier(settingsQ.data.defaultCarrierService ?? "CHEAPEST");
      setInsurance(settingsQ.data.defaultInsurance);
    }
  }, [settingsQ.data]);

  const settingsMut = useMutation({
    mutationFn: () =>
      api.patch<IntegrationSettings>("/integration/settings", {
        defaultCarrierService: carrier === "CHEAPEST" ? null : carrier,
        defaultInsurance: insurance,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["integration", "settings"] });
      toast.show({ title: "Shipping defaults saved.", severity: "success" });
    },
    onError: () =>
      toast.show({ title: "Couldn't save shipping defaults.", severity: "error" }),
  });

  // New-key creation. The full key is shown ONCE here; never retrievable again.
  const [newKeyName, setNewKeyName] = useState("");
  const [revealed, setRevealed] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);

  const createMut = useMutation({
    mutationFn: () => api.post<CreatedKey>("/integration/keys", { name: newKeyName.trim() }),
    onSuccess: async (data) => {
      setRevealed(data);
      setNewKeyName("");
      await qc.invalidateQueries({ queryKey: ["integration", "settings"] });
    },
    onError: () => toast.show({ title: "Couldn't create the key.", severity: "error" }),
  });

  const [revokeId, setRevokeId] = useState<string | null>(null);
  const revokeMut = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/integration/keys/${id}`),
    onSuccess: async () => {
      setRevokeId(null);
      await qc.invalidateQueries({ queryKey: ["integration", "settings"] });
      toast.show({ title: "Key revoked.", severity: "success" });
    },
    onError: () => toast.show({ title: "Couldn't revoke the key.", severity: "error" }),
  });

  async function copyKey(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the value is selectable in the box */
    }
  }

  const activeKeys = settingsQ.data?.keys.filter((k) => !k.revokedAt) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Store integration"
        title="Connect your online store"
        description="Let your website send paid orders to us automatically. When a customer checks out on your store, the order flows straight into fulfillment and the fee is charged to your wallet — you never re-key anything."
      />

      {settingsQ.isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : settingsQ.isError ? (
        <div className="rounded-md border border-error bg-error/10 px-4 py-3 text-body-sm text-error">
          Couldn&apos;t load your integration settings.
        </div>
      ) : (
        <>
          {/* ---- Default shipping ------------------------------------------ */}
          <section className="rounded-md border border-line bg-white p-8">
            <h2 className="text-h3 font-semibold text-ink">Default shipping</h2>
            <p className="mt-2 max-w-2xl text-body-sm text-text-muted">
              Orders that arrive from your store have no human to pick a shipping
              service, so we use this default. An individual order can override it.
            </p>

            <div className="mt-6 grid max-w-xl gap-5">
              <Field label="Shipping service">
                <select
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  disabled={isSubUser}
                  className="h-11 w-full rounded-md border border-line bg-white px-3 text-body-sm text-ink focus:border-ink focus:outline-none disabled:opacity-60"
                >
                  {CARRIER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>

              <label className="flex items-center gap-3 text-body-sm text-ink">
                <input
                  type="checkbox"
                  checked={insurance}
                  onChange={(e) => setInsurance(e.target.checked)}
                  disabled={isSubUser}
                  className="h-4 w-4 rounded border-line text-ink focus:ring-ink"
                />
                Add carrier insurance by default
              </label>

              {!isSubUser && (
                <div>
                  <Button
                    onClick={() => settingsMut.mutate()}
                    loading={settingsMut.isPending}
                  >
                    Save defaults
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* ---- API keys -------------------------------------------------- */}
          <section className="rounded-md border border-line bg-white p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 className="text-h3 font-semibold text-ink">API keys</h2>
              <span className="font-mono text-mono-label uppercase text-text-muted">
                {activeKeys.length} active
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-body-sm text-text-muted">
              Your website authenticates with one of these keys. Treat it like a
              password — anyone with it can create orders billed to your wallet.
            </p>

            {/* Freshly-created key — shown exactly once. */}
            {revealed && (
              <div className="mt-6 rounded-md border border-amber/40 bg-amber/5 p-5">
                <div className="flex items-center gap-2 text-body-sm font-semibold text-ink">
                  <KeyRound className="h-4 w-4" />
                  Copy your key now — it won&apos;t be shown again
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <code className="flex-1 break-all rounded border border-line bg-white px-3 py-2 font-mono text-mono-label text-ink">
                    {revealed.fullKey}
                  </code>
                  <Button variant="outline" onClick={() => copyKey(revealed.fullKey)}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <button
                  onClick={() => setRevealed(null)}
                  className="mt-3 text-body-sm text-text-muted underline hover:text-ink"
                >
                  I&apos;ve saved it — dismiss
                </button>
              </div>
            )}

            {/* Create new */}
            {!isSubUser && (
              <div className="mt-6 flex flex-wrap items-end gap-3">
                <Field label="New key name" className="flex-1 min-w-[16rem]">
                  <Input
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g. Main website"
                    maxLength={60}
                  />
                </Field>
                <Button
                  onClick={() => createMut.mutate()}
                  loading={createMut.isPending}
                  disabled={newKeyName.trim().length === 0}
                >
                  Create key
                </Button>
              </div>
            )}

            {/* List */}
            <div className="mt-6 divide-y divide-line border-t border-line">
              {(settingsQ.data?.keys ?? []).length === 0 ? (
                <p className="py-6 text-body-sm text-text-muted">No keys yet.</p>
              ) : (
                settingsQ.data?.keys.map((k) => (
                  <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-body-sm font-medium text-ink">{k.name}</span>
                        {k.revokedAt ? (
                          <StatusPill tone="neutral">Revoked</StatusPill>
                        ) : (
                          <StatusPill tone="success">Active</StatusPill>
                        )}
                      </div>
                      <div className="mt-1 font-mono text-mono-label text-text-muted">
                        {k.displayPrefix}…
                      </div>
                      <div className="mt-1 text-caption text-text-muted">
                        {k.lastUsedAt
                          ? `Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                          : "Never used"}
                        {" · "}
                        Created {new Date(k.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {!isSubUser && !k.revokedAt && (
                      <Button variant="ghost" onClick={() => setRevokeId(k.id)}>
                        Revoke
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          {/* ---- How to connect ------------------------------------------- */}
          <section className="rounded-md border border-line bg-white p-8">
            <div className="flex items-center gap-2">
              <Plug className="h-5 w-5 text-ink" />
              <h2 className="text-h3 font-semibold text-ink">How to connect</h2>
            </div>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-body-sm text-text-muted">
              <li>
                In your store, set each product&apos;s <strong>SKU</strong> field to its
                USA Errands <strong>product code</strong> (e.g. <code className="font-mono">TSH-BLK-M</code>).
                That&apos;s how we match what sold to what we&apos;re holding.
              </li>
              <li>
                When an order is paid, have your store <code className="font-mono">POST</code>{" "}
                it to the endpoint below with your API key in the{" "}
                <code className="font-mono">Authorization</code> header.
              </li>
              <li>
                We validate the address, reserve stock, charge your wallet, and start
                fulfillment. If your wallet is short or an item doesn&apos;t match, the
                order is <strong>held</strong> (not lost) and you&apos;re notified.
              </li>
            </ol>

            <div className="mt-5 overflow-x-auto rounded-md border border-line bg-cream/40 p-4">
              <pre className="whitespace-pre font-mono text-mono-label text-ink">
{`POST ${API_BASE}/integration/orders
Authorization: Bearer uer_live_xxx.xxx
Content-Type: application/json

{
  "externalReference": "STORE-1001",
  "recipient": {
    "name": "Jane Buyer",
    "line1": "123 Market St",
    "city": "Austin", "state": "TX", "postalCode": "78701"
  },
  "lines": [
    { "sku": "TSH-BLK-M", "quantity": 2 }
  ]
}`}
              </pre>
            </div>
            <p className="mt-3 text-caption text-text-muted">
              Re-sending the same <code className="font-mono">externalReference</code> is
              safe — it never creates a duplicate. Full reference is in your developer
              docs.
            </p>
          </section>
        </>
      )}

      <ConfirmDialog
        open={revokeId !== null}
        onCancel={() => setRevokeId(null)}
        onConfirm={() => revokeId && revokeMut.mutate(revokeId)}
        title="Revoke this API key?"
        description="Any website using it will immediately stop being able to send orders. This can't be undone."
        confirmLabel="Revoke key"
        tone="danger"
        confirming={revokeMut.isPending}
      />
    </div>
  );
}
