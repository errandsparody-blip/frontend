"use client";

/**
 * ConfirmDialog — in-app replacement for `window.confirm()`.
 *
 * The native browser confirm popup says "www.myusaerrands.com says" and
 * looks nothing like the rest of the app. This component renders a
 * design-system-matched modal with the same call-and-response semantics
 * (user confirms or cancels), suitable for destructive actions like
 * removing a storage box, releasing a hold, or rejecting a PSN.
 *
 * Usage — controlled:
 *
 *   const [open, setOpen] = useState(false);
 *   ...
 *   <Button onClick={() => setOpen(true)}>Remove</Button>
 *   <ConfirmDialog
 *     open={open}
 *     onCancel={() => setOpen(false)}
 *     onConfirm={() => { removeM.mutate(...); setOpen(false); }}
 *     title="Remove this box from billing?"
 *     description="This is for boxes that have been physically consolidated out of the warehouse."
 *     confirmLabel="Remove"
 *     tone="danger"
 *   />
 *
 * Behaviour:
 *   - Locks body scroll while open.
 *   - ESC key + backdrop click trigger onCancel.
 *   - Confirm button autofocuses on open so keyboard users can press
 *     Enter to accept (the default action). Cancel is a tabstop away.
 *   - The `confirming` prop puts the Confirm button in a loading state
 *     so the caller can pass a mutation's pending flag in directly.
 */

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  /** When true, the dialog is mounted and visible. */
  open: boolean;
  /** Called when the user cancels (clicks Cancel, the backdrop, or hits ESC). */
  onCancel: () => void;
  /** Called when the user clicks the Confirm button. */
  onConfirm: () => void;
  /** Headline. Phrased as a question for confirmations. */
  title: string;
  /** Plain-text or React description rendered under the title. */
  description?: React.ReactNode;
  /** Label for the Confirm button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the Cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Tone for the Confirm button. "danger" for destructive actions. */
  tone?: "primary" | "amber" | "danger";
  /** When true, the Confirm button shows a loading spinner. */
  confirming?: boolean;
}

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  confirming = false,
}: ConfirmDialogProps): JSX.Element | null {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Body-scroll lock + ESC-to-cancel. Cleanup unbinds on close so the
  // listeners don't leak across re-renders.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !confirming) onCancel();
    };
    window.addEventListener("keydown", onKey);
    // Autofocus the Confirm button so Enter accepts without a tab.
    // Cancel is one tab away. Both meet WCAG focus-visible requirements.
    const t = window.setTimeout(() => confirmBtnRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, onCancel, confirming]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby={description ? "confirm-dialog-description" : undefined}
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8"
    >
      {/* Backdrop — click to cancel. Rendered as a button so screen
          readers describe the dismiss affordance. */}
      <button
        type="button"
        aria-label="Cancel and close dialog"
        onClick={() => {
          if (!confirming) onCancel();
        }}
        className="fixed inset-0 -z-10 cursor-default bg-ink/40"
      />

      <div
        className={cn(
          "relative w-full max-w-md rounded-md border bg-white shadow-xl",
          tone === "danger" ? "border-error/40" : "border-line-strong",
        )}
      >
        <div className="px-6 py-5">
          <h2
            id="confirm-dialog-title"
            className="text-h4 font-semibold leading-tight text-ink"
          >
            {title}
          </h2>
          {description ? (
            <p
              id="confirm-dialog-description"
              className="mt-2 text-body-sm text-text-muted"
            >
              {description}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-cream-soft px-6 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={confirming}
          >
            {cancelLabel}
          </Button>
          <Button
            ref={confirmBtnRef}
            variant={tone === "danger" ? "danger" : tone}
            size="sm"
            loading={confirming}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
