/**
 * API client. Wraps fetch with:
 *   - Bearer access token (held in memory, not localStorage)
 *   - Automatic 401 → /auth/refresh → retry once
 *   - Credentials: include for refresh cookie
 *   - Idempotency-Key support on writes
 *   - RFC 7807 problem-details parsing
 *
 * SINGLE-FLIGHT REFRESH:
 * When several parallel requests all get 401 simultaneously (typical on
 * admin landing pages that fire 3–5 queries on mount), we MUST NOT fire
 * 3–5 parallel refresh requests. The backend's refresh-token rotation
 * has theft detection — a second refresh arriving with the previous
 * (now rotated) token reads as a stolen-token replay and revokes every
 * active session for the user.
 *
 * `refreshInflight` holds the in-progress refresh promise; concurrent
 * 401-handlers await the same promise and reuse its result. Cleared in
 * a `finally` so a failed refresh doesn't permanently block future
 * attempts.
 */

let accessToken: string | null = null;
let refreshInflight: Promise<{ accessToken: string }> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Refresh the access token, single-flighted. Concurrent callers receive
 * the same promise. After settle (success or fail) the inflight slot is
 * cleared so the next 401 starts a fresh refresh.
 */
function refreshAccessToken(): Promise<{ accessToken: string }> {
  if (refreshInflight) return refreshInflight;
  refreshInflight = (async () => {
    try {
      return await request<{ accessToken: string }>("/auth/refresh", {
        method: "POST",
        noRefresh: true,
      });
    } finally {
      refreshInflight = null;
    }
  })();
  return refreshInflight;
}

export interface ApiError extends Error {
  status: number;
  code?: string;
  errors?: Record<string, string[]>;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  idempotencyKey?: string;
  /** Don't auto-retry on 401. Use for /auth/refresh itself. */
  noRefresh?: boolean;
}

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/v1";

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  headers.set("Accept", "application/json");
  if (opts.body !== undefined) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (opts.idempotencyKey) headers.set("Idempotency-Key", opts.idempotencyKey);

  const init: RequestInit = {
    ...opts,
    headers,
    credentials: "include",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  };

  const res = await fetch(`${baseUrl}${path}`, init);

  if (res.status === 401 && !opts.noRefresh && path !== "/auth/refresh") {
    // Try to refresh once. Single-flighted via `refreshAccessToken()` —
    // a parallel request that also got 401 will await the same promise
    // rather than firing its own /auth/refresh and tripping the backend's
    // rotated-token theft detection.
    try {
      const refreshed = await refreshAccessToken();
      setAccessToken(refreshed.accessToken);
      // Retry original request once.
      return request<T>(path, opts);
    } catch {
      throw await toApiError(res);
    }
  }

  if (!res.ok) {
    const err = await toApiError(res);
    // 412 from the AgreementVersionGuard — bounce the user to the
    // re-acceptance page so they're never stuck. We do this once per
    // failed request, ahead of any per-page error rendering, because no
    // amount of per-page UI improves the "you can't do anything until
    // you re-accept" state.
    if (
      typeof window !== "undefined" &&
      err.status === 412 &&
      err.code === "agreement_version_outdated" &&
      !window.location.pathname.startsWith("/legal/vendor-agreement")
    ) {
      window.location.assign("/legal/vendor-agreement?reaccept=1");
    }
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: { detail?: string; title?: string; code?: string; errors?: Record<string, string[]> } = {};
  try {
    body = await res.json();
  } catch {
    /* ignore parse failure */
  }
  const err = new Error(body.detail ?? body.title ?? `HTTP ${res.status}`) as ApiError;
  err.status = res.status;
  if (body.code) err.code = body.code;
  if (body.errors) err.errors = body.errors;
  return err;
}

/**
 * Triggers a streaming file download. Use for CSV / PDF endpoints.
 * Honors the same Bearer-token + 401-refresh path as `request()`.
 */
async function downloadFile(path: string, suggestedName: string): Promise<void> {
  const headers = new Headers();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  let res = await fetch(`${baseUrl}${path}`, { headers, credentials: "include" });

  if (res.status === 401) {
    // Single-flighted refresh — see the comment at the top of this file.
    const refreshed = await refreshAccessToken();
    setAccessToken(refreshed.accessToken);
    headers.set("Authorization", `Bearer ${refreshed.accessToken}`);
    res = await fetch(`${baseUrl}${path}`, { headers, credentials: "include" });
  }
  if (!res.ok) throw await toApiError(res);

  // Honor the server's filename if it sent one.
  const cd = res.headers.get("Content-Disposition") ?? "";
  const m = /filename="([^"]+)"/.exec(cd);
  const name = m?.[1] ?? suggestedName;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string, opts: RequestOptions = {}) => request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
    request<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  delete: <T>(path: string, opts: RequestOptions = {}) =>
    request<T>(path, { ...opts, method: "DELETE" }),
  download: downloadFile,
};
