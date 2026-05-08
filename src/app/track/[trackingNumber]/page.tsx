"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { StatusPill } from "@/components/ui/status-pill";
import { api } from "@/lib/api-client";
import { normalizeError } from "@/lib/errors";

interface TrackingPayload {
  trackingNumber: string;
  carrier: string | null;
  carrierService: string | null;
  status:
    | "PROCESSING"
    | "LABEL_PRINTED"
    | "PICKED_UP"
    | "IN_TRANSIT"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED"
    | "EXCEPTION"
    | "RETURNED";
  shippedAt: string | null;
  estDeliveryDate: string | null;
  deliveredAt: string | null;
  recipient: { firstName: string; city: string; state: string };
  events: Array<{
    type: string;
    description: string;
    occurredAt: string;
    location?: { city?: string; state?: string };
  }>;
}

const STATUS_TONE: Record<TrackingPayload["status"], "neutral" | "info" | "success" | "warning" | "error"> = {
  PROCESSING: "neutral",
  LABEL_PRINTED: "info",
  PICKED_UP: "info",
  IN_TRANSIT: "info",
  OUT_FOR_DELIVERY: "info",
  DELIVERED: "success",
  EXCEPTION: "error",
  RETURNED: "warning",
};

const STATUS_LABEL: Record<TrackingPayload["status"], string> = {
  PROCESSING: "Processing at warehouse",
  LABEL_PRINTED: "Label printed",
  PICKED_UP: "Picked up by carrier",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  EXCEPTION: "Delivery exception",
  RETURNED: "Returned to sender",
};

export default function PublicTrackingPage() {
  const params = useParams<{ trackingNumber: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["track", params.trackingNumber],
    queryFn: () => api.get<TrackingPayload>(`/track/${encodeURIComponent(params.trackingNumber)}`),
    enabled: !!params.trackingNumber,
    // Don't auto-retry on 404 (unknown tracking number).
    retry: false,
    staleTime: 60 * 1000,
  });

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-line bg-cream-soft/90 backdrop-blur">
        <nav className="mx-auto flex h-[72px] max-w-[64rem] items-center justify-between px-8">
          <a href="/" className="text-[18px] font-bold tracking-[0.5px] text-ink">
            USA ERRANDS
          </a>
          <span className="font-mono text-mono-label uppercase text-text-muted">Tracking</span>
        </nav>
      </header>

      <main className="mx-auto max-w-[44rem] px-8 py-12">
        <div className="font-mono text-mono-eyebrow uppercase text-amber">[ Tracking ]</div>
        <h1 className="mt-2 text-h1 font-semibold tracking-[-0.4px] text-ink">
          {params.trackingNumber}
        </h1>

        {isLoading ? (
          <div className="mt-8 font-mono text-mono-label uppercase text-text-muted">Looking up…</div>
        ) : error ? (
          (() => {
            const normalized = normalizeError(error);
            // Tracking lookups should be resilient to all the usual errors
            // — for an unknown tracking number we already get a 404, which
            // becomes the catalog's "not_found" entry. Network failures,
            // however, surface a different message and a retry hint, so the
            // user can distinguish "wrong number" from "we're offline."
            const isNotFound = normalized.status === 404;
            return (
              <div
                role="alert"
                className="mt-8 rounded-md border-l-4 border-error bg-error/10 px-5 py-4"
              >
                <div className="font-mono text-mono-label uppercase text-error">
                  {isNotFound ? "We couldn't find this tracking number" : normalized.entry.title}
                </div>
                <p className="mt-1 text-body-sm text-text">
                  {isNotFound
                    ? "Double-check the number and try again, or reach out to the sender."
                    : normalized.entry.body}
                </p>
                {normalized.correlationId ? (
                  <div className="mt-2 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
                    Reference: {normalized.correlationId.slice(0, 16)}
                  </div>
                ) : null}
              </div>
            );
          })()
        ) : data ? (
          <>
            <section className="mt-8 rounded-md border border-line bg-white p-8">
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <div>
                  <div className="font-mono text-mono-label uppercase text-text-muted">Status</div>
                  <div className="mt-2">
                    <StatusPill tone={STATUS_TONE[data.status]}>{STATUS_LABEL[data.status]}</StatusPill>
                  </div>
                </div>
                {data.carrier ? (
                  <div className="text-right">
                    <div className="font-mono text-mono-label uppercase text-text-muted">Carrier</div>
                    <div className="mt-2 font-mono text-body text-text">
                      {data.carrier}
                      {data.carrierService ? ` · ${data.carrierService}` : ""}
                    </div>
                  </div>
                ) : null}
              </div>

              <hr className="my-6 border-line" />

              <dl className="grid grid-cols-2 gap-y-3 font-mono text-body-sm">
                <dt className="text-text-muted">Recipient</dt>
                <dd className="text-right text-text">{data.recipient.firstName}</dd>
                <dt className="text-text-muted">Destination</dt>
                <dd className="text-right text-text">
                  {data.recipient.city}, {data.recipient.state}
                </dd>
                {data.shippedAt ? (
                  <>
                    <dt className="text-text-muted">Shipped</dt>
                    <dd className="text-right text-text">{new Date(data.shippedAt).toLocaleString()}</dd>
                  </>
                ) : null}
                {data.deliveredAt ? (
                  <>
                    <dt className="text-text-muted">Delivered</dt>
                    <dd className="text-right text-success">{new Date(data.deliveredAt).toLocaleString()}</dd>
                  </>
                ) : null}
              </dl>
            </section>

            {data.events.length > 0 ? (
              <section className="mt-8 rounded-md border border-line bg-white p-8">
                <h2 className="font-mono text-mono-label uppercase text-text-muted">Carrier timeline</h2>
                <ol className="mt-4 space-y-4 font-mono text-body-sm">
                  {data.events
                    .slice()
                    .reverse()
                    .map((e, i) => (
                      <li key={`${e.type}-${e.occurredAt}-${i}`} className="border-l-2 border-line pl-4">
                        <div className="text-text-muted">
                          {new Date(e.occurredAt).toLocaleString()}
                          {e.location?.city ? ` · ${e.location.city}${e.location.state ? `, ${e.location.state}` : ""}` : ""}
                        </div>
                        <div className="mt-1 text-text">{e.description}</div>
                      </li>
                    ))}
                </ol>
              </section>
            ) : (
              <p className="mt-8 font-mono text-mono-label uppercase text-text-subtle">
                No carrier events yet. Check back once the package is in transit.
              </p>
            )}

            <p className="mt-12 font-mono text-mono-label uppercase text-text-subtle">
              Powered by USA Errands ·{" "}
              <a href="/" className="text-text-muted hover:text-ink">
                Sell internationally → fulfill stateside
              </a>
            </p>
          </>
        ) : null}
      </main>
    </div>
  );
}
