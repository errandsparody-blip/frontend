/**
 * Error catalog — single source of truth for user-facing copy.
 *
 * Every backend error code that lands on the wire goes here. Codes are the
 * contract; copy is the surface. The backend's `detail` is a fallback for
 * codes the catalog hasn't been updated for yet, never the primary text.
 *
 * Adding a new code? Three rules:
 *   1. Title is bold, one line, ≤ 6 words. State what happened, not what
 *      the system did. "Email or password is incorrect" — not "Auth failed".
 *   2. Body answers two questions: what happened, what to do next. Avoid
 *      "Please try again" — say what to actually try.
 *   3. Surface defaults to "banner". Use "inline" only if the error is
 *      tied to one form field. Use "toast" only for transient global
 *      events (network blips during background fetches).
 *
 * Owner: see docs/error-handling-plan.md.
 */

export type ErrorSurface = "banner" | "toast" | "inline" | "page";

export interface ErrorAction {
  /** Button label (sentence case, ≤ 4 words). */
  label: string;
  /** If set, the action is a link to this href. */
  href?: string;
  /** If set, a key the calling page resolves to a callback (retry, signin, support, …). */
  handler?: "retry" | "signin" | "signup" | "support" | "verifyEmail" | "topUp";
}

export interface ErrorEntry {
  title: string;
  body: string;
  action?: ErrorAction;
  surface?: ErrorSurface;
  /** When surface=inline, which form field this error attaches to. */
  field?: string;
  /**
   * When true, and the backend supplied a `detail` string, show that
   * detail as the body instead of the static `body` above. Use for
   * codes where the backend message carries the actionable content —
   * e.g. a carrier's own rejection reason ("recipient phone number is
   * required") that we can't know ahead of time. The static `body`
   * stays as the fallback for when no detail is present.
   */
  preferDetail?: boolean;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
//
// Codes are namespaced by domain to avoid collisions. The list mirrors the
// codes thrown across the backend (see usa-errands-api grep:
// `code:\s*"[a-z_]+"` for the full source set). New codes are added here in
// the same patch that adds them to the backend.

export const errorCatalog: Record<string, ErrorEntry> = {
  // ──────────────────────────────────────────────────────────────────────
  // Auth — account credentials, email verification, locks
  // ──────────────────────────────────────────────────────────────────────
  auth_invalid_credentials: {
    title: "Email or password is incorrect",
    body: "Double-check your details and try again. After 5 failed attempts we'll lock the account for 15 minutes.",
    action: { label: "Forgot password?", href: "/forgot-password" },
  },
  auth_locked: {
    title: "Account temporarily locked",
    body: "Too many failed sign-in attempts. Try again in 15 minutes, or reset your password to unlock now.",
    action: { label: "Reset password", href: "/forgot-password" },
  },
  auth_email_unverified: {
    title: "Verify your email first",
    body: "We sent a verification link to your inbox when you signed up. Open it to continue.",
    action: { label: "Resend verification", handler: "verifyEmail" },
  },
  auth_account_inactive: {
    title: "This account isn't active",
    body: "Your account is suspended or closed. Contact support if you think this is a mistake.",
    action: { label: "Contact support", handler: "support" },
  },
  signup_conflict: {
    // Should not normally surface (we plan to migrate signup to "always
    // succeed" so attackers can't enumerate). Kept for backward compat.
    title: "Couldn't create the account",
    body: "If you already have an account with this email, try signing in instead.",
    action: { label: "Sign in", handler: "signin" },
  },
  verify_invalid: {
    title: "That code is invalid or has expired",
    body: "Verification codes are 8 digits and expire after 15 minutes. Request a fresh one and try again.",
    action: { label: "Resend code", handler: "verifyEmail" },
    surface: "inline",
    field: "code",
  },
  refresh_missing: {
    title: "Your session has expired",
    body: "Please sign in again to continue.",
    action: { label: "Sign in", handler: "signin" },
    surface: "page",
  },

  // ──────────────────────────────────────────────────────────────────────
  // MFA
  // ──────────────────────────────────────────────────────────────────────
  mfa_required: {
    title: "Authenticator code required",
    body: "Enter the 6-digit code from your authenticator app.",
  },
  mfa_invalid: {
    title: "That code didn't match",
    body: "Open your authenticator app and enter the most recent 6-digit code. Codes refresh every 30 seconds.",
    surface: "inline",
    field: "code",
  },
  mfa_recovery_invalid: {
    title: "Recovery code invalid",
    body: "Each recovery code can be used only once. Try a different one from the list you saved during enrollment.",
    surface: "inline",
    field: "recoveryCode",
  },
  mfa_not_enrolled: {
    title: "Two-factor authentication isn't set up",
    body: "Sign in and complete enrollment first.",
    action: { label: "Sign in", handler: "signin" },
  },
  mfa_enroll_code_invalid: {
    title: "Enrollment code didn't match",
    body: "Make sure your authenticator's clock is correct. If it persists, re-scan the QR code.",
    surface: "inline",
    field: "code",
  },

  // ──────────────────────────────────────────────────────────────────────
  // Wallet + ledger
  // ──────────────────────────────────────────────────────────────────────
  insufficient_funds: {
    title: "Wallet balance is too low",
    body: "Top up your wallet, then retry.",
    action: { label: "Add funds", handler: "topUp" },
  },
  wallet_invalid_amount: {
    title: "That amount isn't valid",
    body: "Enter a positive whole-cent amount (e.g., 5000 = $50.00).",
    surface: "inline",
    field: "amount",
  },

  // ──────────────────────────────────────────────────────────────────────
  // Orders / fulfillment
  // ──────────────────────────────────────────────────────────────────────
  address_rejected: {
    title: "We couldn't validate that address",
    body: "Check the street, city, state, and ZIP. P.O. boxes are accepted; APO/FPO is not.",
    surface: "inline",
    field: "shipAddress",
  },
  order_carrier_unavailable: {
    title: "No carriers can ship this order right now",
    body: "This usually clears within a few minutes. Try again, or contact support if it persists.",
    action: { label: "Retry", handler: "retry" },
  },

  // ──────────────────────────────────────────────────────────────────────
  // Fulfillment v2 — pack / rate / label (admin rate picker)
  //
  // These carry a backend-composed `detail` that names the real reason
  // (usually a carrier's own words — "recipient phone number required",
  // "address not found"). `preferDetail` surfaces that verbatim instead
  // of a canned line, so an operator can act on it without digging
  // through logs. The static `body` is the no-detail fallback.
  // ──────────────────────────────────────────────────────────────────────
  label_purchase_failed: {
    title: "Carrier refused the label",
    body: "The carrier rejected this shipment. Check the recipient phone, address, and box details, then re-fetch rates and try again.",
    preferDetail: true,
  },
  shippo_no_rates: {
    title: "No carrier rates came back",
    body: "No carrier returned a rate for this parcel and destination. The recipient phone or address is the usual cause — edit the recipient, then re-fetch rates.",
    preferDetail: true,
  },
  order_no_rates_available: {
    title: "No carrier rates came back",
    body: "No carrier returned a rate for the packed dimensions and destination. Verify the box measurements and recipient details, then re-fetch.",
    preferDetail: true,
  },
  shippo_purchase_failed: {
    title: "Carrier couldn't buy the label",
    body: "The carrier accepted the rate but failed to issue the label. Re-fetch rates and pick again; if it repeats, the recipient details are likely the cause.",
    preferDetail: true,
  },
  shippo_purchase_incomplete: {
    title: "Label came back incomplete",
    body: "The carrier reported success but didn't return a tracking number or label. Re-fetch rates and try again.",
    preferDetail: true,
  },
  shippo_bad_request: {
    title: "Carrier rejected the request",
    body: "The shipping provider rejected the request. Check the recipient phone and address, then try again.",
    preferDetail: true,
  },
  shippo_unavailable: {
    title: "Shipping provider is unavailable",
    body: "The shipping provider is temporarily unreachable. Wait a moment and try again.",
    action: { label: "Retry", handler: "retry" },
  },
  shippo_intl_unsupported: {
    title: "Destination not supported",
    body: "We ship from the US to US and Canada addresses only. Check the destination country.",
    preferDetail: true,
  },
  shippo_not_configured: {
    title: "Shipping isn't configured here",
    body: "This environment has no shipping-provider key set. Contact support — this is on our end.",
    action: { label: "Contact support", handler: "support" },
  },
  select_rate_write_failed: {
    title: "Couldn't record the rate selection",
    body: "A database write was rejected while selecting the rate. This usually means migrations are behind on this environment.",
    preferDetail: true,
    action: { label: "Contact support", handler: "support" },
  },
  label_bought_state_stale: {
    title: "Label bought — order not updated",
    body: "The label was purchased and the vendor charged, but the order status didn't advance. Contact support with the correlation id so the order can be moved forward manually — do NOT retry.",
    preferDetail: true,
    action: { label: "Contact support", handler: "support" },
  },
  order_not_ready_for_selection: {
    title: "Order isn't ready for a rate",
    body: "Fetch rates first, then pick one. Refresh the page if the status looks stale.",
    preferDetail: true,
  },
  order_not_ready_for_rates: {
    title: "Order isn't ready for rates",
    body: "The order needs to be packed before rates can be fetched. Refresh the page if the status looks stale.",
    preferDetail: true,
  },
  order_not_packed: {
    title: "Order isn't packed yet",
    body: "Record the box dimensions and weight on the pack queue before fetching rates.",
    preferDetail: true,
  },
  rate_not_in_cache: {
    title: "That rate has expired",
    body: "Re-fetch rates and pick again — the cached options were cleared (usually after a pack or recipient edit).",
    action: { label: "Retry", handler: "retry" },
  },
  order_declared_value_required_international: {
    title: "Declared value is missing",
    body: "This international order has a $0.00 declared value, but customs needs a real one. Set the declared value on the product(s), then re-fetch rates.",
    preferDetail: true,
  },
  order_declared_value_required_insurance: {
    title: "Declared value is missing",
    body: "Insurance was requested but the order's declared value is $0.00. Set the product declared value or remove the insurance add-on, then re-fetch rates.",
    preferDetail: true,
  },
  order_vendor_carrier_no_label: {
    title: "Vendor is using their own carrier",
    body: "This order has no platform label to rate or buy — the vendor brought their own carrier.",
    preferDetail: true,
  },
  recipient_edit_locked: {
    title: "Recipient can't be edited now",
    body: "The shipping charge and any label are already bound to the current address. Send the order back to the pack queue, or force-cancel it, to change the recipient.",
    preferDetail: true,
  },
  pack_write_failed: {
    title: "Couldn't save the pack details",
    body: "A database write was rejected. This usually means migrations haven't been applied on this environment.",
    preferDetail: true,
    action: { label: "Contact support", handler: "support" },
  },
  order_total_exceeds_max: {
    title: "Order total exceeds the per-order cap",
    body: "Split the order into multiple shipments, or contact support to raise the limit on your account.",
    action: { label: "Contact support", handler: "support" },
  },
  order_insufficient_stock: {
    title: "Not enough stock for one or more SKUs",
    body: "Reduce the quantity or remove the affected line. Updated inventory is shown below.",
    surface: "inline",
  },
  order_sku_inactive: {
    title: "That SKU is no longer active",
    body: "Reactivate it on the SKU page or remove the line from the order.",
    surface: "inline",
  },
  order_invalid_sku: {
    title: "Unknown SKU on this order",
    body: "Remove the line and pick a SKU from your active catalog.",
    surface: "inline",
  },
  order_external_ref_duplicate: {
    title: "Duplicate external reference",
    body: "An order with this external reference already exists. Use a unique reference per order.",
    surface: "inline",
    field: "externalRef",
  },
  order_not_cancellable: {
    title: "This order can't be cancelled",
    body: "Cancellation is only allowed before pick. If it's already shipped, file a return instead.",
  },
  idempotency_key_required: {
    // The frontend should always supply one — if this surfaces, the
    // frontend has a bug. Show something safe but actionable.
    title: "Couldn't process the request safely",
    body: "Refresh the page and try again. If it keeps happening, contact support.",
    action: { label: "Retry", handler: "retry" },
  },

  // ──────────────────────────────────────────────────────────────────────
  // PSN (pre-shipment notice)
  // ──────────────────────────────────────────────────────────────────────
  psn_negotiated_tier: {
    title: "Pallet pricing needs a quote",
    body: "Pallet boxes are priced per-vendor. Contact support to set up your rate, then resubmit.",
    action: { label: "Contact support", handler: "support" },
  },
  psn_tier_misconfigured: {
    // Operational gap (a tier was added to the schema but not yet to the
    // fee schedule on this environment). User-facing copy is the same as
    // the negotiated case — they need support either way — but the code
    // is distinct so we can tell them apart in Sentry.
    title: "We need to set up your rate",
    body: "One of the tiers you declared isn't priced on this environment yet. Contact support and we'll have it ready in minutes.",
    action: { label: "Contact support", handler: "support" },
  },
  fee_schedule_missing: {
    title: "Pricing is being configured",
    body: "Our fee schedule isn't loaded on this environment. Contact support — this is on our end, not yours.",
    action: { label: "Contact support", handler: "support" },
  },
  agreement_version_outdated: {
    // 412 from the AgreementVersionGuard. The api-client already redirects
    // the browser to /legal/vendor-agreement?reaccept=1, so this catalog
    // entry is mostly a fallback for SSR / non-browser callers.
    title: "Agreement update required",
    body: "Our terms have been updated. Review and re-accept the latest agreement to keep using your account.",
  },
  agreement_version_mismatch: {
    title: "Agreement was updated",
    body: "The terms changed while this page was open. Reload to see the latest agreement and accept it.",
  },
  agreement_version_missing: {
    title: "Agreement is being configured",
    body: "We haven't published an agreement version on this environment yet. Contact support — this is on our end.",
    action: { label: "Contact support", handler: "support" },
  },
  psn_not_editable: {
    title: "This PSN is no longer editable",
    body: "Once a PSN is submitted it can only be edited by an admin during receiving.",
  },
  psn_not_draft: {
    title: "PSN already submitted",
    body: "You can't resubmit a PSN. Create a new one for additional inventory.",
  },
  psn_already_received: {
    title: "PSN already received",
    body: "This PSN was checked in. Create a new PSN for additional inventory.",
  },
  psn_invalid_product: {
    title: "Unknown product on this PSN",
    body: "Remove the line and pick a product from your catalog.",
    surface: "inline",
  },
  psn_wrong_status: {
    title: "Action not allowed in this state",
    body: "The PSN's current status doesn't permit this action.",
  },
  psn_line_unknown: {
    title: "PSN line not found",
    body: "Refresh the page; the PSN may have been edited in another window.",
  },
  psn_overreceive: {
    title: "Received more than declared",
    body: "Confirm the count or update the declared quantity to match what arrived.",
    surface: "inline",
  },

  // ──────────────────────────────────────────────────────────────────────
  // Returns
  // ──────────────────────────────────────────────────────────────────────
  return_order_not_returnable: {
    title: "This order can't be returned",
    body: "Returns are only available for shipped orders within the return window.",
  },
  return_invalid_order_line: {
    title: "Order line not found on this return",
    body: "Pick lines that belong to the original order.",
    surface: "inline",
  },
  return_qty_exceeds_order: {
    title: "Return quantity exceeds the order",
    body: "Reduce the quantity to at most what was originally shipped.",
    surface: "inline",
  },
  return_not_cancellable: {
    title: "This return can't be cancelled",
    body: "Once items are received we process them through the return workflow rather than cancel.",
  },
  return_not_receivable: {
    title: "Return not in a receivable state",
    body: "Refresh and try again — the return may have already been received elsewhere.",
  },
  return_overreceive: {
    title: "Received more than the return covers",
    body: "Reduce the received quantity or open a new return for the extra.",
    surface: "inline",
  },
  return_not_inspectable: {
    title: "Return not in an inspectable state",
    body: "Receive it first, then inspect.",
  },
  return_disposition_exceeds_received: {
    title: "Disposition counts exceed received",
    body: "The total of restock + dispose + investigate must equal the received quantity.",
    surface: "inline",
  },

  // ──────────────────────────────────────────────────────────────────────
  // Team / invitations
  // ──────────────────────────────────────────────────────────────────────
  team_email_in_use: {
    title: "Email already on your team",
    body: "There's already an active or pending member with this email.",
    surface: "inline",
    field: "email",
  },
  team_invite_pending: {
    title: "Invitation already pending",
    body: "There's a pending invite for this email. Resend or revoke it from the team page.",
    surface: "inline",
    field: "email",
  },
  team_invite_not_revocable: {
    title: "Invitation can't be revoked",
    body: "It's already been accepted, expired, or revoked.",
  },
  team_invite_invalid: {
    title: "Invitation link is invalid",
    body: "It may have already been used. Ask the inviter to send a fresh one.",
    surface: "page",
  },
  team_invite_not_pending: {
    title: "Invitation isn't pending",
    body: "This invite was already accepted, revoked, or expired.",
    surface: "page",
  },
  team_invite_expired: {
    title: "Invitation has expired",
    body: "Invitations are valid for 7 days. Ask the inviter to send a new one.",
    surface: "page",
  },

  // ──────────────────────────────────────────────────────────────────────
  // KYC / vendor lifecycle
  // ──────────────────────────────────────────────────────────────────────
  kyc_not_submittable: {
    title: "KYC can't be submitted right now",
    body: "Your account is already approved or in review. Refresh to see the latest status.",
  },
  kyc_needs_social_handles: {
    title: "Add at least one handle first",
    body: "Add an Instagram, TikTok, X handle, or business website so our reviewers have something to verify.",
    action: { label: "Add details", href: "/verification" },
  },
  vendor_no_social_handles: {
    title: "Vendor has no social handles",
    body: "Ask the vendor to add at least one handle before marking social as verified.",
  },
  vendor_already_approved: {
    title: "Vendor is already approved",
    body: "Reject the KYC first if you need to undo the approval.",
  },
  vendor_closed: {
    title: "Account is closed",
    body: "Closed accounts can't be modified.",
  },
  vendor_profile_admin_only: {
    title: "Only the vendor admin can edit this",
    body: "Sub-users can view but not change account settings.",
  },
  vendor_agreement_admin_only: {
    title: "Only the vendor admin can accept the agreement",
    body: "Sub-users can't sign on behalf of the business.",
  },
  vendor_kyc_admin_only: {
    title: "Only the vendor admin can submit KYC",
    body: "Sub-users can fill out details but the admin must submit.",
  },
  kyc_payload_invalid: {
    title: "We couldn't process that KYC update",
    body: "Try again. If it persists, contact support.",
  },

  // ──────────────────────────────────────────────────────────────────────
  // Tenant / scoping
  // ──────────────────────────────────────────────────────────────────────
  tenant_required: {
    title: "Vendor scope missing",
    body: "Sign in again to refresh your account context.",
    action: { label: "Sign in", handler: "signin" },
    surface: "page",
  },

  // ──────────────────────────────────────────────────────────────────────
  // Products / SKUs / config
  // ──────────────────────────────────────────────────────────────────────
  product_code_taken: {
    title: "That product code is already in use",
    body: "Pick a different code, or edit the existing product.",
    surface: "inline",
    field: "code",
  },
  product_variant_locked: {
    title: "Variant can't change once stock has been received",
    body: "The variant is part of the SKU id format. Archive this product and create a new one with the new variant instead.",
    surface: "inline",
    field: "variant",
  },
  month_invalid: {
    title: "Invalid month format",
    body: "Use YYYY-MM (e.g., 2026-05).",
    surface: "inline",
    field: "month",
  },
  validation_failed: {
    title: "Some fields need a fix",
    body: "Check the highlighted fields and try again.",
  },

  // ──────────────────────────────────────────────────────────────────────
  // Integrations
  // ──────────────────────────────────────────────────────────────────────
  easypost_signature_invalid: {
    title: "Webhook signature failed",
    body: "Internal — visible to operators only. The webhook source did not authenticate.",
  },

  // ──────────────────────────────────────────────────────────────────────
  // Synthetic transport-layer codes (set by normalize.ts, not the backend)
  // ──────────────────────────────────────────────────────────────────────
  network_offline: {
    title: "You're offline",
    body: "Check your internet connection and try again.",
    action: { label: "Retry", handler: "retry" },
  },
  network_timeout: {
    title: "The request took too long",
    body: "Retry in a moment. If it keeps happening, check status.myusaerrands.com.",
    action: { label: "Retry", handler: "retry" },
  },
  network_5xx: {
    title: "Something went wrong on our end",
    body: "We've been notified. Try again in a moment, or contact support if it persists.",
    action: { label: "Retry", handler: "retry" },
  },
  network_cors_or_blocked: {
    title: "Couldn't reach our server",
    body: "Your browser blocked the request. Check your connection or any extensions that block requests.",
    action: { label: "Retry", handler: "retry" },
  },
  rate_limited: {
    title: "Too many requests",
    body: "Slow down a moment, then try again.",
    action: { label: "Retry", handler: "retry" },
  },

  // ──────────────────────────────────────────────────────────────────────
  // Default fallback (used when normalize hits an unmapped code)
  // ──────────────────────────────────────────────────────────────────────
  unknown: {
    title: "Something went wrong",
    body: "Try again. If it keeps happening, contact support.",
    action: { label: "Contact support", handler: "support" },
  },
};

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Telemetry hook for unknown codes. Production wires this to the analytics
 * pipeline so we can find out which codes are slipping through with the
 * generic fallback. Default is a console.warn — acceptable in dev,
 * unobtrusive in prod.
 *
 * Wire a real implementation by reassigning `trackUnknownErrorCode` from
 * the analytics module on app boot.
 */
export let trackUnknownErrorCode: (code: string, detail?: string) => void = (
  code,
  detail,
) => {
  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.warn(
      `[errors] unknown code "${code}". Add it to src/lib/errors/catalog.ts.`,
      { detail },
    );
  }
};

export function setUnknownErrorCodeTracker(
  fn: (code: string, detail?: string) => void,
): void {
  trackUnknownErrorCode = fn;
}

/**
 * Look up an error entry by code. Falls back to a generic entry if the
 * code is missing or unknown — and pings the unknown-code tracker so we
 * can fill the gap.
 */
export function lookupErrorEntry(
  code: string | undefined,
  detail?: string,
): ErrorEntry {
  if (code && Object.prototype.hasOwnProperty.call(errorCatalog, code)) {
    const entry = errorCatalog[code]!;
    // Codes flagged preferDetail carry their actionable content in the
    // backend `detail` (e.g. a carrier's own rejection words). Show that
    // verbatim, keeping the catalog title. Cap generously — these
    // messages can be a full sentence or two — but not unbounded.
    if (entry.preferDetail && detail && detail.trim().length > 0) {
      return { ...entry, body: detail.length <= 600 ? detail : `${detail.slice(0, 600)}…` };
    }
    return entry;
  }
  if (code) trackUnknownErrorCode(code, detail);
  return {
    ...errorCatalog.unknown!,
    // If the backend gave us a useful detail string, prefer it over the
    // generic body — the developer wrote it for a reason. We trust the
    // backend not to leak internals (the 5xx filter strips stack traces).
    body: detail && detail.length < 400 ? detail : errorCatalog.unknown!.body,
  };
}
