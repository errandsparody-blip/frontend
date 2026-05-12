"use client";

/**
 * AttachmentUploader — file picker that presigns + uploads to R2, then
 * surfaces the resulting public URLs back to the parent.
 *
 * Used by both the buyer thread composer and the admin chat composer. The
 * `presignEndpoint` prop differs between them (the public token-scoped URL
 * vs the admin request-scoped URL); everything else — MIME allow-list,
 * size cap, the chip rendering, and the R2 PUT — is shared.
 *
 * Flow per file:
 *   1. POST `presignEndpoint` with { filename, contentType, contentLengthBytes }
 *      → { uploadUrl, publicUrl, requiredHeaders }
 *   2. PUT the binary directly to `uploadUrl` with `requiredHeaders`
 *   3. Add `publicUrl` to the parent's value array via onChange
 *
 * Failures at any step keep the existing chips in place and surface a
 * per-file error inline. We intentionally don't retry — the user can re-pick.
 */

import { Paperclip, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { api } from "@/lib/api-client";

const ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/heic,application/pdf";
const ALLOWED = new Set(ACCEPT.split(","));
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

interface PresignResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  requiredHeaders: Record<string, string>;
  expiresAt: number;
}

interface UploadingFile {
  id: string;
  name: string;
  status: "uploading" | "error";
  error?: string;
}

interface AttachmentUploaderProps {
  /** Currently attached public URLs (controlled by parent). */
  value: string[];
  onChange: (next: string[]) => void;
  /** API path that issues the presigned URL (e.g. `/shopper/r/${token}/uploads`). */
  presignEndpoint: string;
  /** Optional disable (e.g. while the parent message is sending). */
  disabled?: boolean;
}

export function AttachmentUploader({
  value,
  onChange,
  presignEndpoint,
  disabled,
}: AttachmentUploaderProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  const [pending, setPending] = useState<UploadingFile[]>([]);

  function pruneById(id: string): void {
    setPending((p) => p.filter((f) => f.id !== id));
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file later
    if (files.length === 0) return;

    // Per-batch validation
    const remaining = MAX_ATTACHMENTS - value.length - pending.length;
    const accepted = files.slice(0, Math.max(remaining, 0));

    for (const file of accepted) {
      const id = `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`;

      if (!ALLOWED.has(file.type)) {
        setPending((p) => [
          ...p,
          { id, name: file.name, status: "error", error: "Unsupported file type" },
        ]);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setPending((p) => [
          ...p,
          { id, name: file.name, status: "error", error: "Too large (max 25 MB)" },
        ]);
        continue;
      }

      setPending((p) => [...p, { id, name: file.name, status: "uploading" }]);

      try {
        const presigned = await api.post<PresignResponse>(presignEndpoint, {
          filename: file.name,
          contentType: file.type,
          contentLengthBytes: file.size,
        });

        // Use bare fetch — `api.post` would attach our Bearer token to a
        // cross-origin R2 URL, which would fail (and leak the token).
        const putRes = await fetch(presigned.uploadUrl, {
          method: "PUT",
          headers: presigned.requiredHeaders,
          body: file,
        });

        if (!putRes.ok) {
          throw new Error(`Upload rejected (${putRes.status})`);
        }

        // Mutually exclude with concurrent uploads — only this file's id
        // gets pruned, and only this file's URL is appended.
        pruneById(id);
        onChange([...value, presigned.publicUrl]);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Upload failed — please try again.";
        setPending((p) =>
          p.map((f) => (f.id === id ? { ...f, status: "error", error: msg } : f)),
        );
      }
    }
  }

  function removeAttached(url: string): void {
    onChange(value.filter((u) => u !== url));
  }

  const remaining = MAX_ATTACHMENTS - value.length - pending.length;
  const canAddMore = remaining > 0 && !disabled;

  return (
    <div className="flex flex-col gap-2">
      <input
        id={fileInputId}
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        onChange={handlePick}
        disabled={!canAddMore}
      />

      {/* Chips for attached + pending */}
      {(value.length > 0 || pending.length > 0) && (
        <ul className="flex flex-wrap gap-2">
          {value.map((url) => (
            <li
              key={url}
              className="inline-flex items-center gap-2 rounded-sm border border-line-strong bg-cream-soft px-2 py-1 text-body-sm"
            >
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="font-mono text-mono-label uppercase text-amber underline-offset-2 hover:underline"
              >
                {filenameFromUrl(url)}
              </a>
              <button
                type="button"
                onClick={() => removeAttached(url)}
                className="text-text-muted hover:text-error"
                aria-label="Remove attachment"
                disabled={disabled}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {pending.map((p) => (
            <li
              key={p.id}
              className={
                "inline-flex items-center gap-2 rounded-sm border px-2 py-1 text-body-sm " +
                (p.status === "error"
                  ? "border-error bg-error/10 text-error"
                  : "border-line-strong bg-cream-soft text-text-muted")
              }
            >
              <span className="font-mono text-mono-label uppercase">
                {p.status === "uploading" ? "Uploading…" : "Failed"}
              </span>
              <span className="max-w-[160px] truncate">{p.name}</span>
              {p.status === "error" ? (
                <button
                  type="button"
                  onClick={() => pruneById(p.id)}
                  className="text-error/70 hover:text-error"
                  aria-label="Dismiss error"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {p.status === "error" && p.error ? (
                <span className="ml-1 text-caption">{p.error}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        {/*
          Trigger via a button + programmatic .click() rather than
          <label htmlFor>. Reason: the file input is positioned absolutely
          via Tailwind's `sr-only` utility (off-screen at the parent's
          origin). A label-htmlFor click transfers focus to that input,
          and the browser scrolls to bring the focused element into view —
          which manifests as the whole admin shopper page jumping up
          whenever admin clicks Attach. Calling .click() on the ref
          doesn't change focus, so no scroll happens.
        */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            inputRef.current?.click();
          }}
          disabled={!canAddMore}
          aria-controls={fileInputId}
          className={
            "inline-flex h-9 items-center gap-2 rounded-sm border border-line-strong bg-cream px-3 font-mono text-mono-label uppercase tracking-[1.2px] text-text hover:border-ink " +
            (canAddMore ? "cursor-pointer" : "cursor-not-allowed opacity-50")
          }
        >
          <Paperclip className="h-3.5 w-3.5" /> Attach
        </button>
        <span className="font-mono text-mono-label uppercase text-text-muted">
          {value.length + pending.length}/{MAX_ATTACHMENTS} · max 25 MB · images / PDF
        </span>
      </div>
    </div>
  );
}

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "attachment";
    // The R2 keys we generate are random IDs — show a friendlier label.
    return last.length > 24 ? `${last.slice(0, 8)}…${last.slice(-8)}` : last;
  } catch {
    return "attachment";
  }
}
