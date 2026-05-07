/**
 * API client. Wraps fetch with:
 *   - Bearer access token (held in memory, not localStorage)
 *   - Automatic 401 → /auth/refresh → retry once
 *   - Credentials: include for refresh cookie
 *   - Idempotency-Key support on writes
 *   - RFC 7807 problem-details parsing
 */

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
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
    // Try to refresh once.
    try {
      const refreshed = await request<{ accessToken: string }>("/auth/refresh", {
        method: "POST",
        noRefresh: true,
      });
      setAccessToken(refreshed.accessToken);
      // Retry original request once.
      return request<T>(path, opts);
    } catch {
      throw await toApiError(res);
    }
  }

  if (!res.ok) throw await toApiError(res);
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
    // Try to refresh once.
    const refreshed = await request<{ accessToken: string }>("/auth/refresh", {
      method: "POST",
      noRefresh: true,
    });
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
