/**
 * Wire the catalog's unknown-code tracker to Sentry.
 *
 * Why: every time the API ships an error code that the frontend's catalog
 * hasn't been updated for, the user sees a generic "something went wrong"
 * banner. We want to know that's happening so we can fill the gap. The
 * catalog already exposes a `setUnknownErrorCodeTracker()` injection point
 * — this module connects it to Sentry's `captureMessage()` so
 * unknown codes show up as `info`-level events with the code as a tag.
 *
 * Sampling — every unknown code is captured. The cardinality is bounded by
 * the number of distinct codes the backend ever emits, which is small. If
 * a misbehaving server starts ping-ponging the same unknown code, Sentry's
 * own dedup will roll the events up.
 *
 * Idempotent — `installErrorTelemetry()` can be called multiple times
 * without doubling up handlers. We track the install state in a module
 * scope flag.
 */

import * as Sentry from "@sentry/nextjs";

import { setUnknownErrorCodeTracker } from "./catalog";
import { reportClientError } from "./report";

let installed = false;

export function installErrorTelemetry(): void {
  if (installed) return;
  installed = true;

  // Uncaught JS errors + unhandled promise rejections → admin error log, so a
  // page that silently breaks for a vendor leaves a trace the super-admin can
  // see without logging in. Both are best-effort and swallow their own
  // failures (reportClientError never throws).
  if (typeof window !== "undefined") {
    window.addEventListener("error", (ev) => {
      // Skip resource-load errors (missing image/script) — those have an
      // empty message and no Error object, and aren't actionable here.
      const msg = ev.message || (ev.error instanceof Error ? ev.error.message : "");
      if (!msg) return;
      reportClientError({
        kind: "window_error",
        message: msg,
        ...(ev.error instanceof Error ? { stack: ev.error.stack } : {}),
        context: { filename: ev.filename, lineno: ev.lineno, colno: ev.colno },
      });
    });
    window.addEventListener("unhandledrejection", (ev) => {
      const reason = ev.reason;
      const msg =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Unhandled promise rejection";
      reportClientError({
        kind: "unhandled_rejection",
        message: msg,
        ...(reason instanceof Error ? { stack: reason.stack } : {}),
      });
    });
  }

  setUnknownErrorCodeTracker((code, detail) => {
    // Capture as `info` rather than `error` — an unknown code is a gap in
    // our catalog, not a runtime failure. The user already saw a generic
    // banner; we just want the dev signal to add the code.
    Sentry.captureMessage(`Unknown error code: ${code}`, {
      level: "info",
      tags: { error_code: code, source: "frontend_catalog" },
      // The detail string is fine to include — the API filter strips
      // stack traces from 5xx responses, and lower-status problems carry
      // user-safe copy. The Sentry beforeSend scrubber further strips any
      // PII keys we missed.
      extra: detail ? { detail } : undefined,
    });

    // Also keep the dev-time console warning so the gap is loud in local
    // development, not silently absorbed by Sentry.
    if (process.env.NODE_ENV !== "production" && typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(
        `[errors] unknown code "${code}". Add it to src/lib/errors/catalog.ts.`,
        { detail },
      );
    }
  });
}
