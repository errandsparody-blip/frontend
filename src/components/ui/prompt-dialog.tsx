"use client";

/**
 * PromptDialog — in-app replacement for `window.prompt()`.
 *
 * Same design-system modal as ConfirmDialog, but with a text field. Used where
 * an action needs a short note (e.g. a return reason, a decline note). Confirm
 * is disabled until the field is non-empty when `required` is set.
 */
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PromptDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (value: string) => void;
  title: string;
  description?: React.ReactNode;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "amber" | "danger";
  /** When true, Confirm stays disabled until the field has content. */
  required?: boolean;
  /** Render a multi-line textarea instead of a single-line input. */
  multiline?: boolean;
  confirming?: boolean;
}

export function PromptDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  placeholder,
  defaultValue = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  required = false,
  multiline = false,
  confirming = false,
}: PromptDialogProps): JSX.Element | null {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue(defaultValue);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !confirming) onCancel();
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
    // defaultValue intentionally excluded — reset only when the dialog (re)opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onCancel, confirming]);

  if (!open) return null;

  const canConfirm = !required || value.trim().length > 0;
  const inputCls =
    "mt-3 w-full rounded-md border border-line-strong bg-white px-3 py-2 text-body-sm text-ink outline-none focus:border-ink";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-dialog-title"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8"
    >
      <button
        type="button"
        aria-label="Cancel and close dialog"
        onClick={() => { if (!confirming) onCancel(); }}
        className="fixed inset-0 -z-10 cursor-default bg-ink/40"
      />
      <div
        className={cn(
          "relative w-full max-w-md rounded-md border bg-white shadow-xl",
          tone === "danger" ? "border-error/40" : "border-line-strong",
        )}
      >
        <div className="px-6 py-5">
          <h2 id="prompt-dialog-title" className="text-h4 font-semibold leading-tight text-ink">
            {title}
          </h2>
          {description ? <p className="mt-2 text-body-sm text-text-muted">{description}</p> : null}
          {multiline ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              rows={3}
              className={inputCls}
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className={inputCls}
            />
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line bg-cream-soft px-6 py-3">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={confirming}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : tone}
            size="sm"
            loading={confirming}
            disabled={!canConfirm}
            onClick={() => onConfirm(value.trim())}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
