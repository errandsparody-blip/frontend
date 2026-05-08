/**
 * normalize() — turn anything caught in a `catch` into a NormalizedError
 * the UI can render directly. The shape is small on purpose: the calling
 * code shouldn't need to switch on more than a few cases.
 *
 * Inputs we expect to land here:
 *   - ApiError from src/lib/api-client.ts (RFC 7807 problem-details parsed)
 *   - DOMException / TypeError from a fetch that never reached the server
 *     (offline, DNS failure, blocked CORS preflight). These show up as
 *     `TypeError: Failed to fetch` in Chrome and Firefox.
 *   - 408 / 504 (timeouts), 429 (rate limit), 5xx (server side)
 *   - Anything else — we fall back to the generic "unknown" code so the
 *     unknown-code telemetry sink picks it up.
 *
 * Surface decision rules:
 *   - status >= 500 or transport failure  → banner with Retry CTA
 *   - status === 429                      → banner with Retry + Retry-After hint
 *   - status === 401 with no `code`       → page (session expired)
 *   - 4xx with `errors{}` and no actionable code → inline (per-field)
 *   - 4xx with `code` from catalog        → use catalog's surface
 *   - 4xx without `code`                  → banner, generic
 */

import type { ApiError } from "@/lib/api-client";

import { errorCatalog, lookupErrorEntry, type ErrorEntry, type ErrorSurface } from "./catalog";

export interface NormalizedError {
  /** Where the UI should put this error. */
  surface: ErrorSurface;
  /** Title + body + optional action. Always present. */
  entry: ErrorEntry;
  /** Per-field validation errors, when the API supplied them. */
  fieldErrors?: Record<string, string[]>;
  /** Server status code (4xx/5xx) when known. Synthetic codes are 0. */
  status?: number;
  /** Backend-supplied `code` (or synthetic `network_*`). */
  code: string;
  /** Correlation id from the RFC 7807 body, when present. */
  correlationId?: string;
  /** The original error, kept for Sentry breadcrumbs. */
  cause: unknown;
}

// ---------------------------------------------------------------------------

interface ApiErrorLike {
  status: number;
  code?: string;
  message?: string;
  errors?: Record<string, string[]>;
  correlationId?: string;
}

function isApiErrorLike(err: unknown): err is ApiErrorLike {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { status?: unknown }).status === "number"
  );
}

/**
 * `TypeError: Failed to fetch` is what every modern browser throws when the
 * fetch call never gets a response — offline, DNS, blocked preflight, CORS.
 * We can't distinguish these without the actual response, but we can
 * separate "browser is offline" from "everything else" via navigator.onLine.
 */
function isFetchFailure(err: unknown): boolean {
  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("failed to fetch") ||
      msg.includes("network error") ||
      msg.includes("load failed")
    );
  }
  // Some browsers wrap fetch failures in DOMException with name "AbortError"
  // or "NetworkError".
  if (err instanceof DOMException) {
    return err.name === "NetworkError" || err.name === "AbortError";
  }
  return false;
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

// ---------------------------------------------------------------------------

export function normalizeError(err: unknown): NormalizedError {
  // Transport failure: never reached the server.
  if (isFetchFailure(err)) {
    const code = isOffline() ? "network_offline" : "network_cors_or_blocked";
    return {
      surface: "banner",
      entry: lookupErrorEntry(code),
      code,
      status: 0,
      cause: err,
    };
  }

  if (!isApiErrorLike(err)) {
    // Truly unknown — could be a programming bug. Log it as such so the
    // caller can decide what to do, but still hand back something
    // renderable.
    return {
      surface: "banner",
      entry: lookupErrorEntry("unknown"),
      code: "unknown",
      cause: err,
    };
  }

  const status = err.status;
  const code = err.code;
  const detail = err.message;
  const fieldErrors = err.errors;
  const correlationId = err.correlationId;

  // 5xx + unknown server failures.
  //
  // If the backend gave us a stable `code` AND that code exists in the
  // catalog, prefer the catalog entry for that code over the generic
  // `network_5xx` copy. Some 500s are operational ("fee_schedule_missing",
  // "psn_tier_misconfigured") where we have actionable user-facing copy
  // ready — the user shouldn't see "something went wrong on our end" if
  // we can tell them "pricing is being configured" instead. Codes that
  // aren't in the catalog still fall through to network_5xx, and the
  // missing-code telemetry sink will surface them in Sentry.
  if (status >= 500) {
    const knownEntry =
      code && Object.prototype.hasOwnProperty.call(errorCatalog, code)
        ? lookupErrorEntry(code, detail)
        : null;
    return {
      surface: "banner",
      entry: knownEntry ?? lookupErrorEntry("network_5xx", detail),
      code: code ?? "network_5xx",
      status,
      ...(fieldErrors ? { fieldErrors } : {}),
      ...(correlationId ? { correlationId } : {}),
      cause: err,
    };
  }

  // 429 — rate limited.
  if (status === 429) {
    return {
      surface: "banner",
      entry: lookupErrorEntry("rate_limited", detail),
      code: code ?? "rate_limited",
      status,
      ...(correlationId ? { correlationId } : {}),
      cause: err,
    };
  }

  // 408 / 504 — timeouts.
  if (status === 408 || status === 504) {
    return {
      surface: "banner",
      entry: lookupErrorEntry("network_timeout", detail),
      code: code ?? "network_timeout",
      status,
      ...(correlationId ? { correlationId } : {}),
      cause: err,
    };
  }

  // 401 without a code: the session is gone or never existed. Push to login.
  // 401 WITH a code (e.g., auth_invalid_credentials) is a real auth-flow
  // signal and should render where the calling form puts it.
  if (status === 401 && !code) {
    return {
      surface: "page",
      entry: lookupErrorEntry("refresh_missing"),
      code: "refresh_missing",
      status,
      cause: err,
    };
  }

  // Catalog-driven decision for known 4xx codes.
  const entry = lookupErrorEntry(code, detail);
  const surface: ErrorSurface =
    entry.surface ??
    // Fields hint → inline. No code + has errors object → inline. Else banner.
    (fieldErrors ? "inline" : "banner");

  return {
    surface,
    entry,
    code: code ?? "unknown",
    status,
    ...(fieldErrors ? { fieldErrors } : {}),
    ...(correlationId ? { correlationId } : {}),
    cause: err,
  };
}

/**
 * Convenience type guard the calling code can use when it needs to decide
 * between a Sentry-worthy error and ordinary user traffic.
 */
export function isUnexpected(n: NormalizedError): boolean {
  return (
    n.code === "unknown" ||
    n.code === "network_5xx" ||
    n.code === "network_cors_or_blocked" ||
    (n.status !== undefined && n.status >= 500)
  );
}

/** Re-exports so callers only need to import from one place. */
export type { ApiError };
