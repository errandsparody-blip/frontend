/**
 * reportClientError — fire-and-forget telemetry to the backend so a super-admin
 * can see what errors vendors hit in the browser, without logging into their
 * account. Posts to the authed ingest endpoint; every failure is swallowed so
 * reporting can never itself break the app or recurse through the error handler.
 */

import { api } from "@/lib/api-client";

export type ClientErrorKind =
  | "api_error"
  | "blocked_action"
  | "render_error"
  | "window_error"
  | "unhandled_rejection";

export interface ReportClientErrorInput {
  kind: ClientErrorKind;
  message: string;
  code?: string | null;
  statusCode?: number | null;
  path?: string | null;
  stack?: string | null;
  context?: Record<string, unknown>;
}

export function reportClientError(input: ReportClientErrorInput): void {
  try {
    const path =
      input.path ?? (typeof window !== "undefined" ? window.location.pathname : null);
    const context: Record<string, unknown> = {
      ...(input.context ?? {}),
      ...(typeof navigator !== "undefined" ? { userAgent: navigator.userAgent } : {}),
    };
    void api
      .post(
        "/telemetry/client-error",
        {
          kind: input.kind,
          message: String(input.message).slice(0, 2000),
          ...(input.code ? { code: String(input.code).slice(0, 200) } : {}),
          ...(typeof input.statusCode === "number" && input.statusCode >= 100
            ? { statusCode: input.statusCode }
            : {}),
          ...(path ? { path } : {}),
          ...(input.stack ? { stack: String(input.stack).slice(0, 8000) } : {}),
          context,
        },
        // Never trigger the refresh/retry machinery from a telemetry post.
        { noRefresh: true },
      )
      .catch(() => undefined);
  } catch {
    /* telemetry must never throw */
  }
}
