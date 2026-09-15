/**
 * Client-side image compressor. Downscales an image to a sensible max dimension
 * and re-encodes it to WebP so uploads (and therefore the marketplace) stay
 * light without visibly losing quality. Runs in the browser via <canvas>; on any
 * failure or unsupported type it returns the original file unchanged.
 *
 * Why here (upload time) in addition to Next/Image (serve time): shrinking at the
 * source keeps stored originals small (cheaper storage + fewer/cheaper on-the-fly
 * optimizations) and helps every consumer of the public URL, not just <Image>.
 */

export interface CompressOptions {
  /** Longest edge, in px. Product photos rarely need more than this. */
  maxDim?: number;
  /** WebP quality 0–1. 0.82 keeps photos crisp at a fraction of PNG size. */
  quality?: number;
}

const COMPRESSIBLE = /^image\/(jpeg|png|webp)$/; // skip gif (animation) + svg

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const maxDim = opts.maxDim ?? 1600;
  const quality = opts.quality ?? 0.82;

  if (typeof document === "undefined") return file;
  if (!COMPRESSIBLE.test(file.type)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (!blob) return file;

    // If we didn't downscale AND the re-encode isn't smaller, keep the original
    // (e.g. an already-optimized WebP). When we DID downscale, the smaller
    // dimensions are the win even if bytes are close, so we keep the result.
    if (scale === 1 && blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], name, { type: "image/webp", lastModified: Date.now() });
  } catch {
    return file; // never block an upload on compression
  }
}
