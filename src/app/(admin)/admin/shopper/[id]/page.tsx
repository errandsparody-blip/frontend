"use client";

/**
 * Admin Shopper detail.
 *
 * Phase 2 redesign (Migration 0021) — the estimate-vs-actual reconciliation
 * flow has been retired. If a price/availability change in-store would
 * materially affect the total, admin uses the chat to ask the buyer to
 * cancel + rebook (parent-link supported) rather than mutating intake.
 *
 * One screen, three columns of work:
 *   1. Header — buyer, status, money snapshot
 *   2. Lines — per-line procurement status (no actuals capture)
 *   3. Workflow rail — status-aware action buttons:
 *        PAID                → Start procurement
 *        PROCURING           → Save shipping (method + weight + destination)
 *                              Auto → AWAITING_DELIVERY when every line is
 *                              marked purchased / unavailable.
 *        AWAITING_DELIVERY   → Mark items delivered to warehouse
 *        READY_TO_SHIP       → Ship (carrier + tracking)
 *        SHIPPED             → done
 *        any in-flight       → Cancel (footer danger zone)
 *   4. Chat panel — full thread, admin composer
 *
 * The page polls the thread every 12s while the tab is visible so a
 * buyer's reply lands without a manual refresh. Action mutations
 * invalidate `["admin", "shopper", id]` to keep the snapshot honest.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { AttachmentUploader } from "@/components/portal/attachment-uploader";
import { ReferenceDisplay } from "@/components/portal/reference-display";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { BackButton } from "@/components/portal/back-button";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";
import { linkify } from "@/lib/linkify";
import {
  SHOPPER_LINE_PROCUREMENT_STATUS,
  type ShopperLineProcurementStatus,
  type ShopperLineSnapshot,
  type ShopperMessageSnapshot,
  type ShopperRequestSnapshot,
  type ShopperRequestStatus,
} from "@/lib/schemas/shopper";

interface AdminShopperDetailResponse {
  request: ShopperRequestSnapshot;
  messages: ShopperMessageSnapshot[];
}

const TONE: Record<ShopperRequestStatus, "neutral" | "info" | "success" | "warning" | "error"> = {
  AWAITING_INTAKE_PAYMENT: "warning",
  PAID: "info",
  PROCURING: "info",
  // Migration 0021 — Phase 2 shopper redesign. Items purchased, waiting
  // for them to arrive at our warehouse before shipping onward.
  AWAITING_DELIVERY: "info",
  AWAITING_RECONCILIATION: "warning",
  READY_TO_SHIP: "info",
  READY_FOR_PICKUP: "info",
  SHIPPED: "info",
  DELIVERED: "success",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
  // Migration 0023 — wire-track statuses. Warning when the ball is in
  // the buyer's court; info while we're processing on our side.
  AWAITING_ID_VERIFICATION: "warning",
  ID_UNDER_REVIEW: "info",
  QUOTE_SENT: "warning",
  AWAITING_WIRE_PAYMENT: "warning",
  WIRE_PROOF_UPLOADED: "info",
  WIRE_UNDER_REVIEW: "info",
  WIRE_CONFIRMED: "success",
  PURCHASE_APPROVED: "success",
};

function dollars(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminShopperDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();

  const detailQ = useQuery({
    queryKey: ["admin", "shopper", id],
    queryFn: () => api.get<AdminShopperDetailResponse>(`/admin/shopper/${id}`),
    enabled: !!id,
    refetchInterval: 12_000,
  });

  // Mark buyer messages as read whenever this view is open.
  useEffect(() => {
    if (!detailQ.data) return;
    void api.post(`/admin/shopper/${id}/read`).catch(() => undefined);
  }, [detailQ.data, id]);

  function refresh(): Promise<void> {
    return qc.invalidateQueries({ queryKey: ["admin", "shopper", id] }).then(() => undefined);
  }

  if (detailQ.isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  }
  if (detailQ.error) {
    return (
      <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
        {(detailQ.error as { message?: string }).message ?? "Failed to load request."}
      </div>
    );
  }
  if (!detailQ.data) return <div />;
  const { request, messages } = detailQ.data;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="[08] Personal Shopper"
        title={`${request.lines.length} ${request.lines.length === 1 ? "item" : "items"} · ${request.buyerEmail}`}
        description={`Created ${fmtTime(request.createdAt)} · ${request.buyerName ?? "no buyer name"}`}
        actions={
          <div className="flex items-center gap-3">
            <BackButton fallback="/admin/shopper" />
            <StatusPill tone={TONE[request.status]}>{request.status.replace(/_/g, " ")}</StatusPill>
          </div>
        }
      />

      {/* Reference panel — admins quote this to support / link from
          notes / paste into Slack threads. Keep it directly under the
          page header so it's the first thing they see. */}
      <section className="rounded-md border border-line bg-white p-6">
        <ReferenceDisplay
          reference={request.reference}
          parentReference={request.parentReference}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(360px,420px)] lg:items-start">
        <div className="flex flex-col gap-6">
          <MoneyPanel request={request} />
          {/* Migration 0023 — wire-track admin actions. Rendered for
              every WIRE request so admins can see the ID artefacts and
              wire-payment status at the top of the page. The card hides
              its own controls once the lifecycle is past it (e.g. an
              already-approved ID still shows the documents but no
              approve/reject buttons). */}
          {request.paymentMethod === "WIRE" ? (
            <WireTrackPanel request={request} onChange={refresh} />
          ) : null}
          <LinesPanel
            requestId={id}
            lines={request.lines}
            status={request.status}
            onChange={refresh}
          />
          <WorkflowPanel request={request} onChange={refresh} />
        </div>

        {/*
          Sticky chat rail. Without this, the chat panel scrolls with
          the rest of the document — and because the left column is
          much taller (Money + Lines + Workflow + Danger zone) the
          chat would slide out of view long before the admin reaches
          the danger zone. With `lg:sticky` the panel stays glued to
          the viewport at `top-6` and gets its own height-clamp so
          the internal message scroller (inside ChatPanel) is what
          moves, not the whole page.
        */}
        <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:max-h-[calc(100vh-3rem)]">
          <ChatPanel
            requestId={id}
            messages={messages}
            onChange={refresh}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Money snapshot
// ---------------------------------------------------------------------------

function MoneyPanel({ request }: { request: ShopperRequestSnapshot }): JSX.Element {
  const r = request;
  // Phase 2 redesign — the row of "actuals" disappeared because intake is
  // the final cost the buyer pays. We still surface shipping cost separately
  // because it's set during procurement (after intake) and admins need to
  // know whether they've assigned a method yet.
  return (
    <section className="rounded-md border border-line bg-white p-6">
      <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">Money</h2>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Items" value={dollars(r.itemsSubtotalCents)} />
        <Stat label="Service fee" value={dollars(r.commissionCents)} />
        <Stat
          label={
            r.effectiveTaxState
              ? `${r.effectiveTaxState} tax (${(r.estimatedTaxRateBps / 100).toFixed(2)}%)`
              : "Sales tax"
          }
          value={dollars(r.estimatedTaxCents)}
        />
        <Stat label="Intake total" value={dollars(r.intakeTotalCents)} emphasis />
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-3 font-mono text-mono-label uppercase text-text-muted">
        <span>Intake paid: {r.intakePaidAt ? fmtTime(r.intakePaidAt) : "—"}</span>
        <span>Shipping: {dollars(r.shippingCostCents)}</span>
        <span>
          Tracking: {r.carrier && r.trackingNumber ? `${r.carrier} · ${r.trackingNumber}` : "—"}
        </span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Migration 0023 — wire-track admin panel
//
// Two side-by-side cards: ID Review (top) and Wire Payment Review
// (bottom). Each card renders its own approve / reject controls based
// on the current idVerificationStatus + status.
// ---------------------------------------------------------------------------

function WireTrackPanel({
  request,
  onChange,
}: {
  request: ShopperRequestSnapshot;
  onChange: () => Promise<void>;
}): JSX.Element {
  return (
    <section className="rounded-md border border-line bg-white p-6">
      <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">
        Wire transfer · ID verification
      </h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <IdReviewCard request={request} onChange={onChange} />
        <WireReviewCard request={request} onChange={onChange} />
      </div>
    </section>
  );
}

function IdReviewCard({
  request,
  onChange,
}: {
  request: ShopperRequestSnapshot;
  onChange: () => Promise<void>;
}): JSX.Element {
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState("");
  const { bannerError, handle, clear } = useApiErrorHandler();
  // Migration 0026 — "approve mode" reveals the bank-instructions form
  // so the admin can pick a specific account number for THIS buyer
  // before approving. The fields submit alongside the approve call.
  const [approveMode, setApproveMode] = useState(false);
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [swift, setSwift] = useState("");
  const [iban, setIban] = useState("");
  const [memo, setMemo] = useState(`Order ${request.reference}`);

  const approve = useMutation({
    mutationFn: () => {
      // Build the optional bankInstructions payload — omit entirely if
      // the admin didn't type an account number, in which case the
      // backend falls back to the global config row.
      const body: Record<string, unknown> = { note: "" };
      if (accountNumber.trim().length > 0) {
        const bi: Record<string, string> = { accountNumber: accountNumber.trim() };
        if (beneficiaryName.trim()) bi.beneficiaryName = beneficiaryName.trim();
        if (bankName.trim()) bi.bankName = bankName.trim();
        if (routingNumber.trim()) bi.routingNumber = routingNumber.trim();
        if (swift.trim()) bi.swift = swift.trim();
        if (iban.trim()) bi.iban = iban.trim();
        if (memo.trim()) bi.memo = memo.trim();
        body.bankInstructions = bi;
      }
      return api.post(`/admin/shopper/${request.id}/id/approve`, body);
    },
    onSuccess: () => {
      setApproveMode(false);
      onChange();
    },
    onError: (err) => handle(err),
  });

  const reject = useMutation({
    mutationFn: () =>
      api.post(`/admin/shopper/${request.id}/id/reject`, { reason: reason.trim() }),
    onSuccess: () => {
      setReason("");
      setRejectMode(false);
      onChange();
    },
    onError: (err) => handle(err),
  });

  const status = request.idVerificationStatus;
  const isReviewable = status === "UNDER_REVIEW";
  const isApproved = status === "APPROVED";
  const isRejected = status === "REJECTED";

  return (
    <div className="rounded-sm border border-line bg-cream-soft p-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-mono text-mono-label uppercase text-text-muted">
          ID verification
        </div>
        <StatusPill
          tone={
            isApproved
              ? "success"
              : isReviewable
                ? "warning"
                : isRejected
                  ? "error"
                  : "neutral"
          }
        >
          {status.replace(/_/g, " ").toLowerCase()}
        </StatusPill>
      </div>

      {request.idDocumentUrl || request.idSelfieUrl ? (
        <div className="mb-3 grid gap-2 md:grid-cols-2">
          {request.idDocumentUrl ? (
            <a
              href={request.idDocumentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-sm border border-line bg-white px-3 py-2 font-mono text-mono-label uppercase tracking-[1.2px] text-amber hover:underline"
            >
              View ID document →
            </a>
          ) : null}
          {request.idSelfieUrl ? (
            <a
              href={request.idSelfieUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-sm border border-line bg-white px-3 py-2 font-mono text-mono-label uppercase tracking-[1.2px] text-amber hover:underline"
            >
              View selfie →
            </a>
          ) : null}
        </div>
      ) : (
        <p className="mb-3 text-body-sm text-text-muted">
          Buyer hasn&apos;t uploaded documents yet.
        </p>
      )}

      {isRejected && request.idRejectionReason ? (
        <div className="mb-3 rounded-sm border-l-4 border-error bg-error/10 px-3 py-2 text-body-sm">
          <strong className="block font-mono text-mono-label uppercase tracking-[1.2px] text-error">
            Last rejection
          </strong>
          {request.idRejectionReason}
        </div>
      ) : null}

      {bannerError ? (
        <div className="mb-3">
          <ErrorBanner
            error={bannerError}
            onAction={(handler) => {
              if (handler === "retry") clear();
            }}
          />
        </div>
      ) : null}

      {isReviewable ? (
        rejectMode ? (
          <div className="flex flex-col gap-2">
            <textarea
              rows={3}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Specific reason the buyer will see — e.g. 'photo is blurry' or 'selfie doesn't match ID'"
              className="w-full rounded-sm border border-line-strong bg-white px-3 py-2 text-body-sm text-text outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRejectMode(false);
                  setReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={!reason.trim() || reject.isPending}
                loading={reject.isPending}
                onClick={() => reject.mutate()}
              >
                {reject.isPending ? "Rejecting…" : "Confirm reject"}
              </Button>
            </div>
          </div>
        ) : approveMode ? (
          // Migration 0026 — bank-account form. Required: account
          // number. Everything else optional so a domestic-only USD
          // account fits as easily as an IBAN-only international one.
          // The form posts the data alongside the approval — buyer
          // gets the account in the chat thread + on their thread
          // page immediately after admin clicks the confirm button.
          <div className="flex flex-col gap-3 rounded-sm border border-line-strong bg-white p-4">
            <div>
              <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-amber">
                Approve + send account to buyer
              </div>
              <p className="mt-1 text-body-sm text-text-muted">
                Type the account number you want the buyer to wire to. They&apos;ll
                see it in their thread and receive it in chat the moment you
                confirm. Leave the field blank to fall back to the platform&apos;s
                default account.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Account number (required to set per-request)">
                <Input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="1234567890"
                  autoComplete="off"
                />
              </Field>
              <Field label="Beneficiary name (optional)">
                <Input
                  value={beneficiaryName}
                  onChange={(e) => setBeneficiaryName(e.target.value)}
                  placeholder="USA Errands LLC"
                  autoComplete="off"
                />
              </Field>
              <Field label="Bank name (optional)">
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Bank of America"
                  autoComplete="off"
                />
              </Field>
              <Field label="Routing / ABA (optional)">
                <Input
                  value={routingNumber}
                  onChange={(e) => setRoutingNumber(e.target.value)}
                  placeholder="026009593"
                  autoComplete="off"
                />
              </Field>
              <Field label="SWIFT / BIC (optional)">
                <Input
                  value={swift}
                  onChange={(e) => setSwift(e.target.value)}
                  placeholder="BOFAUS3N"
                  autoComplete="off"
                />
              </Field>
              <Field label="IBAN (optional)">
                <Input
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="DE89 3704…"
                  autoComplete="off"
                />
              </Field>
              <Field label="Memo / reference (optional, recommended)" className="md:col-span-2">
                <Input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder={`Order ${request.reference}`}
                  autoComplete="off"
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setApproveMode(false)}
                disabled={approve.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="amber"
                size="sm"
                disabled={approve.isPending}
                loading={approve.isPending}
                onClick={() => approve.mutate()}
              >
                {approve.isPending
                  ? "Approving…"
                  : accountNumber.trim().length > 0
                    ? "Approve + send account"
                    : "Approve (use default account)"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="amber"
              size="sm"
              disabled={approve.isPending}
              loading={approve.isPending}
              onClick={() => setApproveMode(true)}
            >
              Approve ID…
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRejectMode(true)}
            >
              Reject
            </Button>
          </div>
        )
      ) : isApproved ? (
        <p className="text-body-sm text-text-muted">
          Approved. Buyer can now see the bank-transfer instructions.
        </p>
      ) : null}
    </div>
  );
}

function WireReviewCard({
  request,
  onChange,
}: {
  request: ShopperRequestSnapshot;
  onChange: () => Promise<void>;
}): JSX.Element {
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState("");
  const { bannerError, handle, clear } = useApiErrorHandler();

  const confirm = useMutation({
    mutationFn: () =>
      api.post(`/admin/shopper/${request.id}/wire/confirm`, { note: "" }),
    onSuccess: () => onChange(),
    onError: (err) => handle(err),
  });

  const reject = useMutation({
    mutationFn: () =>
      api.post(`/admin/shopper/${request.id}/wire/reject`, { reason: reason.trim() }),
    onSuccess: () => {
      setReason("");
      setRejectMode(false);
      onChange();
    },
    onError: (err) => handle(err),
  });

  // Display state for the bank-proof block. Three meaningful buckets:
  //   - waiting on buyer (QUOTE_SENT / AWAITING_WIRE_PAYMENT)
  //   - proof submitted & needs review (WIRE_UNDER_REVIEW)
  //   - already past review (anything later)
  const isReviewable =
    request.status === "WIRE_UNDER_REVIEW" || request.status === "WIRE_PROOF_UPLOADED";
  const isWaitingOnBuyer =
    request.status === "QUOTE_SENT" || request.status === "AWAITING_WIRE_PAYMENT";

  return (
    <div className="rounded-sm border border-line bg-cream-soft p-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-mono text-mono-label uppercase text-text-muted">
          Wire payment
        </div>
        <StatusPill tone={isReviewable ? "warning" : isWaitingOnBuyer ? "neutral" : "info"}>
          {isReviewable
            ? "proof to review"
            : isWaitingOnBuyer
              ? "awaiting buyer"
              : request.wireConfirmedAt
                ? "confirmed"
                : "—"}
        </StatusPill>
      </div>

      {request.wireProofUrl ? (
        <div className="mb-3">
          <a
            href={request.wireProofUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-sm border border-line bg-white px-3 py-2 font-mono text-mono-label uppercase tracking-[1.2px] text-amber hover:underline"
          >
            View wire receipt →
          </a>
          {request.wireProofUploadedAt ? (
            <div className="mt-1 font-mono text-mono-label uppercase text-text-muted">
              Uploaded {fmtTime(request.wireProofUploadedAt)}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mb-3 text-body-sm text-text-muted">
          Buyer hasn&apos;t uploaded wire-transfer proof yet.
        </p>
      )}

      {bannerError ? (
        <div className="mb-3">
          <ErrorBanner
            error={bannerError}
            onAction={(handler) => {
              if (handler === "retry") clear();
            }}
          />
        </div>
      ) : null}

      {isReviewable ? (
        rejectMode ? (
          <div className="flex flex-col gap-2">
            <textarea
              rows={3}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Specific reason the buyer will see — e.g. 'amount on receipt is short' or 'wrong reference in memo'"
              className="w-full rounded-sm border border-line-strong bg-white px-3 py-2 text-body-sm text-text outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRejectMode(false);
                  setReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={!reason.trim() || reject.isPending}
                loading={reject.isPending}
                onClick={() => reject.mutate()}
              >
                {reject.isPending ? "Rejecting…" : "Confirm reject"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="amber"
              size="sm"
              disabled={confirm.isPending}
              loading={confirm.isPending}
              onClick={() => confirm.mutate()}
            >
              {confirm.isPending ? "Confirming…" : "Confirm payment"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRejectMode(true)}
            >
              Reject
            </Button>
          </div>
        )
      ) : request.wireConfirmedAt ? (
        <p className="text-body-sm text-text-muted">
          Confirmed {fmtTime(request.wireConfirmedAt)}.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lines (per-line reconciliation)
// ---------------------------------------------------------------------------

function LinesPanel({
  requestId,
  lines,
  status,
  onChange,
}: {
  requestId: string;
  lines: ShopperLineSnapshot[];
  status: ShopperRequestStatus;
  onChange: () => void;
}): JSX.Element {
  // Editing is gated to PROCURING — once admin has moved the request past
  // procurement (AWAITING_DELIVERY onwards) the line statuses are locked.
  // If price/availability changes after this point, admin cancels + rebooks
  // rather than mutating in place.
  const editable = status === "PROCURING";

  const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <section className="rounded-md border border-line bg-white p-6">
      <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">
        Lines {editable ? "" : "(read-only)"}
      </h2>
      <ul className="flex flex-col divide-y divide-line">
        {lines.map((line) => (
          <LineRow
            key={line.id}
            requestId={requestId}
            line={line}
            editable={editable}
            onChange={onChange}
          />
        ))}
      </ul>

      <div className="mt-4 grid gap-4 border-t border-line pt-4 md:grid-cols-2">
        <Stat label="Lines" value={String(lines.length)} />
        <Stat label="Total units" value={String(totalUnits)} />
      </div>
    </section>
  );
}

function LineRow({
  requestId,
  line,
  editable,
  onChange,
}: {
  requestId: string;
  line: ShopperLineSnapshot;
  editable: boolean;
  onChange: () => void;
}): JSX.Element {
  // Phase 2 shopper redesign — actuals reconciliation is retired. If the
  // price admin sees at the store differs from the buyer's estimate,
  // admin uses the chat to ask the buyer to cancel + rebook rather than
  // capturing actuals. So this row only carries: status, title override,
  // optional note. The Save Line button persists those three and triggers
  // the per-status notification email.
  const [procStatus, setProcStatus] = useState<ShopperLineProcurementStatus>(
    (line.procurementStatus as ShopperLineProcurementStatus) ?? "pending",
  );
  const [productTitle, setProductTitle] = useState<string>(line.productTitle ?? "");
  const [notes, setNotes] = useState<string>("");
  // After a successful Save line round-trip we flip the button to a
  // green "Saved ✓" label for ~1.6 s. Pure UX — the admin needs to see
  // *something* change after they click, otherwise they double-tap
  // thinking nothing happened.
  const [lineSavedFlash, setLineSavedFlash] = useState(false);
  const { bannerError, handle, clear } = useApiErrorHandler();

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { procurementStatus: procStatus };
      if (productTitle.trim() !== (line.productTitle ?? "")) {
        body.productTitle = productTitle.trim();
      }
      if (notes.trim().length > 0) {
        body.procurementNotes = notes.trim();
      }
      return api.patch<ShopperLineSnapshot>(`/admin/shopper/${requestId}/lines/${line.id}`, body);
    },
    onSuccess: () => {
      setNotes("");
      setLineSavedFlash(true);
      // 1.6 s gives the operator plenty of time to register the
      // confirmation without leaving the button stuck in the "Saved"
      // state if they want to make another edit.
      window.setTimeout(() => setLineSavedFlash(false), 1600);
      onChange();
    },
    onError: (err) => handle(err),
  });

  return (
    <li className="grid gap-3 py-4 md:grid-cols-[2fr_80px_120px_minmax(220px,1fr)]">
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
          <p className="mt-1 text-body-sm text-text-muted">Buyer note: {line.productNotes}</p>
        ) : null}
        {editable ? (
          <Field label="Title (optional override)" className="mt-2">
            <Input
              type="text"
              value={productTitle}
              onChange={(e) => setProductTitle(e.target.value)}
              placeholder="Friendly name"
            />
          </Field>
        ) : null}
      </div>

      <div className="font-mono text-body text-text-muted">×{line.quantity}</div>

      <div>
        <Field label="Estimated">
          <Input
            type="text"
            value={dollars(line.estimatedUnitPriceCents)}
            disabled
            className="bg-cream text-text-muted"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <Field label="Status">
          <select
            value={procStatus}
            disabled={!editable}
            onChange={(e) => setProcStatus(e.target.value as ShopperLineProcurementStatus)}
            className="h-11 w-full rounded-sm border border-line-strong bg-cream-soft px-3 text-body text-text outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
          >
            {SHOPPER_LINE_PROCUREMENT_STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        {editable ? (
          <Field label="Note for this update (optional)">
            <Input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Substitution, etc."
            />
          </Field>
        ) : null}
        {editable ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={save.isPending || lineSavedFlash}
            loading={save.isPending}
            onClick={() => {
              clear();
              save.mutate();
            }}
            // Tri-state: idle / saving / saved. The colour swap to
            // green (via inline className override on the success state)
            // is the strongest possible visual confirmation that the
            // round-trip finished — much harder to miss than the
            // implicit spinner on its own.
            className={
              lineSavedFlash
                ? "border-success bg-success text-text-inv hover:bg-success/90"
                : undefined
            }
          >
            {save.isPending
              ? "Saving…"
              : lineSavedFlash
                ? "Saved ✓"
                : "Save line"}
          </Button>
        ) : null}
        {bannerError ? (
          <div className="mt-2">
            <ErrorBanner error={bannerError} />
          </div>
        ) : null}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Workflow rail (status-aware actions)
// ---------------------------------------------------------------------------

function WorkflowPanel({
  request,
  onChange,
}: {
  request: ShopperRequestSnapshot;
  onChange: () => void;
}): JSX.Element {
  const r = request;
  const id = r.id;
  const { bannerError, handle, clear } = useApiErrorHandler();

  // After the Save shipping mutation succeeds we flash a "Saved ✓" label
  // on the button. Held in state so a render between the mutation
  // finishing and the parent query invalidating doesn't lose the flash.
  // Cleared by a timeout so the next click can show "Saving…" again.
  const [saveJustSucceeded, setSaveJustSucceeded] = useState(false);

  // Live action mutations. Each invalidates the parent query to repaint.
  const post = useMutation({
    mutationFn: (args: { path: string; body?: unknown }) =>
      api.post<unknown>(`/admin/shopper/${id}${args.path}`, args.body),
    onSuccess: (_data, vars) => {
      // Confirmation label on the Save button. Only for the shipping
      // endpoint — other actions have their own card layouts.
      if (vars.path === "/shipping") {
        setSaveJustSucceeded(true);
        setTimeout(() => setSaveJustSucceeded(false), 1800);
      }
      onChange();
    },
    onError: (err) => handle(err),
  });

  // Per-status workflow buttons
  const actions = useMemo(() => statusActions(r.status), [r.status]);

  // Last-known per-method default rates from the API. Only used to
  // pre-fill the rate input the first time the operator picks a method;
  // after that they type the rate inline. Pricing config UI is gone —
  // the rate is per-request and lives entirely on this page.
  const freightRatesQuery = useQuery({
    queryKey: ["admin", "shopper", "freight-rates"],
    queryFn: () =>
      api.get<{
        rates: Record<string, number>;
        methods: ReadonlyArray<string>;
      }>("/admin/shopper/freight-rates"),
    staleTime: 60 * 60 * 1000,
  });
  const freightRates = freightRatesQuery.data?.rates ?? {};

  // Phase 2 redesign — actuals reconciliation + manual-override are retired.
  // The setShipping action accepts: method, parcel weight (pounds), optional
  // parcel dimensions, and the destination address. The receipt always
  // shows weight × rate so the buyer can see exactly what was charged.
  // Migration 0025 — four shipping methods. Each one drives a different
  // form below (rate/weight/dest only for the two freight modes; label
  // upload only for BUYER_FREIGHT; pickup name + date only for PICKUP).
  type ShippingMethodOption =
    | ""
    | "PLATFORM_FREIGHT"
    | "BUYER_FREIGHT"
    | "BUYER_FORWARDER"
    | "PICKUP";
  const [shippingMethod, setShippingMethod] = useState<ShippingMethodOption>(
    (r.shippingMethod as ShippingMethodOption) ?? "",
  );
  // Method-specific state. All optional at render time; the validity
  // check below enforces what's needed per method before save unlocks.
  const [buyerLabelUrl, setBuyerLabelUrl] = useState<string>(
    (r as unknown as { buyerLabelUrl?: string | null }).buyerLabelUrl ?? "",
  );
  const [pickupName, setPickupName] = useState<string>(
    (r as unknown as { pickupName?: string | null }).pickupName ?? r.buyerName ?? "",
  );
  const [pickupScheduledAt, setPickupScheduledAt] = useState<string>(() => {
    const v = (r as unknown as { pickupScheduledAt?: string | Date | null }).pickupScheduledAt;
    if (!v) return "";
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    // <input type="datetime-local"> requires `YYYY-MM-DDTHH:mm` in local
    // time. Slice the ISO string to drop seconds + timezone marker.
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  // Phase 2 redesign — admin types the per-lb rate for this specific
  // request right here in the workflow. Dollars on the wire, converted
  // to whole cents at save time. Pre-filled from whatever the row
  // already has (so re-opening an in-flight request shows the rate
  // that was last persisted).
  const [rateDollarsPerLb, setRateDollarsPerLb] = useState<string>(
    r.freightRateCentsPerLb != null && r.freightRateCentsPerLb >= 0
      ? (r.freightRateCentsPerLb / 100).toFixed(2)
      : "",
  );
  // Weight is captured in pounds (LB). The backend persists ounces so the
  // receipt and rate-card math line up, so we convert at submit time:
  //     pounds × 16 = ounces.
  const [parcelWeightLb, setParcelWeightLb] = useState(
    r.parcelWeightOz != null ? (r.parcelWeightOz / 16).toFixed(2) : "",
  );
  const [parcelLength, setParcelLength] = useState(
    r.parcelLengthIn != null ? r.parcelLengthIn.toString() : "",
  );
  const [parcelWidth, setParcelWidth] = useState(
    r.parcelWidthIn != null ? r.parcelWidthIn.toString() : "",
  );
  const [parcelHeight, setParcelHeight] = useState(
    r.parcelHeightIn != null ? r.parcelHeightIn.toString() : "",
  );
  // Destination address — pre-populated from the request if intake captured
  // it, otherwise blank so admin can paste from the chat. Saved alongside
  // shipping so the label/receipt always have the latest version.
  const [destRecipientName, setDestRecipientName] = useState(
    r.shippingAddress?.recipientName ?? r.buyerName ?? "",
  );
  const [destLine1, setDestLine1] = useState(r.shippingAddress?.line1 ?? "");
  const [destLine2, setDestLine2] = useState(r.shippingAddress?.line2 ?? "");
  const [destCity, setDestCity] = useState(r.shippingAddress?.city ?? "");
  const [destState, setDestState] = useState(r.shippingAddress?.state ?? "");
  const [destPostalCode, setDestPostalCode] = useState(r.shippingAddress?.postalCode ?? "");
  const [destCountry, setDestCountry] = useState(r.shippingAddress?.country ?? "US");

  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [issueRefund, setIssueRefund] = useState(true);

  return (
    <section className="rounded-md border border-line bg-white p-6">
      <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">Workflow</h2>

      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner
            error={bannerError}
            onAction={(handler) => {
              if (handler === "support") window.location.href = "mailto:support@myusaerrands.com";
              else if (handler === "retry") clear();
            }}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        {actions.includes("start") ? (
          <Action
            title="Start procurement"
            description="Locks the request into PROCURING. Reconciliation editing opens."
            cta="Start"
            disabled={post.isPending}
            onClick={() => {
              clear();
              post.mutate({ path: "/start" });
            }}
          />
        ) : null}

        {actions.includes("shipping") ? (
          (() => {
            // Live freight calculation. Mirrors the backend formula:
            //   cost (cents) = pounds × rate_cents_per_lb
            // Both the weight AND the rate are typed inline; the server
            // recomputes from the same inputs at save time so the
            // number on screen is the number the buyer is charged.
            const liveWeightLb = (() => {
              const n = Number(parcelWeightLb);
              return Number.isFinite(n) && n >= 0 ? n : 0;
            })();
            const liveRateCentsPerLb = (() => {
              const n = Number(rateDollarsPerLb);
              if (!Number.isFinite(n) || n < 0) return 0;
              return Math.round(n * 100);
            })();
            const liveCalculatedCents =
              liveWeightLb > 0 && liveRateCentsPerLb > 0
                ? Math.round(liveWeightLb * liveRateCentsPerLb)
                : 0;
            // Migration 0025 — readiness is now method-aware.
            //   PLATFORM_FREIGHT / BUYER_FORWARDER → rate + weight + dest
            //   BUYER_FREIGHT                       → label URL only
            //   PICKUP                              → pickup name + date
            const destReady =
              destRecipientName.trim().length > 0 &&
              destLine1.trim().length > 0 &&
              destCity.trim().length > 0 &&
              /^[A-Za-z]{2}$/.test(destState.trim()) &&
              destPostalCode.trim().length > 0;
            const isFreightMode =
              shippingMethod === "PLATFORM_FREIGHT" ||
              shippingMethod === "BUYER_FORWARDER";
            const isBuyerFreight = shippingMethod === "BUYER_FREIGHT";
            const isPickup = shippingMethod === "PICKUP";
            const shipReady =
              isFreightMode
                ? liveRateCentsPerLb > 0 && liveWeightLb > 0 && destReady
                : isBuyerFreight
                  ? buyerLabelUrl.trim().length > 0
                  : isPickup
                    ? pickupName.trim().length >= 2 && pickupScheduledAt.trim().length > 0
                    : false;

            // ----- Save-button state machine -----
            // The mutation hook gives us pending/success/error directly.
            // We use them to flip the button label so the operator gets
            // immediate feedback: "Yes, save" → "Saving…" → "Saved ✓".
            // The success label sticks for ~1.5s after the response so
            // the user can see it before the form re-renders.
            const isShipMutation =
              post.variables != null &&
              (post.variables as { path?: string }).path === "/shipping";
            let saveLabel = "Yes, save";
            if (isShipMutation && post.isPending) {
              saveLabel = "Saving…";
            } else if (isShipMutation && saveJustSucceeded) {
              saveLabel = "Saved ✓";
            }
            return (
              <Action
                title="Save shipping"
                description="Pick a method, type the per-lb rate for this request, enter parcel weight in pounds, and the destination. The system multiplies pounds × per-lb rate to compute shipping; the receipt always shows both numbers so the buyer can audit. Parcel dimensions are optional but recommended for the warehouse."
                disabled={post.isPending || !shipReady}
                cta={saveLabel}
                ctaTone={isShipMutation && saveJustSucceeded ? "success" : undefined}
                onClick={() => {
                  clear();
                  const body: Record<string, unknown> = {
                    shippingMethod: shippingMethod || undefined,
                  };
                  if (isFreightMode) {
                    // Per-pound math: always opt into the server's
                    // weight × rate calc. Address required.
                    body.useCalculated = true;
                    body.shippingRateCentsPerLb = liveRateCentsPerLb;
                    body.parcelWeightOz =
                      Math.round(liveWeightLb * 16 * 100) / 100;
                    for (const [key, raw] of [
                      ["parcelLengthIn", parcelLength],
                      ["parcelWidthIn", parcelWidth],
                      ["parcelHeightIn", parcelHeight],
                    ] as const) {
                      const v = raw.trim();
                      if (v.length === 0) continue;
                      const n = Number(v);
                      if (Number.isFinite(n) && n >= 0) body[key] = n;
                    }
                    body.shippingAddress = {
                      recipientName: destRecipientName.trim(),
                      line1: destLine1.trim(),
                      line2: destLine2.trim() || undefined,
                      city: destCity.trim(),
                      state: destState.trim().toUpperCase(),
                      postalCode: destPostalCode.trim(),
                      country: (destCountry.trim() || "US").toUpperCase(),
                    };
                  } else if (isBuyerFreight) {
                    // BUYER_FREIGHT — only the buyer's label URL is
                    // captured here; no freight rate, no address from
                    // us. The label drives carrier + tracking later.
                    body.buyerLabelUrl = buyerLabelUrl.trim();
                  } else if (isPickup) {
                    // PICKUP — name + scheduled window. Backend zeros
                    // shipping cost automatically.
                    body.pickupName = pickupName.trim();
                    // `datetime-local` produces a string in local time
                    // without a TZ. Convert to ISO via the Date ctor so
                    // the backend persists it as a UTC timestamp.
                    body.pickupScheduledAt = new Date(pickupScheduledAt).toISOString();
                  }
                  post.mutate({ path: "/shipping", body });
                }}
              >
                {/* Method picker always visible — the inputs below
                    change based on which method is selected. */}
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Method">
                    <select
                      value={shippingMethod}
                      onChange={(e) => {
                        setShippingMethod(e.target.value as typeof shippingMethod);
                        // First time the operator picks a freight
                        // method we pre-fill the rate from the
                        // last-known default for convenience.
                        if (rateDollarsPerLb.trim() === "") {
                          const seed = freightRates[e.target.value];
                          if (typeof seed === "number" && seed >= 0) {
                            setRateDollarsPerLb((seed / 100).toFixed(2));
                          }
                        }
                      }}
                      className="h-11 w-full rounded-sm border border-line-strong bg-cream-soft px-3 text-body text-text outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
                    >
                      <option value="">— pick a method —</option>
                      <option value="PLATFORM_FREIGHT">Platform freight</option>
                      <option value="BUYER_FREIGHT">
                        Buyer freight (their carrier label)
                      </option>
                      <option value="BUYER_FORWARDER">Buyer forwarder</option>
                      <option value="PICKUP">Pickup</option>
                    </select>
                  </Field>
                  <div className="flex items-end">
                    <p className="text-body-sm text-text-muted">
                      {shippingMethod === "PLATFORM_FREIGHT"
                        ? "We ship on our carrier — set rate + weight + destination."
                        : shippingMethod === "BUYER_FORWARDER"
                          ? "We ship to the buyer's US forwarder — set rate + weight + forwarder address."
                          : shippingMethod === "BUYER_FREIGHT"
                            ? "Buyer provides their own carrier label — upload it; we don't charge freight."
                            : shippingMethod === "PICKUP"
                              ? "Buyer collects at the warehouse — set pickup name + scheduled window."
                              : "Pick a method to see the form fields needed for it."}
                    </p>
                  </div>
                </div>

                {/* BUYER_FREIGHT — single field: the prepaid label URL. */}
                {isBuyerFreight ? (
                  <div className="mt-4 rounded-sm border border-line bg-cream-soft p-4">
                    <Field
                      label="Buyer's shipping label"
                      hint="Paste a public URL to the prepaid label (PDF or image). The buyer should send it in chat."
                    >
                      <Input
                        type="url"
                        value={buyerLabelUrl}
                        onChange={(e) => setBuyerLabelUrl(e.target.value)}
                        placeholder="https://…/label.pdf"
                      />
                    </Field>
                    {buyerLabelUrl.trim().length > 0 ? (
                      <a
                        href={buyerLabelUrl.trim()}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-2 inline-block font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
                      >
                        Open label in new tab →
                      </a>
                    ) : null}
                  </div>
                ) : null}

                {/* PICKUP — name + scheduled window only. */}
                {isPickup ? (
                  <div className="mt-4 grid gap-3 rounded-sm border border-line bg-cream-soft p-4 md:grid-cols-2">
                    <Field
                      label="Pickup person's name"
                      hint="Buyer or authorized rep. We don't collect ID."
                    >
                      <Input
                        type="text"
                        value={pickupName}
                        onChange={(e) => setPickupName(e.target.value)}
                        placeholder="Jane Doe"
                      />
                    </Field>
                    <Field
                      label="Scheduled pickup"
                      hint="Local date + time. Visible to warehouse on the receive sheet."
                    >
                      <Input
                        type="datetime-local"
                        value={pickupScheduledAt}
                        onChange={(e) => setPickupScheduledAt(e.target.value)}
                      />
                    </Field>
                  </div>
                ) : null}

                {/* Freight modes — rate, weight, calc display. */}
                {isFreightMode ? (
                <div className="mt-4 grid gap-3 md:grid-cols-[140px_140px_1fr]">
                  <Field label="Rate ($/lb)">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={rateDollarsPerLb}
                      onChange={(e) => setRateDollarsPerLb(e.target.value)}
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label="Total weight (lb)">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={parcelWeightLb}
                      onChange={(e) => setParcelWeightLb(e.target.value)}
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label="Calculated cost">
                    <div className="flex h-11 items-center justify-between rounded-sm border border-line bg-cream-soft px-3 font-mono text-body tabular-nums text-ink">
                      <span>{dollars(liveCalculatedCents)}</span>
                      <span className="font-mono text-mono-label uppercase text-text-muted">
                        {liveWeightLb > 0 && liveRateCentsPerLb > 0
                          ? `${liveWeightLb.toFixed(2)} lb × ${dollars(liveRateCentsPerLb)}/lb`
                          : !shippingMethod
                            ? "pick a method"
                            : liveRateCentsPerLb <= 0
                              ? "enter rate"
                              : "enter weight"}
                      </span>
                    </div>
                  </Field>
                </div>
                ) : null}

                {isFreightMode ? (
                <div className="mt-4">
                  <h4 className="mb-2 font-mono text-mono-label uppercase text-text-muted">
                    {shippingMethod === "BUYER_FORWARDER"
                      ? "Forwarder address"
                      : "Destination address"}
                  </h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Recipient name">
                      <Input
                        type="text"
                        value={destRecipientName}
                        onChange={(e) => setDestRecipientName(e.target.value)}
                        placeholder="Jane Doe"
                      />
                    </Field>
                    <Field label="Country (ISO 2)">
                      <Input
                        type="text"
                        maxLength={2}
                        value={destCountry}
                        onChange={(e) => setDestCountry(e.target.value.toUpperCase())}
                        placeholder="US"
                      />
                    </Field>
                    <Field label="Address line 1" className="md:col-span-2">
                      <Input
                        type="text"
                        value={destLine1}
                        onChange={(e) => setDestLine1(e.target.value)}
                        placeholder="123 Main St"
                      />
                    </Field>
                    <Field label="Address line 2 (optional)" className="md:col-span-2">
                      <Input
                        type="text"
                        value={destLine2}
                        onChange={(e) => setDestLine2(e.target.value)}
                        placeholder="Apt, suite, unit…"
                      />
                    </Field>
                    <Field label="City">
                      <Input
                        type="text"
                        value={destCity}
                        onChange={(e) => setDestCity(e.target.value)}
                        placeholder="Brooklyn"
                      />
                    </Field>
                    <Field label="State (2-letter)">
                      <Input
                        type="text"
                        maxLength={2}
                        value={destState}
                        onChange={(e) => setDestState(e.target.value.toUpperCase())}
                        placeholder="NY"
                      />
                    </Field>
                    <Field label="Postal code">
                      <Input
                        type="text"
                        value={destPostalCode}
                        onChange={(e) => setDestPostalCode(e.target.value)}
                        placeholder="11201"
                      />
                    </Field>
                  </div>
                </div>
                ) : null}

                {isFreightMode ? (
                <div className="mt-4">
                  <h4 className="mb-2 font-mono text-mono-label uppercase text-text-muted">
                    Parcel dimensions (optional)
                  </h4>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Length (in)">
                      <Input
                        type="number"
                        step="0.1"
                        min={0}
                        value={parcelLength}
                        onChange={(e) => setParcelLength(e.target.value)}
                        placeholder="—"
                      />
                    </Field>
                    <Field label="Width (in)">
                      <Input
                        type="number"
                        step="0.1"
                        min={0}
                        value={parcelWidth}
                        onChange={(e) => setParcelWidth(e.target.value)}
                        placeholder="—"
                      />
                    </Field>
                    <Field label="Height (in)">
                      <Input
                        type="number"
                        step="0.1"
                        min={0}
                        value={parcelHeight}
                        onChange={(e) => setParcelHeight(e.target.value)}
                        placeholder="—"
                      />
                    </Field>
                  </div>
                </div>
                ) : null}
              </Action>
            );
          })()
        ) : null}

        {actions.includes("delivered_to_warehouse") ? (
          <Action
            title="Items delivered to warehouse"
            description="Use this once every line has physically arrived and is ready to pack. Moves the request to READY_TO_SHIP so you can buy a label."
            cta="Mark delivered to warehouse"
            disabled={post.isPending}
            onClick={() => {
              clear();
              post.mutate({ path: "/delivered-to-warehouse" });
            }}
          />
        ) : null}

        {actions.includes("ship") &&
        r.shippingMethod !== "BUYER_FREIGHT" &&
        r.shippingMethod !== "PICKUP" ? (
          <Action
            title="Ship (platform / forwarder)"
            description="Mark shipped on our carrier and email the buyer with tracking. Use this for PLATFORM_FREIGHT and BUYER_FORWARDER methods."
            cta="Mark shipped"
            disabled={post.isPending || !carrier.trim() || !trackingNumber.trim()}
            onClick={() => {
              clear();
              post.mutate({
                path: "/ship",
                body: { carrier: carrier.trim(), trackingNumber: trackingNumber.trim() },
              });
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Carrier">
                <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="USPS" />
              </Field>
              <Field label="Tracking number">
                <Input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="9400…"
                />
              </Field>
            </div>
          </Action>
        ) : null}

        {/* Migration 0025 — release on the buyer's prepaid label. Same
            carrier + tracking inputs (admin reads them off the buyer's
            label) but hits a separate endpoint so the audit log clearly
            distinguishes "shipped on our carrier" from "released with
            buyer label". Only renders when the request is on
            BUYER_FREIGHT and READY_TO_SHIP. */}
        {actions.includes("release_with_buyer_label") &&
        r.shippingMethod === "BUYER_FREIGHT" ? (
          <Action
            title="Release with buyer label"
            description="Apply the buyer's prepaid label and hand the package off. Carrier + tracking come from their label."
            cta="Release with buyer label"
            disabled={post.isPending || !carrier.trim() || !trackingNumber.trim()}
            onClick={() => {
              clear();
              post.mutate({
                path: "/release-with-buyer-label",
                body: { carrier: carrier.trim(), trackingNumber: trackingNumber.trim() },
              });
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Carrier (from buyer's label)">
                <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="USPS" />
              </Field>
              <Field label="Tracking number (from buyer's label)">
                <Input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="9400…"
                />
              </Field>
            </div>
            {(r as unknown as { buyerLabelUrl?: string | null }).buyerLabelUrl ? (
              <p className="mt-2 font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                Label on file:{" "}
                <a
                  href={(r as unknown as { buyerLabelUrl: string }).buyerLabelUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-amber hover:text-amber-hi"
                >
                  Open ↗
                </a>
              </p>
            ) : (
              <p className="mt-2 text-caption text-error">
                No buyer label saved yet — go back and add the label URL on
                the shipping form above before releasing.
              </p>
            )}
          </Action>
        ) : null}

        {/* Migration 0025 — record an in-person pickup. Only renders
            when the request is on PICKUP and in READY_FOR_PICKUP. */}
        {actions.includes("mark_picked_up") ? (
          <Action
            title="Mark picked up"
            description="Record the in-person handoff. Status moves to DELIVERED, and the buyer gets a confirmation in the chat + email."
            cta="Mark picked up"
            disabled={post.isPending}
            onClick={() => {
              clear();
              post.mutate({ path: "/mark-picked-up", body: {} });
            }}
          />
        ) : null}

        {actions.length === 0 ? (
          <p className="text-body-sm text-text-muted">
            No further admin actions for this status.
          </p>
        ) : null}

        {/* Danger zone footer — cancel is always last and visually
            separated so it isn't reached for accidentally. */}
        {actions.includes("cancel") ? (
          <div className="mt-2 rounded-sm border border-error/30 bg-error/5 p-4">
            <h3 className="font-mono text-mono-label uppercase text-error">Danger zone</h3>
            <p className="mt-1 text-body-sm text-text-muted">
              Cancelling stops the workflow. Optionally refund the buyer&apos;s intake payment
              ({dollars(r.intakeTotalCents)}).
            </p>
            <div className="mt-3 flex flex-col gap-3">
              <Field label="Reason (audit log)">
                <Input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Why is this being cancelled?"
                />
              </Field>
              <div className="flex items-center gap-2 text-body-sm">
                <input
                  type="checkbox"
                  id={`refund-toggle-${id}`}
                  checked={issueRefund}
                  onChange={(e) => setIssueRefund(e.target.checked)}
                  className="h-4 w-4 accent-amber"
                />
                <label htmlFor={`refund-toggle-${id}`}>
                  Refund the buyer&apos;s intake payment ({dollars(r.intakeTotalCents)})
                </label>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={post.isPending || cancelReason.trim().length < 2}
                  onClick={() => {
                    clear();
                    post.mutate({
                      path: "/cancel",
                      body: { reason: cancelReason.trim(), issueRefund },
                    });
                  }}
                >
                  Cancel request
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Action({
  title,
  description,
  cta,
  onClick,
  disabled,
  danger,
  ctaTone,
  children,
}: {
  title: string;
  description: string;
  cta: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Overrides the button colour. Used by the Save shipping action to
   * flash green after a successful mutation. */
  ctaTone?: "success";
  children?: React.ReactNode;
}): JSX.Element {
  // Resolve the variant once so the JSX below stays readable. `ctaTone`
  // takes precedence over `danger` — the success flash is a transient
  // state and should override the default styling for that moment.
  const variant: "primary" | "danger" | "success" = ctaTone === "success"
    ? "success"
    : danger
      ? "danger"
      : "primary";
  return (
    <div className="rounded-sm border border-line bg-cream-soft p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-body font-semibold text-ink">{title}</h3>
          <p className="mt-1 text-body-sm text-text-muted">{description}</p>
        </div>
        <Button
          type="button"
          variant={variant === "success" ? "primary" : variant}
          size="sm"
          onClick={onClick}
          disabled={disabled}
          className={
            variant === "success"
              ? "border-success bg-success text-text-inv hover:bg-success/90"
              : undefined
          }
        >
          {cta}
        </Button>
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function statusActions(status: ShopperRequestStatus): Array<
  | "start"
  | "shipping"
  | "delivered_to_warehouse"
  | "ship"
  | "release_with_buyer_label"
  | "mark_picked_up"
  | "cancel"
> {
  switch (status) {
    case "AWAITING_INTAKE_PAYMENT":
      return ["cancel"];
    case "PAID":
      return ["start", "cancel"];
    case "PROCURING":
      // Phase 2 redesign — shipping form is always visible during
      // procurement. Auto-transition to AWAITING_DELIVERY happens
      // server-side when every line is purchased / unavailable.
      return ["shipping", "cancel"];
    case "AWAITING_DELIVERY":
      return ["shipping", "delivered_to_warehouse", "cancel"];
    case "AWAITING_RECONCILIATION":
      // Legacy bucket from before the redesign — pre-migration rows that
      // landed here can still be moved forward by editing shipping and
      // marking shipped.
      return ["shipping", "ship", "release_with_buyer_label", "cancel"];
    case "READY_TO_SHIP":
      // Three release paths from READY_TO_SHIP — the form renders all
      // three, but each is gated by the request's actual shipping
      // method on the server. Vendors only see the button that applies
      // to their flow.
      return ["ship", "release_with_buyer_label", "cancel"];
    case "READY_FOR_PICKUP":
      return ["mark_picked_up", "cancel"];
    case "SHIPPED":
      return ["cancel"];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Chat panel (admin side)
// ---------------------------------------------------------------------------

function ChatPanel({
  requestId,
  messages,
  onChange,
}: {
  requestId: string;
  messages: ShopperMessageSnapshot[];
  onChange: () => void;
}): JSX.Element {
  const [composer, setComposer] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const { bannerError, handle, clear } = useApiErrorHandler();

  const post = useMutation({
    mutationFn: () =>
      api.post<ShopperMessageSnapshot>(`/admin/shopper/${requestId}/messages`, {
        body: composer.trim(),
        attachmentUrls: attachments,
      }),
    onSuccess: () => {
      setComposer("");
      setAttachments([]);
      onChange();
    },
    onError: (err) => handle(err),
  });

  return (
    // The wrapper sets the height-clamp; this section just fills it. We
    // also need `min-h-0` so flex children can shrink — without it the
    // child message list can't trigger overflow because its computed
    // min-content height pushes the form out of the box.
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-line bg-white p-6">
      <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">Conversation</h2>

      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner error={bannerError} />
        </div>
      ) : null}

      <ol className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <li className="text-body-sm text-text-muted">No messages yet.</li>
        ) : (
          messages.map((m) => (
            <li
              key={m.id}
              className={
                m.sender === "ADMIN"
                  ? "ml-auto max-w-[85%] rounded-sm border border-amber/40 bg-amber/5 px-4 py-3"
                  : "mr-auto max-w-[85%] rounded-sm border border-line-strong bg-cream-soft px-4 py-3"
              }
            >
              <div className="font-mono text-mono-label uppercase text-text-muted">
                {m.sender === "ADMIN" ? "You" : "Buyer"} · {fmtTime(m.createdAt)}
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
          ))
        )}
      </ol>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          clear();
          // Body is required by the API schema even when attachments exist
          // — keep them aligned so the user gets a synchronous "type a
          // message" rather than a 400 round-trip.
          if (composer.trim().length === 0) return;
          post.mutate();
        }}
        className="mt-4 flex flex-col gap-3"
      >
        <textarea
          rows={3}
          maxLength={10000}
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          placeholder="Reply to buyer…"
          className="w-full rounded-sm border border-line-strong bg-cream-soft px-4 py-3 text-body text-text outline-none placeholder:text-text-subtle focus:border-ink focus:ring-2 focus:ring-ink/10"
        />
        <AttachmentUploader
          value={attachments}
          onChange={setAttachments}
          presignEndpoint={`/admin/shopper/${requestId}/uploads`}
          disabled={post.isPending}
        />
        <div className="flex items-center justify-between">
          <span className="font-mono text-mono-label uppercase text-text-muted">
            {composer.length}/10000
          </span>
          <Button
            type="submit"
            size="sm"
            disabled={
              (composer.trim().length === 0 && attachments.length === 0) || post.isPending
            }
            loading={post.isPending}
          >
            Send message
          </Button>
        </div>
      </form>
    </section>
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
    tone === "amber" ? "text-amber" : tone === "success" ? "text-success" : "text-ink";
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
