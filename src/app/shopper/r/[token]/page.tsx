"use client";

/**
 * Buyer thread page — `/shopper/r/[token]`.
 *
 * Magic-link auth: the token in the URL IS the auth. We never expose it
 * to API loggers (it's stripped by the redact list) and we don't put it
 * in localStorage — refresh just re-uses the URL.
 *
 * Polls every 12s for new messages while the tab is visible. We don't use
 * websockets here — chat is low-volume and HTTP polling is simpler and
 * survives the buyer being on flaky mobile data.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { AttachmentUploader } from "@/components/portal/attachment-uploader";
import { ReferenceDisplay } from "@/components/portal/reference-display";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { api } from "@/lib/api-client";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";
import { linkify } from "@/lib/linkify";
import {
  postShopperMessageSchema,
  type PostShopperMessageInput,
  type ShopperMessageSnapshot,
  type ShopperRequestStatus,
  type ShopperThreadResponse,
} from "@/lib/schemas/shopper";

// ---------------------------------------------------------------------------
// Status presentation
// ---------------------------------------------------------------------------

const STATUS_TONE: Record<ShopperRequestStatus, "neutral" | "info" | "success" | "warning" | "error"> = {
  AWAITING_INTAKE_PAYMENT: "warning",
  PAID: "info",
  PROCURING: "info",
  AWAITING_RECONCILIATION: "warning",
  READY_TO_SHIP: "info",
  SHIPPED: "info",
  DELIVERED: "success",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
};

const STATUS_LABEL: Record<ShopperRequestStatus, string> = {
  AWAITING_INTAKE_PAYMENT: "Payment needed",
  PAID: "Payment received",
  PROCURING: "Procuring items",
  AWAITING_RECONCILIATION: "Final invoice ready",
  READY_TO_SHIP: "Ready to ship",
  SHIPPED: "In transit",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

function dollars(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtTime(iso: string): string {
  // Avoid hydration mismatch — UTC time consistent across server + client.
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BuyerShopperThreadPage(): JSX.Element {
  const params = useParams<{ token: string }>();
  const search = useSearchParams();
  const qc = useQueryClient();

  const token = params.token;

  const threadQ = useQuery({
    queryKey: ["shopper", "thread", token],
    queryFn: () => api.get<ShopperThreadResponse>(`/shopper/r/${encodeURIComponent(token)}`),
    enabled: !!token,
    // Poll while the tab is visible; React Query pauses background polling
    // automatically when the tab loses focus.
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  // Mark admin messages as read whenever this page mounts or a new admin
  // message arrives. Fire-and-forget — failures are inconsequential.
  useEffect(() => {
    if (!threadQ.data) return;
    void api
      .post(`/shopper/r/${encodeURIComponent(token)}/read`)
      .catch(() => undefined);
  }, [threadQ.data, token]);

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-line bg-cream-soft/90 backdrop-blur">
        <nav className="mx-auto flex h-[72px] max-w-[64rem] items-center justify-between px-8">
          <Link href="/" className="text-[18px] font-bold tracking-[0.5px] text-ink">
            USA ERRANDS
          </Link>
          <span className="font-mono text-mono-label uppercase text-text-muted">Shopper</span>
        </nav>
      </header>

      <main className="mx-auto max-w-[64rem] px-8 py-12">
        {/* "How to come back" notice. The thread has no password — the only
            way to return is via the magic link in our emails (or a saved
            bookmark of this URL). Surface that explicitly so a buyer who
            closes the tab knows what to do. Dismissable per session so we
            don't pester returning visitors. */}
        <BookmarkNotice />

        {/* Banner messages from URL ("paid", "cancelled" hops back from Stripe) */}
        {search.get("paid") === "1" ? (
          <div
            role="status"
            className="mb-6 rounded-md border-l-4 border-success bg-success/10 px-5 py-4"
          >
            <div className="font-mono text-mono-label uppercase text-success">Payment received</div>
            <p className="mt-1 text-body-sm text-text">
              Thanks — we&apos;re starting procurement now and will message you here as we make progress.
            </p>
          </div>
        ) : null}
        {search.get("cancelled") === "1" ? (
          <div
            role="status"
            className="mb-6 rounded-md border-l-4 border-amber bg-amber/10 px-5 py-4"
          >
            <div className="font-mono text-mono-label uppercase text-amber">Payment cancelled</div>
            <p className="mt-1 text-body-sm text-text">
              No worries — your request is still here. Use the button below to retry payment when you&apos;re
              ready.
            </p>
          </div>
        ) : null}

        {threadQ.isLoading ? (
          <div className="font-mono text-mono-label uppercase text-text-muted">Loading thread…</div>
        ) : threadQ.error ? (
          <ThreadError error={threadQ.error} />
        ) : threadQ.data ? (
          <ThreadView
            token={token}
            data={threadQ.data}
            onRefresh={() => qc.invalidateQueries({ queryKey: ["shopper", "thread", token] })}
          />
        ) : null}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thread view
// ---------------------------------------------------------------------------

function ThreadView({
  token,
  data,
  onRefresh,
}: {
  token: string;
  data: ShopperThreadResponse;
  onRefresh: () => void;
}): JSX.Element {
  const r = data.request;
  const messages = data.messages;
  const [composer, setComposer] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  // No form-level field mapping needed for the chat composer — passing
  // undefined means the hook only populates the banner error state.
  const { bannerError, handle, clear } = useApiErrorHandler();

  const post = useMutation({
    mutationFn: (payload: PostShopperMessageInput) =>
      api.post<ShopperMessageSnapshot>(
        `/shopper/r/${encodeURIComponent(token)}/messages`,
        payload,
      ),
    onSuccess: () => {
      setComposer("");
      setAttachments([]);
      onRefresh();
    },
    onError: (err) => handle(err),
  });

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault();
    clear();
    const parsed = postShopperMessageSchema.safeParse({
      body: composer,
      attachmentUrls: attachments,
    });
    if (!parsed.success) return;
    post.mutate(parsed.data);
  }

  // Status messaging — what should the buyer DO next?
  const callout = useMemo(() => buyerCallout(r.status), [r.status]);

  return (
    <div className="flex flex-col gap-8">
      {/* Header: status + totals */}
      <section className="rounded-md border border-line bg-white p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-mono-eyebrow uppercase text-amber">[ Request ]</div>
            <h1 className="mt-1 text-h1 font-semibold tracking-[-0.4px] text-ink">
              {r.lines.length} {r.lines.length === 1 ? "item" : "items"} · {dollars(r.itemsSubtotalCents)} estimate
            </h1>
            <p className="mt-1 text-body-sm text-text-muted">
              Created {fmtTime(r.createdAt)} for {r.buyerEmail}
            </p>
          </div>
          <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill>
        </div>

        {/* Reference is the human-shareable id for this order — keep it
            prominent so the buyer can quote it to support, paste it into
            a follow-up order's "previous order" field, etc. */}
        <div className="mt-6 rounded-sm border border-line bg-cream-soft px-5 py-4">
          <ReferenceDisplay
            reference={r.reference}
            parentReference={r.parentReference}
          />
        </div>

        {callout ? (
          <div className="mt-6 rounded-sm border-l-4 border-amber bg-amber/10 px-5 py-4 text-body-sm">
            {callout}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 border-t border-line pt-6 md:grid-cols-4">
          <Stat label="Items estimate" value={dollars(r.itemsSubtotalCents)} />
          <Stat label="Service fee" value={dollars(r.commissionCents)} />
          <Stat
            label={
              r.effectiveTaxState
                ? `Est. ${r.effectiveTaxState} sales tax`
                : "Est. sales tax"
            }
            value={dollars(r.estimatedTaxCents)}
          />
          <Stat label="Paid up front" value={dollars(r.intakeTotalCents)} emphasis />
        </div>
        {r.followupAmountCents != null ? (
          <div className="mt-2 grid gap-4 md:grid-cols-4">
            <Stat label="Items actual" value={dollars(r.itemsActualSubtotalCents)} />
            <Stat label="Actual sales tax" value={dollars(r.actualTaxCents)} />
            <Stat label="Shipping" value={dollars(r.shippingCostCents)} />
            <Stat
              label={r.followupAmountCents > 0 ? "You owe" : r.followupAmountCents < 0 ? "We refund" : "Final"}
              value={dollars(Math.abs(r.followupAmountCents))}
              emphasis
              tone={r.followupAmountCents > 0 ? "amber" : r.followupAmountCents < 0 ? "success" : "neutral"}
            />
          </div>
        ) : null}
        {r.trackingNumber ? (
          <div className="mt-6 border-t border-line pt-4">
            <div className="font-mono text-mono-label uppercase text-text-muted">Tracking</div>
            <div className="mt-1 font-mono text-body text-ink">
              {r.carrier ? `${r.carrier} · ` : ""}
              {r.trackingNumber}
            </div>
          </div>
        ) : null}
      </section>

      {/* Lines */}
      <section className="rounded-md border border-line bg-white p-8">
        <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">Items</h2>
        <ul className="flex flex-col divide-y divide-line">
          {r.lines.map((line) => (
            <li key={line.id} className="grid gap-2 py-4 md:grid-cols-[1fr_auto_auto]">
              <div className="min-w-0">
                <a
                  href={line.productUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="block truncate text-body text-ink underline-offset-2 hover:underline"
                >
                  {line.productTitle ?? line.productUrl}
                </a>
                {line.productNotes ? (
                  <p className="mt-1 text-body-sm text-text-muted">{line.productNotes}</p>
                ) : null}
              </div>
              <div className="font-mono text-body text-text-muted">×{line.quantity}</div>
              <div className="text-right font-mono text-body text-ink tabular-nums">
                {dollars(
                  (line.actualUnitPriceCents ?? line.estimatedUnitPriceCents) * line.quantity,
                )}
                <div className="font-mono text-mono-label uppercase text-text-muted">
                  {line.actualUnitPriceCents != null ? "actual" : "estimate"}
                  {line.procurementStatus ? ` · ${line.procurementStatus}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Chat */}
      <section className="rounded-md border border-line bg-white p-8">
        <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">Conversation</h2>

        {bannerError ? (
          <div className="mb-4">
            <ErrorBanner
              error={bannerError}
              onAction={(handler) => {
                if (handler === "support") window.location.href = "mailto:support@usa-errands.com";
                else if (handler === "retry") clear();
              }}
            />
          </div>
        ) : null}

        {messages.length === 0 ? (
          <p className="text-body-sm text-text-muted">No messages yet — send the first one below.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {messages.map((m) => (
              <li
                key={m.id}
                className={
                  m.sender === "BUYER"
                    ? "ml-auto max-w-[80%] rounded-sm border border-line-strong bg-cream-soft px-4 py-3"
                    : "mr-auto max-w-[80%] rounded-sm border border-amber/40 bg-amber/5 px-4 py-3"
                }
              >
                <div className="font-mono text-mono-label uppercase text-text-muted">
                  {m.sender === "BUYER" ? "You" : "USA Errands"} · {fmtTime(m.createdAt)}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-body text-text">{linkify(m.body)}</p>
                {m.attachmentUrls.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {m.attachmentUrls.map((url) => (
                      <li key={url}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="font-mono text-mono-label uppercase text-amber underline-offset-2 hover:underline"
                        >
                          attachment
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        )}

        <form ref={formRef} onSubmit={onSubmit} className="mt-5 flex flex-col gap-3">
          <textarea
            rows={3}
            maxLength={10000}
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            placeholder="Reply to USA Errands…"
            className="w-full rounded-sm border border-line-strong bg-cream-soft px-4 py-3 text-body text-text outline-none placeholder:text-text-subtle focus:border-ink focus:ring-2 focus:ring-ink/10"
          />
          <AttachmentUploader
            value={attachments}
            onChange={setAttachments}
            presignEndpoint={`/shopper/r/${encodeURIComponent(token)}/uploads`}
            disabled={post.isPending}
          />
          <div className="flex items-center justify-between">
            <span className="font-mono text-mono-label uppercase text-text-muted">
              {composer.length}/10000
            </span>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={composer.trim().length === 0 || post.isPending}
              loading={post.isPending}
            >
              {post.isPending ? "Sending…" : "Send message"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: "amber" | "success" | "neutral";
}): JSX.Element {
  const toneClass =
    tone === "amber"
      ? "text-amber"
      : tone === "success"
        ? "text-success"
        : "text-ink";
  return (
    <div>
      <div className="font-mono text-mono-label uppercase text-text-muted">{label}</div>
      <div
        className={
          (emphasis ? "text-h2 font-semibold " : "text-body ") +
          "mt-1 font-mono tabular-nums " +
          toneClass
        }
      >
        {value}
      </div>
    </div>
  );
}

function buyerCallout(status: ShopperRequestStatus): string | null {
  switch (status) {
    case "AWAITING_INTAKE_PAYMENT":
      return "Payment needed — check your email for the secure Stripe link to start procurement.";
    case "PAID":
    case "PROCURING":
      return "We're sourcing your items. You'll see updates here as we go.";
    case "AWAITING_RECONCILIATION":
      return "Final invoice ready — check your email for the payment / refund details.";
    case "READY_TO_SHIP":
      return "Items secured. Your package is being prepared for dispatch.";
    case "SHIPPED":
      return "On the way. Tracking is shown above.";
    case "DELIVERED":
      return "Delivered. Thanks for using USA Errands.";
    case "CANCELLED":
      return "This request has been cancelled.";
    case "REFUNDED":
      return "This request has been cancelled and refunded.";
  }
}

/**
 * BookmarkNotice — explains the "no password, only email link" recovery
 * model so a buyer who closes the tab knows exactly how to return. Sticks
 * around per session; dismissing remembers the choice via sessionStorage
 * so a returning visitor (new tab) sees it again, but a noisy refresh
 * doesn't keep re-popping it.
 */
function BookmarkNotice(): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false);

  // Honour the user's "don't show again this session" choice. Read on
  // mount only — sessionStorage is a synchronous DOM API but using
  // useEffect avoids hydration mismatch warnings between server and client.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem("shopper.bookmarkDismissed") === "1") {
      setDismissed(true);
    }
  }, []);

  if (dismissed) return null;

  function dismiss(): void {
    setDismissed(true);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("shopper.bookmarkDismissed", "1");
    }
  }

  return (
    <div
      role="note"
      className="mb-6 flex items-start gap-4 rounded-md border border-amber/40 bg-amber/10 px-5 py-4"
    >
      <div className="flex-1">
        <div className="font-mono text-mono-label uppercase text-amber">
          Save this page
        </div>
        <p className="mt-1 text-body-sm text-text">
          There&apos;s no password — the only way back to this conversation is the
          link in your email from USA Errands, or a bookmark of this page.
          If you lose both, search your inbox (including spam) for{" "}
          <strong>USA Errands</strong> — every email we&apos;ve sent you contains
          a working link.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="font-mono text-mono-label uppercase text-amber hover:text-amber-hi"
        aria-label="Dismiss notice"
      >
        Got it
      </button>
    </div>
  );
}

function ThreadError({ error }: { error: unknown }): JSX.Element {
  const normalized = normalizeError(error);
  const isAuth = normalized.status === 401 || normalized.code?.startsWith("shopper_token_");
  return (
    <div role="alert" className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4">
      <div className="font-mono text-mono-label uppercase text-error">
        {isAuth ? "Link not valid" : normalized.entry.title}
      </div>
      <p className="mt-1 text-body-sm text-text">
        {isAuth
          ? "This access link is invalid, expired, or revoked. Check the latest email from USA Errands or contact support."
          : normalized.entry.body}
      </p>
      {normalized.correlationId ? (
        <div className="mt-2 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
          Reference: {normalized.correlationId.slice(0, 16)}
        </div>
      ) : null}
    </div>
  );
}
