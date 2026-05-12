"use client";

/**
 * PsnChatPanel — per-PSN chat thread used by both the vendor PSN detail
 * page and the admin receiving page.
 *
 * The same component renders both sides; a `role` prop decides which API
 * routes to call and which "self" / "them" label to apply:
 *
 *   vendor → /v1/psns/:id/messages          (sender side: VENDOR)
 *   admin  → /v1/admin/psns/:id/messages    (sender side: ADMIN)
 *
 * 12-second polling matches the shopper-thread cadence. On post-success
 * we invalidate the messages query so the new row lands instantly for
 * the sender; the other side picks it up on next poll AND via email.
 *
 * Tenant scoping is enforced server-side — vendors can only reach
 * /v1/psns/:id when they own the PSN, and admins are role-gated on
 * /v1/admin/psns/*. The component trusts that scoping and never
 * computes its own visibility check.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";
import { linkify } from "@/lib/linkify";

type Role = "vendor" | "admin";

interface PsnMessage {
  id: string;
  sender: "VENDOR" | "ADMIN";
  body: string;
  attachmentUrls: string[];
  createdAt: string;
  readByVendorAt: string | null;
  readByAdminAt: string | null;
}

function basePath(viewer: Role): string {
  return viewer === "admin" ? "/admin/psns" : "/psns";
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PsnChatPanel({
  psnId,
  viewer,
}: {
  psnId: string;
  viewer: Role;
}): JSX.Element {
  const qc = useQueryClient();
  const queryKey = ["psn", viewer, psnId, "messages"] as const;

  const messagesQ = useQuery({
    queryKey,
    queryFn: () => api.get<PsnMessage[]>(`${basePath(viewer)}/${psnId}/messages`),
    enabled: !!psnId,
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
  });

  // Auto-ack: whenever we render the list (or it changes), tell the
  // backend the unread messages from the other side are now "seen".
  // Fire-and-forget; failure here is inconsequential.
  useEffect(() => {
    if (!messagesQ.data || messagesQ.data.length === 0) return;
    void api
      .post(`${basePath(viewer)}/${psnId}/messages/read`)
      .then(() => {
        // Drop the per-tab unread-count badge on the sidebar so the
        // user doesn't have to refresh to see the badge clear.
        void qc.invalidateQueries({ queryKey: ["notifications", "unread-counts"] });
      })
      .catch(() => undefined);
  }, [messagesQ.data, psnId, viewer, qc]);

  const [composer, setComposer] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const { bannerError, handle, clear } = useApiErrorHandler();

  const post = useMutation({
    mutationFn: (payload: { body: string }) =>
      api.post<PsnMessage>(`${basePath(viewer)}/${psnId}/messages`, payload),
    onSuccess: () => {
      setComposer("");
      void qc.invalidateQueries({ queryKey });
    },
    onError: (err) => handle(err),
  });

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault();
    clear();
    if (composer.trim().length === 0) return;
    post.mutate({ body: composer.trim() });
  }

  // Which side label is "you" vs "them" depends on the role this panel
  // is rendering for. We compute it per-message; flipping role flips
  // every message's lane automatically.
  function isSelf(m: PsnMessage): boolean {
    return viewer === "admin" ? m.sender === "ADMIN" : m.sender === "VENDOR";
  }

  return (
    <section
      aria-label="PSN conversation"
      className="rounded-md border border-line bg-white p-6 md:p-8"
    >
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-mono text-mono-eyebrow uppercase tracking-[1.4px] text-amber">
            [ Conversation ]
          </div>
          <h2 className="mt-1 text-h3 font-semibold text-ink">
            Talk to {viewer === "admin" ? "the vendor" : "USA Errands"}
          </h2>
          <p className="mt-1 text-body-sm text-text-muted">
            Messages also go out by email so nothing gets missed.
          </p>
        </div>
      </header>

      {bannerError ? (
        <div className="mb-4">
          <ErrorBanner
            error={bannerError}
            onAction={(handler) => {
              if (handler === "retry") clear();
            }}
          />
        </div>
      ) : null}

      {messagesQ.isLoading ? (
        <p className="font-mono text-mono-label uppercase text-text-muted">Loading…</p>
      ) : !messagesQ.data || messagesQ.data.length === 0 ? (
        <p className="text-body-sm text-text-muted">
          No messages yet — start the conversation below.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {messagesQ.data.map((m) => (
            <li
              key={m.id}
              className={
                isSelf(m)
                  ? "ml-auto max-w-[80%] rounded-sm border border-line-strong bg-cream-soft px-4 py-3"
                  : "mr-auto max-w-[80%] rounded-sm border border-amber/40 bg-amber/5 px-4 py-3"
              }
            >
              <div className="font-mono text-mono-label uppercase text-text-muted">
                {isSelf(m) ? "You" : m.sender === "ADMIN" ? "USA Errands" : "Vendor"} ·{" "}
                {fmtTime(m.createdAt)}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-body text-text">
                {linkify(m.body)}
              </p>
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
          maxLength={10_000}
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          placeholder={
            viewer === "admin" ? "Reply to the vendor…" : "Send a message to USA Errands…"
          }
          className="w-full rounded-sm border border-line-strong bg-cream-soft px-4 py-3 text-body text-text outline-none placeholder:text-text-subtle focus:border-ink focus:ring-2 focus:ring-ink/10"
        />
        {/* v1: text-only chat. Vendors and admins can paste R2 / Drive
            URLs inline and the linkify helper renders them as click-
            through anchors. A dedicated PSN attachment uploader would
            need its own presign endpoint — out of scope for the first
            ship of this feature. */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-mono-label uppercase text-text-muted">
            {composer.length}/10000
          </span>
          <Button
            type="submit"
            variant="amber"
            size="md"
            disabled={composer.trim().length === 0 || post.isPending}
            loading={post.isPending}
          >
            {post.isPending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </section>
  );
}
