"use client";

/**
 * ProductGalleryUploader — multi-image picker for a storefront listing / variant.
 *
 * Reuses ProductImageUploader's presign → R2 PUT flow (POST /v1/products/uploads),
 * but manages an ORDERED list of image URLs: the first is the primary (shown on
 * cards), the rest fill the product-page gallery. Vendors can add images, remove
 * one, or promote any image to primary. `onChange` fires with the full ordered
 * array so the parent can persist it via the listing PATCH (imageUrls).
 */
import { ImagePlus, Loader2, Star, X } from "lucide-react";
import { useRef, useState } from "react";

import { api } from "@/lib/api-client";
import { compressImage } from "@/lib/compress-image";
import { convertHeicToJpeg, HeicConversionError, isHeicFile } from "@/lib/heic-to-jpeg";

const ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/heic";
const ALLOWED = new Set(ACCEPT.split(","));
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 10;

interface PresignResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  requiredHeaders: Record<string, string>;
  expiresAt: number;
}

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

export function ProductGalleryUploader({ value, onChange, disabled }: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const atCap = value.length >= MAX_IMAGES;

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    if (!ALLOWED.has(picked.type) && !isHeicFile(picked)) {
      setStatus("error");
      setErrorMsg("Unsupported file type. Use JPG, PNG, WebP, GIF, or HEIC.");
      return;
    }
    if (picked.size > MAX_BYTES) {
      setStatus("error");
      setErrorMsg(`File too large — max ${MAX_BYTES / (1024 * 1024)} MB.`);
      return;
    }
    setStatus("uploading");
    setErrorMsg(null);
    try {
      let file = picked;
      if (isHeicFile(picked)) {
        file = await convertHeicToJpeg(picked);
        if (file.size > MAX_BYTES) {
          setStatus("error");
          setErrorMsg(`Converted JPEG is too large — max ${MAX_BYTES / (1024 * 1024)} MB.`);
          return;
        }
      }
      // Downscale + re-encode to WebP so gallery images stay light.
      file = await compressImage(file);

      const presigned = await api.post<PresignResponse>("/products/uploads", {
        filename: file.name,
        contentType: file.type,
        contentLengthBytes: file.size,
      });
      const putRes = await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: presigned.requiredHeaders,
        body: file,
      });
      if (!putRes.ok) throw new Error(`R2 rejected the upload (HTTP ${putRes.status}).`);
      onChange([...value, presigned.publicUrl].slice(0, MAX_IMAGES));
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof HeicConversionError ? err.message : friendlyUploadError(err));
    }
  }

  function friendlyUploadError(err: unknown): string {
    const e = (err ?? {}) as { status?: number; code?: string; message?: string; detail?: string };
    if (e.status === 404) return "Image uploads aren't available on the server yet — ask the team to redeploy the API.";
    if (e.status === 503 || e.code === "r2_not_configured") return "Image uploads aren't configured for this environment.";
    if (e.status === 401 || e.status === 403) return "You don't have permission to upload product images.";
    return [e.status ? `HTTP ${e.status}` : null, e.message ?? e.detail].filter(Boolean).join(" · ") || "Upload failed — please try again.";
  }

  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const makePrimary = (i: number) => {
    if (i === 0) return;
    const next = [...value];
    const [img] = next.splice(i, 1);
    next.unshift(img!);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={handlePick}
        disabled={disabled || status === "uploading" || atCap}
      />
      <div className="flex flex-wrap items-center gap-2">
        {value.map((src, i) => (
          <div
            key={src + i}
            className={`relative h-16 w-16 overflow-hidden rounded-md border ${i === 0 ? "border-ink" : "border-line"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.3")} />
            {i === 0 ? (
              <span className="absolute left-0 top-0 bg-ink px-1 text-[8px] font-semibold uppercase tracking-wide text-cream-soft">
                Main
              </span>
            ) : null}
            {!disabled ? (
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/40 px-0.5">
                <button type="button" title="Make main" onClick={() => makePrimary(i)} className="text-white/90 hover:text-white">
                  <Star className="h-3 w-3" aria-hidden />
                </button>
                <button type="button" title="Remove" onClick={() => remove(i)} className="text-white/90 hover:text-white">
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {!atCap ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || status === "uploading"}
            className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-line-strong text-text-subtle hover:border-ink disabled:opacity-50"
            aria-label="Add image"
          >
            {status === "uploading" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ImagePlus className="h-5 w-5" aria-hidden />}
          </button>
        ) : null}
      </div>
      {status === "error" && errorMsg ? (
        <p className="text-caption text-error" role="alert">{errorMsg}</p>
      ) : (
        <p className="text-caption text-text-muted">First image is the main one. Up to {MAX_IMAGES}. JPG/PNG/WebP/GIF/HEIC, max 10 MB.</p>
      )}
    </div>
  );
}
