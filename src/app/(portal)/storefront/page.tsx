"use client";

/**
 * Vendor storefront management (Migration 0059). Set up the store, connect a
 * payout account, go live (one-time $50), toggle the marketplace feature, and
 * manage discount codes — all in one place.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";

interface Settings {
  slug: string | null;
  storefrontEnabled: boolean;
  storefrontFeePaidAt: string | null;
  marketplaceFeatured: boolean;
  displayName: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  accentColor: string | null;
  about: string | null;
  hasActivePayoutAccount: boolean;
}
interface PayoutAccount {
  processor: "STRIPE" | "FLUTTERWAVE" | "PAYSTACK";
  status: string;
  chargesEnabled: boolean;
}

// Countries where Flutterwave can create a settlement subaccount + list banks.
const FLW_COUNTRIES: Array<{ code: string; label: string }> = [
  { code: "NG", label: "Nigeria" },
  { code: "GH", label: "Ghana" },
  { code: "KE", label: "Kenya" },
  { code: "UG", label: "Uganda" },
  { code: "TZ", label: "Tanzania" },
  { code: "ZA", label: "South Africa" },
  { code: "RW", label: "Rwanda" },
];

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "myusaerrands.com";

export default function VendorStorefrontPage() {
  const qc = useQueryClient();
  const { bannerError, handle, clear } = useApiErrorHandler();

  const settings = useQuery({
    queryKey: ["storefront-settings"],
    queryFn: () => api.get<Settings>("/storefront/settings"),
  });
  const accounts = useQuery({
    queryKey: ["payout-accounts"],
    queryFn: () => api.get<PayoutAccount[]>("/payments/accounts"),
  });

  const s = settings.data;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Storefront" description="Sell directly to buyers with a branded store." />

      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner error={bannerError} onAction={() => clear()} />
        </div>
      ) : null}

      {settings.isLoading || !s ? (
        <div className="py-16 text-center font-mono text-mono-label text-text-subtle">Loading…</div>
      ) : (
        <div className="flex flex-col gap-6">
          <StatusCard settings={s} />
          <PresentationCard settings={s} onSaved={() => qc.invalidateQueries({ queryKey: ["storefront-settings"] })} onError={handle} clearError={clear} />
          <SlugCard settings={s} onSaved={() => qc.invalidateQueries({ queryKey: ["storefront-settings"] })} onError={handle} clearError={clear} />
          <PayoutCard accounts={accounts.data ?? []} onChanged={() => { void accounts.refetch(); void settings.refetch(); }} onError={handle} clearError={clear} />
          <GoLiveCard settings={s} onChanged={() => qc.invalidateQueries({ queryKey: ["storefront-settings"] })} onError={handle} clearError={clear} />
          <DiscountsCard onError={handle} clearError={clear} />
          <DomainsCard onError={handle} clearError={clear} />
          <div className="flex gap-3">
            <Link href="/storefront/products" className="text-[13px] font-medium text-amber hover:underline">Manage products →</Link>
            <Link href="/storefront/orders" className="text-[13px] font-medium text-amber hover:underline">Storefront orders →</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-white p-6">
      <h2 className="mb-4 font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted">{title}</h2>
      {children}
    </section>
  );
}

function StatusCard({ settings }: { settings: Settings }) {
  const liveUrl = settings.slug ? `https://${settings.slug}.${ROOT}` : null;
  return (
    <Card title="Status">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill tone={settings.storefrontEnabled ? "success" : "neutral"}>
          {settings.storefrontEnabled ? "Live" : "Offline"}
        </StatusPill>
        {settings.marketplaceFeatured ? <StatusPill tone="info">On marketplace</StatusPill> : null}
        {settings.hasActivePayoutAccount ? (
          <StatusPill tone="success">Payout connected</StatusPill>
        ) : (
          <StatusPill tone="warning">No payout account</StatusPill>
        )}
      </div>
      {settings.storefrontEnabled && liveUrl ? (
        <p className="mt-3 text-body-sm text-text-muted">
          Your store is live at{" "}
          <a href={liveUrl} target="_blank" rel="noreferrer" className="font-mono text-ink underline">
            {settings.slug}.{ROOT}
          </a>
        </p>
      ) : null}
    </Card>
  );
}

// Default store accent + a curated palette so vendors pick a color instead of
// typing a hex code. The last "custom" swatch opens the OS colour picker for
// anything outside the presets — still a visual pick, never free-typed text.
const DEFAULT_ACCENT = "#0A0A0A";
const ACCENT_PALETTE: ReadonlyArray<{ hex: string; name: string }> = [
  { hex: "#0A0A0A", name: "Ink" },
  { hex: "#1F2937", name: "Slate" },
  { hex: "#B45309", name: "Amber" },
  { hex: "#C2410C", name: "Rust" },
  { hex: "#DC2626", name: "Red" },
  { hex: "#DB2777", name: "Pink" },
  { hex: "#7C3AED", name: "Violet" },
  { hex: "#2563EB", name: "Blue" },
  { hex: "#0EA5E9", name: "Sky" },
  { hex: "#0D9488", name: "Teal" },
  { hex: "#16A34A", name: "Green" },
  { hex: "#65A30D", name: "Olive" },
];

function AccentColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const current = (value || DEFAULT_ACCENT).toLowerCase();
  const isPreset = ACCENT_PALETTE.some((c) => c.hex.toLowerCase() === current);
  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      {ACCENT_PALETTE.map((c) => {
        const selected = c.hex.toLowerCase() === current;
        return (
          <button
            key={c.hex}
            type="button"
            title={c.name}
            aria-label={`Accent colour ${c.name}`}
            aria-pressed={selected}
            onClick={() => onChange(c.hex)}
            className={
              "h-8 w-8 rounded-full transition-transform hover:scale-110 " +
              (selected ? "ring-2 ring-ink ring-offset-2" : "ring-1 ring-line-strong")
            }
            style={{ background: c.hex }}
          />
        );
      })}
      {/* Custom — opens the native colour palette; the hidden input overlays a
          rainbow swatch (or the chosen colour when a non-preset is active). */}
      <label
        title="More colours"
        aria-label="Pick a custom accent colour"
        className={
          "relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110 " +
          (!isPreset ? "ring-2 ring-ink ring-offset-2" : "ring-1 ring-line-strong")
        }
        style={{
          background: !isPreset
            ? current
            : "conic-gradient(from 0deg, #ef4444, #f59e0b, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)",
        }}
      >
        <input
          type="color"
          value={current}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

function PresentationCard({
  settings,
  onSaved,
  onError,
  clearError,
}: {
  settings: Settings;
  onSaved: () => void;
  onError: (e: unknown) => void;
  clearError: () => void;
}) {
  const [displayName, setDisplayName] = useState(settings.displayName ?? "");
  const [about, setAbout] = useState(settings.about ?? "");
  const [accentColor, setAccentColor] = useState(settings.accentColor ?? DEFAULT_ACCENT);
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl ?? "");
  const [bannerUrl, setBannerUrl] = useState(settings.bannerUrl ?? "");

  const save = useMutation({
    mutationFn: () =>
      api.put("/storefront/settings", {
        displayName: displayName.trim(),
        about: about.trim() || undefined,
        accentColor: accentColor || undefined,
        logoUrl: logoUrl.trim() || undefined,
        bannerUrl: bannerUrl.trim() || undefined,
      }),
    onSuccess: onSaved,
    onError,
  });

  return (
    <Card title="Presentation">
      <div className="flex flex-col gap-3">
        <Field label="Store name"><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></Field>
        <Field label="About (optional)">
          <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={3} maxLength={2000}
            className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-body-sm outline-none focus:border-ink" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Accent color">
            <AccentColorPicker value={accentColor} onChange={setAccentColor} />
          </Field>
          <Field label="Logo URL (optional)"><Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} /></Field>
        </div>
        <Field label="Banner URL (optional)"><Input value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} /></Field>
        <div>
          <Button variant="primary" loading={save.isPending} onClick={() => { clearError(); save.mutate(); }}>Save presentation</Button>
        </div>
      </div>
    </Card>
  );
}

function SlugCard({
  settings,
  onSaved,
  onError,
  clearError,
}: {
  settings: Settings;
  onSaved: () => void;
  onError: (e: unknown) => void;
  clearError: () => void;
}) {
  const [slug, setSlug] = useState(settings.slug ?? "");
  const save = useMutation({
    mutationFn: () => api.put("/storefront/slug", { slug: slug.trim().toLowerCase() }),
    onSuccess: onSaved,
    onError,
  });
  return (
    <Card title="Store address">
      <Field label="Slug">
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="your-store" />
      </Field>
      <p className="mt-1 text-[12px] text-text-subtle">
        Your store will live at <span className="font-mono">{(slug || "your-store")}.{ROOT}</span> and{" "}
        <span className="font-mono">{ROOT}/store/{slug || "your-store"}</span>
      </p>
      <div className="mt-3">
        <Button variant="outline" loading={save.isPending} onClick={() => { clearError(); save.mutate(); }}>Save address</Button>
      </div>
    </Card>
  );
}

function PayoutCard({
  accounts,
  onChanged,
  onError,
  clearError,
}: {
  accounts: PayoutAccount[];
  onChanged: () => void;
  onError: (e: unknown) => void;
  clearError: () => void;
}) {
  const [bankName, setBankName] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [country, setCountry] = useState("NG");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const banks = useQuery({
    queryKey: ["flutterwave-banks", country],
    queryFn: () =>
      api.get<Array<{ name: string; code: string }>>(
        `/payments/flutterwave/banks?country=${encodeURIComponent(country)}`,
      ),
  });

  const connectStripe = useMutation({
    mutationFn: () => api.post<{ url: string }>("/payments/stripe/connect"),
    onSuccess: (res) => { window.location.href = res.url; },
    onError,
  });
  const connectFlutterwave = useMutation({
    mutationFn: () =>
      api.post("/payments/flutterwave/connect", {
        businessName: bankName.trim(),
        businessEmail: businessEmail.trim(),
        accountBank: bankCode.trim(),
        accountNumber: accountNumber.trim(),
        country,
      }),
    onSuccess: onChanged,
    onError,
  });

  const has = (p: string) => accounts.find((a) => a.processor === p);

  return (
    <Card title="Payouts">
      <p className="mb-4 text-body-sm text-text-muted">
        Connect where your sales settle. Buyers pay once; the product amount goes to you and USA
        Errands keeps only shipping + fulfillment.
      </p>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-md border border-line px-4 py-3">
          <div>
            <div className="text-body-sm font-medium text-ink">Card (Stripe)</div>
            <div className="text-[12px] text-text-muted">
              {has("STRIPE") ? `Status: ${has("STRIPE")!.status}` : "Not connected"}
            </div>
          </div>
          <Button variant="outline" loading={connectStripe.isPending} onClick={() => { clearError(); connectStripe.mutate(); }}>
            {has("STRIPE") ? "Manage" : "Connect Stripe"}
          </Button>
        </div>

        <div className="rounded-md border border-line px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-body-sm font-medium text-ink">Flutterwave (bank payout)</div>
            <div className="text-[12px] text-text-muted">
              {has("FLUTTERWAVE") ? `Status: ${has("FLUTTERWAVE")!.status}` : "Not connected"}
            </div>
          </div>
          <p className="mb-2 text-[12px] text-text-muted">
            Settle sales to your local bank in 30+ African countries. Pick your country, bank, and
            account number.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Business name" />
            <Input type="email" value={businessEmail} onChange={(e) => setBusinessEmail(e.target.value)} placeholder="Business email" />
            <select
              value={country}
              onChange={(e) => { setCountry(e.target.value); setBankCode(""); }}
              aria-label="Bank country"
              className="rounded-md border border-line-strong bg-white px-3 py-2 text-body-sm outline-none focus:border-ink"
            >
              {FLW_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              aria-label="Settlement bank"
              className="rounded-md border border-line-strong bg-white px-3 py-2 text-body-sm outline-none focus:border-ink"
            >
              <option value="">
                {banks.isLoading ? "Loading banks…" : "Select bank"}
              </option>
              {(banks.data ?? []).map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
            <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account number" />
          </div>
          <div className="mt-2">
            <Button variant="outline" loading={connectFlutterwave.isPending}
              onClick={() => { clearError(); connectFlutterwave.mutate(); }}>
              {has("FLUTTERWAVE") ? "Update Flutterwave" : "Connect Flutterwave"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function GoLiveCard({
  settings,
  onChanged,
  onError,
  clearError,
}: {
  settings: Settings;
  onChanged: () => void;
  onError: (e: unknown) => void;
  clearError: () => void;
}) {
  const enable = useMutation({ mutationFn: () => api.post("/storefront/enable"), onSuccess: onChanged, onError });
  const disable = useMutation({ mutationFn: () => api.post("/storefront/disable"), onSuccess: onChanged, onError });
  const feature = useMutation({
    mutationFn: (featured: boolean) => api.put("/storefront/featured", { featured }),
    onSuccess: onChanged,
    onError,
  });

  return (
    <Card title="Go live">
      {settings.storefrontEnabled ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="text-body-sm text-text-muted">Your store is live.</div>
            <Button variant="outline" loading={disable.isPending} onClick={() => { clearError(); disable.mutate(); }}>Take offline</Button>
          </div>
          <div className="flex items-center gap-3 rounded-md border border-line px-4 py-3">
            <input type="checkbox" aria-label="Feature on the marketplace" checked={settings.marketplaceFeatured}
              onChange={(e) => { clearError(); feature.mutate(e.target.checked); }} />
            <span>
              <span className="block text-body-sm font-medium text-ink">Feature on the marketplace</span>
              <span className="block text-[12px] text-text-muted">Free. Appears in the multi-vendor feed.</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-body-sm text-text-muted">
            Going live charges a <strong>one-time $50</strong> setup fee to your wallet. You&apos;ll need a
            store address and an active payout account first.
          </p>
          {!settings.storefrontFeePaidAt ? (
            <div className="rounded-sm border border-amber/40 bg-amber/10 px-3 py-2 text-[12px] text-amber">
              One-time $50 setup fee applies.
            </div>
          ) : (
            <div className="rounded-sm border border-success/40 bg-success/10 px-3 py-2 text-[12px] text-success">
              Setup fee already paid — re-enabling is free.
            </div>
          )}
          <div>
            <Button variant="primary" loading={enable.isPending} onClick={() => { clearError(); enable.mutate(); }}>Go live</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

interface DiscountCode {
  id: string;
  code: string;
  discount_type: string;
  value_bps: number | null;
  value_cents: number | null;
  active: boolean;
  redemption_count: number;
}

interface VendorDomain {
  id: string;
  host: string;
  status: string;
  txtName: string;
  txtValue: string;
}

function DomainsCard({ onError, clearError }: { onError: (e: unknown) => void; clearError: () => void }) {
  const qc = useQueryClient();
  const domains = useQuery({
    queryKey: ["storefront-domains"],
    queryFn: () => api.get<VendorDomain[]>("/storefront/domains"),
  });
  const [host, setHost] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["storefront-domains"] });

  const add = useMutation({
    mutationFn: () => api.post("/storefront/domains", { host: host.trim() }),
    onSuccess: () => { setHost(""); void invalidate(); },
    onError,
  });
  const verify = useMutation({
    mutationFn: (id: string) => api.post(`/storefront/domains/${id}/verify`),
    onSuccess: invalidate,
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/storefront/domains/${id}`),
    onSuccess: invalidate,
    onError,
  });

  return (
    <Card title="Custom domain">
      <p className="mb-3 text-[12px] text-text-muted">
        Point your own domain (e.g. shop.yourbrand.com) at your storefront. Add it, then create the
        DNS TXT record we show and verify.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="shop.yourbrand.com" className="w-64" />
        <Button variant="outline" loading={add.isPending} onClick={() => { clearError(); add.mutate(); }}>Add domain</Button>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {(domains.data ?? []).map((d) => (
          <div key={d.id} className="rounded-md border border-line p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-body-sm font-medium text-ink">{d.host}</span>
              <StatusPill tone={d.status === "VERIFIED" ? "success" : "warning"}>
                {d.status.toLowerCase()}
              </StatusPill>
            </div>
            {d.status !== "VERIFIED" ? (
              <div className="mt-2 rounded-sm bg-cream-soft px-3 py-2 text-[11px]">
                <div className="text-text-muted">Add this DNS TXT record, then verify:</div>
                <div className="mt-1 font-mono text-ink">{d.txtName}</div>
                <div className="font-mono text-ink">{d.txtValue}</div>
              </div>
            ) : null}
            <div className="mt-2 flex gap-3">
              {d.status !== "VERIFIED" ? (
                <button type="button" onClick={() => { clearError(); verify.mutate(d.id); }} disabled={verify.isPending}
                  className="text-[12px] font-medium text-amber hover:underline disabled:opacity-50">
                  {verify.isPending ? "Verifying…" : "Verify"}
                </button>
              ) : null}
              <button type="button" onClick={() => remove.mutate(d.id)} className="text-[12px] text-error hover:underline">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DiscountsCard({ onError, clearError }: { onError: (e: unknown) => void; clearError: () => void }) {
  const qc = useQueryClient();
  const codes = useQuery({ queryKey: ["vendor-discounts"], queryFn: () => api.get<DiscountCode[]>("/storefront/discounts") });
  const [code, setCode] = useState("");
  const [type, setType] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [value, setValue] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.post("/storefront/discounts", {
        code: code.trim().toUpperCase(),
        discountType: type,
        valueBps: type === "PERCENT" ? Math.round(Number(value) * 100) : undefined,
        valueCents: type === "FIXED" ? Math.round(Number(value) * 100) : undefined,
      }),
    onSuccess: () => { setCode(""); setValue(""); void qc.invalidateQueries({ queryKey: ["vendor-discounts"] }); },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/storefront/discounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-discounts"] }),
    onError,
  });

  return (
    <Card title="Discount codes">
      <p className="mb-3 text-[12px] text-text-muted">Applies to your products, on your store and the marketplace.</p>
      <div className="flex flex-wrap items-end gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SAVE10" className="w-32" />
        <select value={type} onChange={(e) => setType(e.target.value as "PERCENT" | "FIXED")}
          className="rounded-md border border-line-strong bg-white px-3 py-2 text-body-sm">
          <option value="PERCENT">% off</option>
          <option value="FIXED">$ off</option>
        </select>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === "PERCENT" ? "10" : "5.00"} className="w-24" />
        <Button variant="outline" loading={create.isPending} onClick={() => { clearError(); create.mutate(); }}>Add</Button>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {(codes.data ?? []).map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-body-sm">
            <span className="font-mono font-medium text-ink">{c.code}</span>
            <span className="text-text-muted">
              {c.discount_type === "PERCENT" ? `${(c.value_bps ?? 0) / 100}%` : `$${((c.value_cents ?? 0) / 100).toFixed(2)}`}
              {" · "}{c.redemption_count} used
            </span>
            <button type="button" onClick={() => remove.mutate(c.id)}
              className={`text-[12px] ${c.active ? "text-error hover:underline" : "text-text-subtle"}`}>
              {c.active ? "Deactivate" : "Inactive"}
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
