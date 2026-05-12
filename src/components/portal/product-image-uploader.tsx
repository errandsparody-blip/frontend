"use client";

/**
 * ProductImageUploader — single-image picker for the product form.
 *
 * Mirrors AttachmentUploader's presigned-PUT flow but renders a single
 * tile with a preview thumbnail. Picking a new image immediately uploads
 * to R2 (via POST /v1/products/uploads presign) and surfaces the public
 * URL through `onChange`. The clear button sets the value to `null` so
 * a PATCH to the API can clear the column.
 *
 * Why a separate component from AttachmentUploader?
 *   - Products store ONE image, not a gallery — different UX shape.
 *   - The preview tile is core to "is this the right image?" feedback.
 *   - MIME allow-list is stricter (no PDF) and the size cap is lower
 *     (10 MB vs 25 MB) since product images don't need PDF support.
 */

import { ImagePlus, Loader2, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { api } from "@/lib/api-client";

const ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/heic";
const ALLOWED = new Set(ACCEPT.split(","));
const MAX_BYTES = 10 * 1024 * 1024;

interface PresignResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  requiredHeaders: Record<string, string>;
  expiresAt: number;
}

interface Props {
  /** Current image URL, or null. */
  value: string | null;
  /** Called with the new URL after upload, or `null` after clear. */
  onChange: (next: string | null) => void;
  /** Disabled (e.g. while parent form is submitting). */
  disabled?: boolean;
}

export function ProductImageUploader({ value, onChange, disabled }: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    // Reset the input so re-selecting the same file fires onChange again.
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED.has(file.type)) {
      setStatus("error");
      setErrorMsg("Unsupported file type. Use JPG, PNG, WebP, GIF, or HEIC.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus("error");
      setErrorMsg(`File too large — max ${MAX_BYTES / (1024 * 1024)} MB.`);
      return;
    }

    setStatus("uploading");
    setErrorMsg(null);
    try {
      const presigned = await api.post<PresignResponse>("/products/uploads", {
        filename: file.name,
        contentType: file.type,
        contentLengthBytes: file.size,
      });

      // Bare fetch — `api.post` would attach our Bearer token to a
      // cross-origin R2 URL, which would 1) fail SigV4 verification on
      // R2's side and 2) leak the token. Same rationale as
      // AttachmentUploader.
      const putRes = await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: presigned.requiredHeaders,
        body: file,
      });
      if (!putRes.ok) {
        // R2 PUT can reject for a few reasons — CORS not configured on
        // the bucket, a presigned-URL signature mismatch, or the file
        // being clamped by the proxy. The status code is the most
        // useful first hint for triage.
        throw new Error(`R2 rejected the upload (HTTP ${putRes.status}).`);
      }

      onChange(presigned.publicUrl);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMsg(friendlyUploadError(err));
    }
  }

  /**
   * Map any error from the presign POST or the R2 PUT into a single
   * line a vendor can act on. The api-client throws errors with `status`
   * and (when the API returns ProblemDetails) `detail`. We special-case
   * the most common failure modes:
   *
   *   404 — endpoint doesn't exist yet on this deploy. Tells the
   *         operator to redeploy the API rather than puzzle over the
   *         raw NestJS "Cannot POST …" 404 body.
   *   503 — R2 isn't configured. Already returned with `code:
   *         r2_not_configured`; show it as-is.
   *   401/403 — auth / role mismatch.
   *   other — surface message + status so admins can copy it into a
   *         bug report.
   */
  function friendlyUploadError(err: unknown): string {
    if (!err) return "Upload failed — please try again.";
    const e =
      err instanceof Error
        ? (err as Error & { status?: number; code?: string; detail?: string })
        : (err as { status?: number; code?: string; message?: string; detail?: string });
    const status = (e as { status?: number }).status;
    const code = (e as { code?: string }).code;
    const message =
      (e as { message?: string }).message ?? (e as { detail?: string }).detail;

    if (status === 404) {
      return "Image uploads aren't available on the server yet. Ask the team to redeploy the API; the endpoint /v1/products/uploads is missing.";
    }
    if (status === 503 || code === "r2_not_configured") {
      return "Image uploads aren't configured for this environment. Contact support.";
    }
    if (status === 401 || status === 403) {
      return "You don't have permission to upload product images. Sign out and back in, or contact your account owner.";
    }
    const parts: string[] = [];
    if (status) parts.push(`HTTP ${status}`);
    if (code) parts.push(`[${code}]`);
    if (message) parts.push(message);
    return parts.length > 0 ? parts.join(" · ") : "Upload failed — please try again.";
  }

  // Trigger via button + programmatic .click() rather than `<label htmlFor>`
  // so focus doesn't transfer to the sr-only file input and scroll the
  // page. See AttachmentUploader for the original incident.
  function openPicker(): void {
    if (disabled || status === "uploading") return;
    inputRef.current?.click();
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={handlePick}
        disabled={disabled || status === "uploading"}
      />

      <div className="flex items-start gap-4">
        {/* Preview tile — 120×120 square. Empty state shows a dashed
            placeholder with an icon; populated state shows the image
            with a Clear button overlay. */}
        <div
          className={
            "relative flex h-[120px] w-[120px] shrink-0 items-center justify-center overflow-hidden rounded-md border " +
            (value ? "border-line bg-cream-soft" : "border-dashed border-line-strong bg-cream")
          }
        >
          {value ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value}
                alt="Product preview"
                className="h-full w-full object-cover"
                // Onerror: if the URL 404s (vendor deleted the object
                // out-of-band) we don't want a broken-image icon.
                // Replace with the placeholder. Hooking via onError so
                // we don't poll the URL every render.
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => {
                    onChange(null);
                    setStatus("idle");
                    setErrorMsg(null);
                  }}
                  aria-label="Remove image"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-error shadow-sm hover:bg-white"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : null}
            </>
          ) : (
            <ImagePlus className="h-10 w-10 text-text-subtle" aria-hidden />
          )}

          {status === "uploading" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-cream/80">
              <Loader2 className="h-6 w-6 animate-spin text-ink" aria-hidden />
            </div>
          ) : null}
        </div>

        {/* Controls + helper text — sit to the right of the tile so the
            form columns stay aligned with the rest of the fields. */}
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openPicker}
              disabled={disabled || status === "uploading"}
              aria-controls={inputId}
              className={
                "inline-flex h-9 items-center gap-2 rounded-sm border border-line-strong bg-white px-3 font-mono text-mono-label uppercase tracking-[1.2px] text-text hover:border-ink " +
                (disabled || status === "uploading"
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer")
              }
            >
              <ImagePlus className="h-3.5 w-3.5" aria-hidden />
              {value ? "Replace image" : "Upload image"}
            </button>
          </div>
          <p className="text-caption text-text-muted">
            Square images look best. JPG, PNG, WebP, GIF, or HEIC. Max 10 MB.
          </p>
          {status === "error" && errorMsg ? (
            <p className="text-caption text-error" role="alert">
              {errorMsg}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
