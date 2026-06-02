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
  type ShopperRequestSnapshot,
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
  AWAITING_DELIVERY: "info",
  AWAITING_RECONCILIATION: "warning",
  READY_TO_SHIP: "info",
  READY_FOR_PICKUP: "info",
  SHIPPED: "info",
  DELIVERED: "success",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
  // Migration 0023 — wire-track statuses. Warning while we need an
  // action from the buyer; info once the ball is in our court.
  AWAITING_ID_VERIFICATION: "warning",
  ID_UNDER_REVIEW: "info",
  QUOTE_SENT: "warning",
  AWAITING_WIRE_PAYMENT: "warning",
  WIRE_PROOF_UPLOADED: "info",
  WIRE_UNDER_REVIEW: "info",
  WIRE_CONFIRMED: "success",
  PURCHASE_APPROVED: "success",
};

const STATUS_LABEL: Record<ShopperRequestStatus, string> = {
  AWAITING_INTAKE_PAYMENT: "Payment needed",
  PAID: "Payment received",
  PROCURING: "Procuring items",
  // Phase 2 — items bought, waiting to arrive at our warehouse before
  // shipping onward to the buyer.
  AWAITING_DELIVERY: "Items purchased — awaiting delivery to our warehouse",
  AWAITING_RECONCILIATION: "Final invoice ready",
  READY_TO_SHIP: "Ready to ship",
  READY_FOR_PICKUP: "Ready for pickup",
  SHIPPED: "In transit",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  // Migration 0023 — wire-track labels. Plain-English so the buyer can
  // map the badge to a screen-level instruction.
  AWAITING_ID_VERIFICATION: "Verify your identity",
  ID_UNDER_REVIEW: "ID under review",
  QUOTE_SENT: "Awaiting your wire transfer",
  AWAITING_WIRE_PAYMENT: "Awaiting your wire transfer",
  WIRE_PROOF_UPLOADED: "Payment under review",
  WIRE_UNDER_REVIEW: "Payment under review",
  WIRE_CONFIRMED: "Payment confirmed",
  PURCHASE_APPROVED: "Sourcing your items",
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

      {/* May 2026 — All-manual payment policy with threshold-gated ID
          verification. Above $10k (or whatever the admin set), the
          buyer must clear ID review BEFORE payment instructions are
          released. The IdVerificationCard short-circuits to null when
          idVerificationStatus is "NONE" (below-threshold requests) so
          we can render it unconditionally here without leaking the
          card to buyers who don't need to upload anything. */}
      {r.paymentMethod === "WIRE" ? (
        <>
          <IdVerificationCard request={r} token={token} onRefresh={onRefresh} />
          <WirePaymentCard request={r} token={token} onRefresh={onRefresh} />
        </>
      ) : null}

      {/* Migration 0027 follow-up — BUYER_FREIGHT "Ship From" panel.
          When admin sets the shipping method to BUYER_FREIGHT, the
          buyer needs the warehouse address to generate their own
          prepaid label on their carrier of choice (UPS, FedEx, DHL,
          their forwarder). Sourced from API env so a config change
          updates this for every active request automatically. */}
      <BuyerFreightShipFromCard request={r} />

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
                if (handler === "support") window.location.href = "mailto:hello@myusaerrands.com";
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
    case "AWAITING_DELIVERY":
      return "Items purchased. Waiting for them to arrive at our warehouse, then we'll ship to you.";
    case "AWAITING_RECONCILIATION":
      return "Final invoice ready — check your email for the payment / refund details.";
    case "READY_TO_SHIP":
      return "Items secured. Your package is being prepared for dispatch.";
    case "READY_FOR_PICKUP":
      return "Ready for pickup at the warehouse. Bring the pickup name shown on your invoice when you collect.";
    case "SHIPPED":
      return "On the way. Tracking is shown above.";
    case "DELIVERED":
      return "Delivered. Thanks for using USA Errands.";
    case "CANCELLED":
      return "This request has been cancelled.";
    case "REFUNDED":
      return "This request has been cancelled and refunded.";
    // May 2026 — manual-payment callouts. ID verification is required
    // only for above-threshold requests; for below-threshold requests
    // these two cases are unreachable because the buyer's
    // idVerificationStatus is "NONE" and the initial status skips
    // directly to AWAITING_WIRE_PAYMENT.
    case "AWAITING_ID_VERIFICATION":
      return "Because this order is above our verification threshold, upload a photo of your government-issued ID and a selfie holding it. We'll review usually within one business day.";
    case "ID_UNDER_REVIEW":
      return "We're reviewing your ID — usually within one business day. We'll message you here as soon as we've finished.";
    case "QUOTE_SENT":
    case "AWAITING_WIRE_PAYMENT":
      return "Choose a payment method below, send your payment, then upload a confirmation here so we can match it.";
    case "WIRE_PROOF_UPLOADED":
    case "WIRE_UNDER_REVIEW":
      return "We're confirming your payment landed. We'll start sourcing as soon as it clears.";
    case "WIRE_CONFIRMED":
    case "PURCHASE_APPROVED":
      return "Payment confirmed. We're sourcing your items now.";
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

// ---------------------------------------------------------------------------
// Migration 0023 — wire-track buyer cards
//
// These two cards drive the buyer-side state machine for high-value
// orders. They render at the top of the thread page (above lines/chat)
// when the request is on the WIRE rail, and each one is gated by the
// status + idVerificationStatus combination so a buyer who's already
// finished one stage doesn't see stale prompts.
// ---------------------------------------------------------------------------

function IdVerificationCard({
  request,
  token,
  onRefresh,
}: {
  request: ShopperRequestSnapshot;
  token: string;
  onRefresh: () => void;
}): JSX.Element | null {
  // Hooks must run unconditionally — we call them all up front so the
  // hook order stays stable across renders even when the early-return
  // path below decides not to display anything. ESLint enforces this
  // ordering rule on a per-component basis.
  const [docUrls, setDocUrls] = useState<string[]>([]);
  const [selfieUrls, setSelfieUrls] = useState<string[]>([]);
  const { bannerError, handle, clear } = useApiErrorHandler();

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ status: string; idVerificationStatus: string }>(
        `/shopper/r/${encodeURIComponent(token)}/id-submit`,
        {
          // Backend expects exactly one of each; we send the latest
          // uploaded URL from each list. The uploader keeps the most
          // recent upload at the end of the array.
          idDocumentUrl: docUrls[docUrls.length - 1],
          idSelfieUrl: selfieUrls[selfieUrls.length - 1],
        },
      ),
    onSuccess: () => {
      setDocUrls([]);
      setSelfieUrls([]);
      onRefresh();
    },
    onError: (err) => handle(err),
  });

  // May 2026 — Threshold-gated ID. When the request was created below
  // the wire threshold, idVerificationStatus is "NONE" and the buyer
  // doesn't need to upload anything. Skip rendering entirely so the
  // page goes straight from "request summary" to the payment picker.
  if (request.idVerificationStatus === "NONE") return null;

  // States where the buyer either still needs to upload, or just did.
  // Once their ID is APPROVED we render a compact "verified" summary
  // instead of taking up screen space with the uploader form.
  const showFullUploader =
    request.idVerificationStatus === "PENDING_UPLOAD" ||
    request.idVerificationStatus === "REJECTED" ||
    request.idVerificationStatus === "UNDER_REVIEW";

  // After approval — compact summary so the buyer sees their progress
  // through the funnel but the uploader doesn't occupy precious space.
  if (request.idVerificationStatus === "APPROVED") {
    return (
      <section className="rounded-md border-l-4 border-success bg-success/10 p-6">
        <div className="font-mono text-mono-label uppercase text-success">
          ID verified
        </div>
        <p className="mt-1 text-body-sm text-text">
          Your identity has been verified. The wire-transfer instructions are below.
        </p>
      </section>
    );
  }

  if (!showFullUploader) return null;

  const canSubmit = docUrls.length > 0 && selfieUrls.length > 0 && !submit.isPending;

  // Live threshold — admin can change this on the shopper config page;
  // the server echoes it in the thread snapshot so this copy is always
  // accurate. Whole-dollar formatting because the threshold is always
  // a round number in practice; the format string matches the intake
  // page's `thresholdLabel` so the two surfaces stay consistent.
  const thresholdLabel = `$${Math.round(
    request.idVerificationThresholdCents / 100,
  ).toLocaleString("en-US")}`;
  return (
    <section className="rounded-md border border-line bg-white p-8">
      <div className="mb-4">
        <h2 className="font-mono text-mono-label uppercase text-text-muted">
          Step 1 — Verify your identity
        </h2>
        <p className="mt-2 text-body-sm text-text-muted">
          Orders over {thresholdLabel} require ID verification. Upload a clear
          photo of your government-issued ID (passport or driver&apos;s licence)
          and a selfie of yourself holding it. We review within one business
          day.
        </p>
      </div>

      {request.idVerificationStatus === "REJECTED" && request.idRejectionReason ? (
        <div
          role="alert"
          className="mb-4 rounded-sm border-l-4 border-error bg-error/10 px-4 py-3 text-body-sm"
        >
          <strong className="font-mono text-mono-label uppercase tracking-[1.2px] text-error">
            Previous upload couldn&apos;t be verified
          </strong>
          <p className="mt-1">{request.idRejectionReason}</p>
        </div>
      ) : null}

      {request.idVerificationStatus === "UNDER_REVIEW" ? (
        <div className="mb-4 rounded-sm border-l-4 border-info bg-info/10 px-4 py-3 text-body-sm">
          We&apos;ve received your documents and they&apos;re being reviewed. You
          don&apos;t need to do anything else right now — we&apos;ll message you
          here when verification is complete.
        </div>
      ) : (
        <>
          {bannerError ? (
            <div className="mb-4">
              <ErrorBanner
                error={bannerError}
                onAction={(handler) => {
                  if (handler === "support") window.location.href = "mailto:hello@myusaerrands.com";
                  else if (handler === "retry") clear();
                }}
              />
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <div className="mb-2 font-mono text-mono-label uppercase text-text-muted">
                Government ID
              </div>
              <AttachmentUploader
                value={docUrls}
                onChange={setDocUrls}
                presignEndpoint={`/shopper/r/${encodeURIComponent(token)}/id-uploads`}
                disabled={submit.isPending}
              />
            </div>
            <div>
              <div className="mb-2 font-mono text-mono-label uppercase text-text-muted">
                Selfie holding ID
              </div>
              <AttachmentUploader
                value={selfieUrls}
                onChange={setSelfieUrls}
                presignEndpoint={`/shopper/r/${encodeURIComponent(token)}/id-uploads`}
                disabled={submit.isPending}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              variant="amber"
              size="md"
              disabled={!canSubmit}
              loading={submit.isPending}
              onClick={() => {
                clear();
                submit.mutate();
              }}
            >
              {submit.isPending ? "Submitting…" : "Submit for review"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function WirePaymentCard({
  request,
  token,
  onRefresh,
}: {
  request: ShopperRequestSnapshot;
  token: string;
  onRefresh: () => void;
}): JSX.Element | null {
  const [proofUrls, setProofUrls] = useState<string[]>([]);
  const [selectedMethodCode, setSelectedMethodCode] = useState<string | null>(null);
  // June 2026 — credentials moved to email. The buyer picks a method
  // and clicks "Continue to payment"; the server emails the account
  // details. This component tracks the most-recent successful send so
  // the UI can switch from picker → confirmation card.
  //
  // We track BOTH the code (for stable matching against the live
  // method list — labels can drift if an admin renames a method
  // mid-session) AND the label (for display in the confirmation
  // copy). Matching by code means the confirmation card stays
  // pinned even if the server's label changes between sends.
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [sentLabel, setSentLabel] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { bannerError, handle, clear } = useApiErrorHandler();

  // Submit the wire-proof upload. Unchanged from the prior version
  // — this is the buyer's "I paid, here's the screenshot" step that
  // runs after they've already paid via whichever method they chose.
  const submit = useMutation({
    mutationFn: () =>
      api.post<{ status: string }>(
        `/shopper/r/${encodeURIComponent(token)}/wire-proof-submit`,
        { wireProofUrl: proofUrls[proofUrls.length - 1] },
      ),
    onSuccess: () => {
      setProofUrls([]);
      onRefresh();
    },
    onError: (err) => handle(err),
  });

  // Send the chosen method's details to the buyer's email. The server
  // re-validates state + method on every call (defence in depth) so
  // the worst a tampered client can do is request a fresh email — it
  // cannot lift credentials from the response.
  const sendInstructions = useMutation({
    mutationFn: (methodCode: string) =>
      api.post<{ sentTo: string; methodLabel: string; methodCode: string }>(
        `/shopper/r/${encodeURIComponent(token)}/payment/send-instructions`,
        { methodCode },
      ),
    onSuccess: (res) => {
      setSentCode(res.methodCode);
      setSentLabel(res.methodLabel);
      setSentTo(res.sentTo);
    },
    onError: (err) => handle(err),
  });

  // The server now ships only `{ code, label }` for each method — the
  // actual credentials are emailed after the buyer commits. No
  // legacy-fallback synthesis here either: if the server returns an
  // empty list we surface the "contact us" copy rather than render a
  // half-broken picker. Stable reference for the effect below.
  const methods = useMemo<Array<{ code: string; label: string }>>(
    () => request.paymentMethods,
    [request.paymentMethods],
  );

  // Default selection: pick the first method as soon as the list is
  // populated. Effect runs after every render so a server-side change
  // from 0 → N methods seeds the picker on the next poll.
  //
  // Also: if an admin deactivates the currently-selected method
  // between polls, the picker would otherwise have a stale code and
  // render nothing as active. Reset to the first available method
  // and clear the confirmation card since the sent code probably
  // refers to a method the buyer can no longer pick. Kept above the
  // early-return so the hook order stays stable across renders.
  useEffect(() => {
    if (methods.length === 0) return;
    const codes = methods.map((m) => m.code);
    if (selectedMethodCode === null || !codes.includes(selectedMethodCode)) {
      const first = methods[0];
      if (first) setSelectedMethodCode(first.code);
      // Stale selection → stale confirmation too. Drop it so the
      // buyer doesn't see "Check your email for Cash App" while the
      // picker forces them onto Zelle.
      if (sentCode !== null && !codes.includes(sentCode)) {
        setSentCode(null);
        setSentLabel(null);
        setSentTo(null);
      }
    }
  }, [methods, selectedMethodCode, sentCode]);

  // May 2026 — Manual-payment policy. Card renders any time the request
  // is in a payment-pending or under-review state. Anything past
  // WIRE_CONFIRMED is post-payment and renders the existing line/chat
  // sections instead.
  const showActiveForm =
    request.status === "QUOTE_SENT" ||
    request.status === "AWAITING_WIRE_PAYMENT";
  const showReviewState =
    request.status === "WIRE_PROOF_UPLOADED" ||
    request.status === "WIRE_UNDER_REVIEW";
  if (!showActiveForm && !showReviewState) return null;

  const selectedMethod =
    methods.find((m) => m.code === selectedMethodCode) ?? methods[0] ?? null;
  const canSubmit = proofUrls.length > 0 && !submit.isPending;
  const canSendInstructions =
    !!selectedMethod && !sendInstructions.isPending && methods.length > 0;
  // If the buyer already sent themselves the email for a method but
  // then picked a different one, drop the confirmation state so the
  // page doesn't claim Cash App when they just picked Zelle. Match
  // by code, not label — labels can change if an admin renames a
  // method between polls.
  const confirmationVisible =
    sentCode != null &&
    selectedMethod != null &&
    selectedMethod.code === sentCode;

  return (
    <section className="rounded-md border border-line bg-white p-8">
      <div className="mb-4">
        <h2 className="font-mono text-mono-label uppercase text-text-muted">
          Pay {`$${(request.intakeTotalCents / 100).toFixed(2)}`}
        </h2>
        <p className="mt-2 text-body-sm text-text-muted">
          Choose a payment method below. When you click <strong>Continue to
          payment</strong>, we&apos;ll email you the account details. Once
          you&apos;ve paid, upload your confirmation so we can match it.
        </p>
      </div>

      {methods.length === 0 ? (
        <div className="mb-4 rounded-sm border-l-4 border-error bg-error/10 px-4 py-3 text-body-sm">
          No payment methods are available right now — please email
          <a className="ml-1 underline" href="mailto:hello@myusaerrands.com">
            hello@myusaerrands.com
          </a>{" "}
          and we&apos;ll arrange payment with you directly.
        </div>
      ) : (
        <>
          {/* Method picker. Renders as a row of pill buttons when more
              than one is active; collapses to a single header label
              when only one is enabled. Picking a different method
              clears any prior "instructions sent" confirmation so
              the UI doesn't claim the wrong method. */}
          {methods.length > 1 ? (
            <div className="mb-5">
              <div className="mb-2 font-mono text-mono-label uppercase text-text-muted">
                Choose how to pay
              </div>
              <div role="tablist" aria-label="Payment methods" className="flex flex-wrap gap-2">
                {methods.map((m) => (
                  <button
                    key={m.code}
                    type="button"
                    role="tab"
                    aria-selected={selectedMethodCode === m.code}
                    onClick={() => {
                      if (m.code !== selectedMethodCode) {
                        // Switching method invalidates the prior
                        // confirmation. The buyer must click Continue
                        // again to receive the new method's details.
                        setSentCode(null);
                        setSentLabel(null);
                        setSentTo(null);
                        clear();
                      }
                      setSelectedMethodCode(m.code);
                    }}
                    className={
                      selectedMethodCode === m.code
                        ? "rounded-sm bg-ink px-4 py-2 font-mono text-mono-label uppercase tracking-[1.2px] text-cream-soft"
                        : "rounded-sm border border-line-strong bg-white px-4 py-2 font-mono text-mono-label uppercase tracking-[1.2px] text-text hover:border-ink"
                    }
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Amount + reference summary. Always visible so the buyer
              sees what they owe and what reference to put in the memo
              field even before they click Continue. */}
          {selectedMethod ? (
            <div className="mb-4 rounded-sm border border-line bg-cream-soft p-5">
              <div className="mb-3 font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
                {selectedMethod.label}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <BankRow
                  label="Amount due"
                  value={`$${(request.intakeTotalCents / 100).toFixed(2)}`}
                  mono
                />
                <BankRow
                  label="Reference"
                  value={request.reference}
                  mono
                />
              </div>
              <div className="mt-4 rounded-sm border border-amber/40 bg-amber/10 px-3 py-2 font-mono text-mono-label uppercase tracking-[1.2px] text-amber">
                Include reference {request.reference} in your payment note
              </div>
            </div>
          ) : null}

          {/* Continue to payment / resend / confirmation block.
              State transitions:
                - no email sent yet     → primary "Continue to payment"
                - email already sent    → success card + "Resend" link
                - method changed since  → primary button re-appears
                                          (confirmation hidden by the
                                          equality check above)
              The proof uploader below is independent — a buyer can
              upload proof whether or not they re-emailed themselves. */}
          {showActiveForm ? (
            <div className="mb-6">
              {confirmationVisible ? (
                <div
                  role="status"
                  className="flex flex-wrap items-center justify-between gap-3 rounded-sm border-l-4 border-success bg-success/10 px-4 py-3 text-body-sm"
                >
                  <div>
                    <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-success">
                      Check your email
                    </div>
                    <p className="mt-1 text-text">
                      We&apos;ve sent the {sentLabel} instructions to{" "}
                      <strong className="font-mono">{sentTo}</strong>. Once
                      you&apos;ve paid, upload the confirmation below.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedMethod) return;
                      clear();
                      sendInstructions.mutate(selectedMethod.code);
                    }}
                    disabled={sendInstructions.isPending}
                    className="rounded-sm border border-line-strong bg-white px-3 py-1.5 font-mono text-mono-label uppercase tracking-[1.2px] text-ink hover:bg-cream-soft disabled:opacity-60"
                  >
                    {sendInstructions.isPending ? "Resending…" : "Resend email"}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="max-w-md text-body-sm text-text-muted">
                    We&apos;ll email the account details for{" "}
                    <strong className="text-ink">
                      {selectedMethod?.label ?? "your chosen method"}
                    </strong>{" "}
                    to <strong className="font-mono">{request.buyerEmail}</strong>.
                  </p>
                  <Button
                    type="button"
                    variant="amber"
                    size="md"
                    disabled={!canSendInstructions}
                    loading={sendInstructions.isPending}
                    onClick={() => {
                      if (!selectedMethod) return;
                      clear();
                      sendInstructions.mutate(selectedMethod.code);
                    }}
                  >
                    {sendInstructions.isPending
                      ? "Sending…"
                      : "Continue to payment"}
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </>
      )}

      {showReviewState ? (
        <div className="rounded-sm border-l-4 border-info bg-info/10 px-4 py-3 text-body-sm">
          We&apos;ve received your payment proof and our team is matching it
          against the bank statement. We&apos;ll start sourcing as soon as
          the payment clears. No further action needed.
        </div>
      ) : methods.length > 0 ? (
        <>
          {bannerError ? (
            <div className="mb-4">
              <ErrorBanner
                error={bannerError}
                onAction={(handler) => {
                  if (handler === "support") window.location.href = "mailto:hello@myusaerrands.com";
                  else if (handler === "retry") clear();
                }}
              />
            </div>
          ) : null}

          <div className="mb-2 font-mono text-mono-label uppercase text-text-muted">
            Upload your payment confirmation
          </div>
          <AttachmentUploader
            value={proofUrls}
            onChange={setProofUrls}
            presignEndpoint={`/shopper/r/${encodeURIComponent(token)}/wire-proof-uploads`}
            disabled={submit.isPending}
          />
          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              variant="amber"
              size="md"
              disabled={!canSubmit}
              loading={submit.isPending}
              onClick={() => {
                clear();
                submit.mutate();
              }}
            >
              {submit.isPending ? "Submitting…" : "Submit payment proof"}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function BankRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div>
      <div className="font-mono text-mono-label uppercase text-text-muted">{label}</div>
      <div className={`mt-1 ${mono ? "font-mono" : ""} text-body text-ink`}>{value}</div>
    </div>
  );
}

/**
 * Migration 0027 follow-up — "Ship From" panel for the BUYER_FREIGHT
 * shipping method.
 *
 * When admin has chosen BUYER_FREIGHT, the buyer is responsible for
 * generating a prepaid label on their own carrier account. To do that
 * they need the warehouse's address as the "Ship From" origin. We
 * surface it here, formatted for easy copy-paste into a carrier
 * portal (UPS, FedEx, DHL, forwarder, etc.). The address is sourced
 * from the API's WAREHOUSE_FROM_* env vars so a config change updates
 * every active request automatically; no hard-coded value lives in
 * this component.
 *
 * Rendering rules:
 *   - shippingMethod must be BUYER_FREIGHT (the only method that
 *     requires the buyer to know our warehouse address)
 *   - status must be a step where the buyer can still act on it
 *     (intake paid through awaiting delivery — once SHIPPED, there's
 *     nothing more to generate)
 *   - warehouseShipFrom must be present on the response (defensive
 *     check; in practice the API always emits it)
 *
 * Phone + email are included because some carrier portals require
 * them for international shipments (DHL Express in particular).
 */
function BuyerFreightShipFromCard({
  request,
}: {
  request: ShopperRequestSnapshot;
}): JSX.Element | null {
  if (request.shippingMethod !== "BUYER_FREIGHT") return null;
  // Hide after the package has shipped — nothing to generate at that point.
  const TERMINAL = new Set([
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
    "REFUNDED",
  ] as const);
  if (TERMINAL.has(request.status as never)) return null;
  const w = request.warehouseShipFrom;
  if (!w) return null;
  const oneLine = [
    w.name,
    w.line2 ? `${w.line1}, ${w.line2}` : w.line1,
    `${w.city}, ${w.state} ${w.postalCode}`,
    w.country,
  ].join(" · ");
  const copyAll = async (): Promise<void> => {
    try {
      const lines = [
        w.name,
        w.line1,
        w.line2,
        `${w.city}, ${w.state} ${w.postalCode}`,
        w.country,
        `Phone: ${w.phone}`,
        `Email: ${w.email}`,
      ].filter((s): s is string => !!s && s.length > 0);
      await navigator.clipboard.writeText(lines.join("\n"));
    } catch {
      // Clipboard API can fail in insecure contexts or older Safari.
      // The address is right there on screen — copy-paste manually.
    }
  };
  return (
    <section className="rounded-md border border-line bg-white p-8">
      <div className="mb-4">
        <h2 className="font-mono text-mono-label uppercase text-text-muted">
          Shipping on your own carrier
        </h2>
        <p className="mt-2 text-body-sm text-text-muted">
          You&apos;ve been set up for buyer-freight. Generate a prepaid
          label on your carrier of choice (UPS, FedEx, DHL, your
          forwarder, etc.) using the address below as the{" "}
          <strong>Ship From / Origin</strong>. Once you have the PDF,
          send it as an attachment in this thread so we can release
          your package.
        </p>
      </div>
      <div className="rounded-sm border border-line bg-cream-soft p-5">
        <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
          Use this as your Ship From
        </div>
        <address className="mt-3 not-italic text-body leading-relaxed text-ink">
          <strong>{w.name}</strong>
          <br />
          {w.line1}
          {w.line2 ? (
            <>
              <br />
              {w.line2}
            </>
          ) : null}
          <br />
          {w.city}, {w.state} {w.postalCode}
          <br />
          {w.country}
        </address>
        <div className="mt-4 grid gap-3 border-t border-line pt-3 text-body-sm md:grid-cols-2">
          <div>
            <div className="font-mono text-mono-label uppercase text-text-muted">
              Phone
            </div>
            <div className="mt-1 font-mono text-ink">{w.phone}</div>
          </div>
          <div>
            <div className="font-mono text-mono-label uppercase text-text-muted">
              Email
            </div>
            <div className="mt-1 font-mono text-ink break-all">{w.email}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3 md:flex-row md:items-center md:justify-between">
          <p className="text-caption text-text-muted">
            Single line: <span className="font-mono">{oneLine}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              void copyAll();
            }}
            className="self-start rounded-sm border border-line-strong bg-white px-3 py-1.5 font-mono text-mono-label uppercase tracking-[1.2px] text-ink hover:bg-cream-soft md:self-auto"
          >
            Copy address
          </button>
        </div>
      </div>
      <div className="mt-4 rounded-sm border-l-4 border-amber bg-amber/10 px-4 py-3 text-body-sm">
        <strong className="font-mono text-mono-label uppercase tracking-[1.2px] text-amber">
          Reference {request.reference}
        </strong>
        <p className="mt-1 text-text">
          Add this reference to the label&apos;s memo or reference field
          if your carrier supports it. Makes it easy for the warehouse
          to match the box to your order.
        </p>
      </div>
    </section>
  );
}
