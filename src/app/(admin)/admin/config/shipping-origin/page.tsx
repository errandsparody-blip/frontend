"use client";

import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";

interface ShippingOrigin {
  address: {
    name: string;
    street1: string;
    street2: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone: string;
    email: string;
  };
  shippoConfigured: boolean;
  note: string;
  sources: Record<string, string>;
}

function Field({
  label,
  value,
  source,
  highlight = false,
}: {
  label: string;
  value: string;
  source?: string;
  highlight?: boolean;
}): JSX.Element {
  return (
    <div
      className={
        highlight
          ? "rounded-md border-l-4 border-amber bg-amber/10 px-4 py-3"
          : "rounded-md border border-line bg-white px-4 py-3"
      }
    >
      <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
        {label}
      </div>
      <div className="mt-1 break-words text-body text-ink">
        {value ? value : <span className="text-text-subtle">—</span>}
      </div>
      {source ? (
        <div className="mt-1 font-mono text-[11px] text-text-subtle">{source}</div>
      ) : null}
    </div>
  );
}

export default function ShippingOriginPage(): JSX.Element {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "shipping", "origin"],
    queryFn: () => api.get<ShippingOrigin>("/admin/shipping/origin"),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Configuration"
        title="Shipping origin (sender address)"
        description="The exact sender/return address — including phone — sent to Shippo on every label. This is what prints on the label, not the saved address in the Shippo dashboard."
      />

      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : isError || !data ? (
        <div
          role="alert"
          className="rounded-md border-l-4 border-error bg-error/10 px-4 py-3"
        >
          <div className="font-mono text-mono-label uppercase text-error">
            Couldn&apos;t load the shipping origin
          </div>
          <p className="mt-1 text-body-sm text-text">
            Try again in a moment, or check the API is reachable.
          </p>
        </div>
      ) : (
        <>
          {/* Live status */}
          <section className="rounded-md border border-line bg-cream-soft p-4">
            <div className="mb-2 font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
              Status
            </div>
            <div
              className={
                data.shippoConfigured
                  ? "rounded-md border-l-4 border-success bg-success/10 px-4 py-3"
                  : "rounded-md border-l-4 border-amber bg-amber/10 px-4 py-3"
              }
            >
              <div
                className={
                  data.shippoConfigured
                    ? "font-mono text-mono-label uppercase text-success"
                    : "font-mono text-mono-label uppercase text-amber"
                }
              >
                {data.shippoConfigured ? "Live — Shippo configured" : "Stub mode"}
              </div>
              <p className="mt-1 text-body-sm text-text">
                {data.shippoConfigured
                  ? "Real labels are produced and carry the address below."
                  : "No Shippo API key is set, so no real labels are produced. The address below is still what would be sent."}
              </p>
            </div>
          </section>

          {/* Phone — the field this page exists to verify */}
          <section className="rounded-md border border-line bg-cream-soft p-4">
            <div className="mb-2 font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
              Sender / return phone
            </div>
            <Field
              label="Phone on every label"
              value={data.address.phone}
              source={`Environment variable: ${data.sources.phone}`}
              highlight
            />
            <p className="mt-3 text-body-sm text-text-muted">{data.note}</p>
          </section>

          {/* Full address */}
          <section className="rounded-md border border-line bg-cream-soft p-4">
            <div className="mb-2 font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
              Full ship-from address
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Name" value={data.address.name} source={data.sources.name} />
              <Field label="Email" value={data.address.email} source={data.sources.email} />
              <Field label="Street 1" value={data.address.street1} source={data.sources.street1} />
              <Field label="Street 2" value={data.address.street2} source={data.sources.street2} />
              <Field label="City" value={data.address.city} source={data.sources.city} />
              <Field label="State" value={data.address.state} source={data.sources.state} />
              <Field label="ZIP" value={data.address.zip} source={data.sources.zip} />
              <Field label="Country" value={data.address.country} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
