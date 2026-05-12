/**
 * Client-side HEIC → JPEG conversion.
 *
 * Background: every modern iPhone takes photos in HEIC by default. The
 * uploaders accept the MIME type, and R2 happily stores the bytes, but
 * `<img src="…heic">` doesn't render in Chrome / Firefox / Edge / Brave
 * on desktop or Android — only Safari natively decodes HEIC. So a
 * vendor on macOS Safari uploads and sees the image; the same vendor
 * on Chrome (or any admin operator reviewing the upload) sees nothing.
 *
 * Fix: convert HEIC files to JPEG in the browser before the presign +
 * R2 PUT happens. The thing that lands in storage is always a JPEG,
 * which every browser renders. iPhone vendors keep the seamless flow
 * they expect; nothing else changes.
 *
 * Implementation notes:
 *   - `heic2any` ships a libheif wasm bundle (~280 KB). We dynamic-
 *     import it only when an actual HEIC file shows up, so the bundle
 *     cost is paid on first HEIC upload and never on initial page
 *     load.
 *   - The library returns either a Blob (single image) or a Blob[]
 *     (multi-frame HEIC). We always take the first frame — multi-
 *     frame HEIC is rare from a phone camera and the second frame is
 *     a thumbnail at best.
 *   - On conversion failure we throw a typed error so the caller can
 *     surface a friendly message ("couldn't read this HEIC, try
 *     exporting as JPEG from Photos") instead of silently uploading
 *     something the browser can't display.
 *   - Quality 0.9 is the standard "visually identical to source"
 *     trade-off for JPEG; pushing higher just inflates file size.
 */

// Lazy type import — we never reach for the value at module load, but
// declaring the type at the top lets the dynamic-import path stay free
// of inline `typeof import(...)` annotations (which ESLint forbids).
import type Heic2AnyFn from "heic2any";

const JPEG_QUALITY = 0.9;

/**
 * Returns true for files we should preflight through HEIC conversion.
 * Accepts both the canonical MIME (`image/heic` / `image/heif`) and the
 * extension-based heuristic for browsers that pass through a generic
 * `application/octet-stream` for HEIC (Android Chrome on some devices).
 */
export function isHeicFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (mime === "image/heic" || mime === "image/heif") return true;
  // Fallback: filename extension. Some Android browsers misreport HEIC
  // as octet-stream; the extension is the only reliable signal in
  // that case.
  const name = (file.name || "").toLowerCase();
  return name.endsWith(".heic") || name.endsWith(".heif");
}

/**
 * Convert a HEIC/HEIF blob to a JPEG `File`. The returned file's name
 * has the original stem with a `.jpg` extension so a uploader that
 * uses the filename for the R2 key picks up the new extension. Throws
 * a `HeicConversionError` on failure.
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  // Dynamic import to keep heic2any (and its wasm payload) out of the
  // initial bundle. Next.js code-splits this on demand.
  let heic2any: typeof Heic2AnyFn;
  try {
    // The library's default export is the convert function. Cast away
    // the union type — we only use the single-blob path.
    const mod = (await import("heic2any")) as unknown as {
      default: typeof Heic2AnyFn;
    };
    heic2any = mod.default;
  } catch (err) {
    throw new HeicConversionError(
      "Couldn't load the HEIC converter. Refresh and try again, or export the photo as JPEG from your phone first.",
      err,
    );
  }

  let result: Blob | Blob[];
  try {
    result = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: JPEG_QUALITY,
    });
  } catch (err) {
    throw new HeicConversionError(
      "We couldn't read that HEIC file. Open it in Photos and use Share → Save As → JPEG, then upload the JPEG.",
      err,
    );
  }

  // `heic2any` returns Blob[] for multi-frame HEIC. We take frame 0 —
  // the second frame is typically a thumbnail and not useful.
  const blob = Array.isArray(result) ? result[0] : result;
  if (!blob || blob.size === 0) {
    throw new HeicConversionError("HEIC converter returned an empty image.");
  }

  // Swap the extension so the uploader's key generator picks up `.jpg`.
  const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg") || "image.jpg";
  return new File([blob], newName, {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}

/**
 * Distinguishes conversion-specific failures from generic upload
 * errors so callers can show a "convert and retry" message rather than
 * the network-friendly "try again later".
 */
export class HeicConversionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "HeicConversionError";
  }
}
