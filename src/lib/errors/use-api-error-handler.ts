/**
 * useApiErrorHandler — the single entry point a form uses to surface
 * server errors. Wraps normalize() and routes the result to the right
 * place: per-field for `inline`, top-of-form banner for `banner`,
 * full-page for `page`.
 *
 * Usage in a form:
 *
 *   const form = useForm<X>({ ... });
 *   const { bannerError, handle, clear } = useApiErrorHandler(form);
 *
 *   <ErrorBanner error={bannerError} />
 *   ...
 *   handleSubmit(async (v) => {
 *     clear();
 *     try { await api.post(...) } catch (e) { handle(e) }
 *   })
 */

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

import { normalizeError, type NormalizedError } from "./normalize";

export interface ApiErrorHandler {
  /** Current banner-level error to render in the form. */
  bannerError: NormalizedError | null;
  /**
   * Process a thrown error. Inline field errors are pushed via
   * react-hook-form's setError. Banner errors land in bannerError.
   * Page-level errors trigger a navigation. Returns the normalized
   * shape so callers can branch on it (e.g., flip to step-up MFA).
   */
  handle: (err: unknown) => NormalizedError;
  /** Clear the current banner error (call on a new submit attempt). */
  clear: () => void;
}

export function useApiErrorHandler<TForm extends FieldValues>(
  form?: UseFormReturn<TForm>,
): ApiErrorHandler {
  const router = useRouter();
  const [bannerError, setBannerError] = useState<NormalizedError | null>(null);

  const clear = useCallback(() => setBannerError(null), []);

  const handle = useCallback(
    (err: unknown): NormalizedError => {
      const n = normalizeError(err);

      // Per-field inline errors get pushed to react-hook-form. Each call
      // to setError tags the field as `type: "server"` — the field
      // component renders the error text from form.formState.errors.
      if (n.fieldErrors && form) {
        for (const [field, msgs] of Object.entries(n.fieldErrors)) {
          if (msgs.length === 0) continue;
          form.setError(field as Path<TForm>, {
            type: "server",
            message: msgs[0]!,
          });
        }
      }

      // If the error has an explicit "this field" hint and we have a form,
      // push the message there too so the field renders red even when the
      // backend didn't return an `errors{}` map.
      if (n.surface === "inline" && n.entry.field && form) {
        form.setError(n.entry.field as Path<TForm>, {
          type: "server",
          message: n.entry.title,
        });
      }

      switch (n.surface) {
        case "banner":
          setBannerError(n);
          break;
        case "page":
          // Page-level errors take the user out of the current flow.
          // Default action: route to login if the entry says signin.
          if (n.entry.action?.handler === "signin") {
            router.push("/login");
          } else if (n.entry.action?.href) {
            router.push(n.entry.action.href);
          } else {
            // No explicit destination; surface as a banner instead so the
            // user isn't left staring at a blank screen.
            setBannerError(n);
          }
          break;
        case "inline":
          // Field-level — already pushed via setError above; nothing more to do.
          break;
        case "toast":
          // Toasts ride a separate channel; until ErrorToast lands, treat
          // them as banners so they're at least visible.
          setBannerError(n);
          break;
      }

      return n;
    },
    [form, router],
  );

  return { bannerError, handle, clear };
}
