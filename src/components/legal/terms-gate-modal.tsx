"use client";

/**
 * TermsGateModal — a scroll-to-accept agreement gate.
 *
 * Shows legal content in a scrollable panel; the "I agree" checkbox only
 * unlocks once the reader has scrolled to the bottom, and the accept button
 * only enables once the box is checked. Used for the buyer Terms of Service
 * (at checkout) and the vendor Storefront & Marketplace Policy (before going
 * live). Pure Tailwind, no dependencies.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function TermsGateModal({
  open,
  eyebrow,
  title,
  agreeLabel,
  acceptLabel = "Accept & continue",
  onAccept,
  onClose,
  children,
}: {
  open: boolean;
  eyebrow: string;
  title: string;
  agreeLabel: string;
  acceptLabel?: string;
  onAccept: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  // Portal to <body> so the fixed overlay escapes any transformed ancestor.
  // The checkout page wraps its content in `.ue-rise-in`, whose `animation:
  // … both` leaves a lingering `transform`, and a transformed ancestor makes
  // `position: fixed` anchor to THAT element instead of the viewport — which
  // centered this modal in the middle of the tall page (off-screen), so the
  // buyer couldn't reach the accept button without zooming the whole page.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Reset the gate each time the modal opens.
  useEffect(() => {
    if (open) {
      setReachedEnd(false);
      setAgreed(false);
    }
  }, [open]);

  // Lock body scroll + Escape to close while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReachedEnd(true);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-cream-soft shadow-2 sm:rounded-2xl">
        {/* Header */}
        <div className="border-b border-line px-6 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[2px] text-amber">{eyebrow}</div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">{title}</h2>
        </div>

        {/* Scrollable content */}
        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {/* Footer gate */}
        <div className="border-t border-line bg-white px-6 py-4">
          {!reachedEnd ? (
            <p className="mb-3 text-center text-[12px] text-text-subtle">
              Scroll to the end to continue.
            </p>
          ) : null}
          <label
            className={`flex items-start gap-3 ${reachedEnd ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
          >
            <input
              type="checkbox"
              disabled={!reachedEnd}
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-line text-ink focus:ring-ink"
            />
            <span className="text-[13px] leading-relaxed text-ink">{agreeLabel}</span>
          </label>
          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2 text-[13px] font-medium text-text-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!agreed}
              onClick={onAccept}
              className="rounded-full bg-ink px-6 py-2.5 text-[13px] font-semibold text-cream-soft transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {acceptLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
