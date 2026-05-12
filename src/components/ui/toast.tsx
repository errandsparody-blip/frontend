"use client";

/**
 * Toast notification system — provider + hook + stack UI.
 *
 * Mounted once near the root of every app shell (admin portal, vendor
 * portal, marketing layout). Anywhere in the tree you can call
 * `useToast().show({ ... })` to drop a toast in the bottom-right
 * corner of the viewport.
 *
 * Design direction:
 *   - Cream + ink + amber, matching the rest of the design system.
 *   - Severity tones: info (ink), success (green), warning (amber),
 *     error (red). Each gets a left-border accent + dot.
 *   - Slide in from the right with a small lift, fade out on dismiss.
 *   - Auto-dismiss after 5 s by default; sticky toasts pass
 *     `durationMs: 0`. Hovering a toast pauses its timer so the user
 *     has time to read it.
 *   - Stack vertically, newest at the bottom.
 *   - Tap-anywhere-on-the-toast dismisses; the inline action button
 *     stops propagation so callers can route on click.
 *   - Respects `prefers-reduced-motion` (snap-in instead of slide).
 *
 * No third-party toast lib — bundle stays small and we control the
 * styling end-to-end.
 */

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type ToastSeverity = "info" | "success" | "warning" | "error";

export interface ToastInput {
  /** Short heading, mandatory. */
  title: string;
  /** Optional supporting line. Max ~120 chars renders cleanly. */
  body?: string;
  /** Severity drives the colour accent. Defaults to "info". */
  severity?: ToastSeverity;
  /** Auto-dismiss after N ms. Default 5 000; pass 0 to require manual dismiss. */
  durationMs?: number;
  /**
   * Optional action button rendered on the right of the toast. The
   * button label is `action.label`; clicking it invokes `action.onClick`
   * and (unless `keepOpen: true`) dismisses the toast.
   */
  action?: {
    label: string;
    onClick: () => void;
    keepOpen?: boolean;
  };
  /**
   * Dedupe key. If a toast with the same key is already open, the new
   * call replaces its content + resets the timer instead of stacking
   * a second copy. Keep keys short and stable.
   */
  dedupeKey?: string;
}

interface ToastEntry extends ToastInput {
  id: string;
  /** Tracks whether the toast is mid-dismiss for the leave animation. */
  leaving: boolean;
}

interface ToastContextValue {
  show: (t: ToastInput) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 5000;
// Time the slide-out animation runs before the toast unmounts. Must
// stay in sync with the CSS transition duration on the toast root.
const EXIT_ANIMATION_MS = 200;

export function ToastProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  // Per-toast timer ids so we can clear/reset on hover or dedupe.
  const timersRef = useRef<Map<string, number>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t != null) {
      window.clearTimeout(t);
      timersRef.current.delete(id);
    }
  }, []);

  const scheduleAutoDismiss = useCallback(
    (id: string, ms: number) => {
      clearTimer(id);
      if (ms <= 0) return; // sticky
      const handle = window.setTimeout(() => {
        // Start the leave animation; actual removal happens after
        // EXIT_ANIMATION_MS so the user sees the fade-out.
        setToasts((cur) =>
          cur.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
        );
        window.setTimeout(() => {
          setToasts((cur) => cur.filter((t) => t.id !== id));
          timersRef.current.delete(id);
        }, EXIT_ANIMATION_MS);
      }, ms);
      timersRef.current.set(id, handle);
    },
    [clearTimer],
  );

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((cur) =>
        cur.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
      );
      window.setTimeout(() => {
        setToasts((cur) => cur.filter((t) => t.id !== id));
      }, EXIT_ANIMATION_MS);
    },
    [clearTimer],
  );

  const dismissAll = useCallback(() => {
    for (const t of toasts) clearTimer(t.id);
    setToasts((cur) => cur.map((t) => ({ ...t, leaving: true })));
    window.setTimeout(() => setToasts([]), EXIT_ANIMATION_MS);
  }, [clearTimer, toasts]);

  const show = useCallback(
    (input: ToastInput): string => {
      const duration = input.durationMs ?? DEFAULT_DURATION_MS;
      // Dedupe — same key → replace content + reset timer rather than
      // stack a duplicate. Useful for "new notification" toasts that
      // could otherwise pile up if 10 events fire in a tight window.
      if (input.dedupeKey) {
        const existing = toasts.find(
          (t) => t.dedupeKey === input.dedupeKey && !t.leaving,
        );
        if (existing) {
          setToasts((cur) =>
            cur.map((t) =>
              t.id === existing.id ? { ...t, ...input, leaving: false } : t,
            ),
          );
          scheduleAutoDismiss(existing.id, duration);
          return existing.id;
        }
      }

      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((cur) => [
        ...cur,
        {
          ...input,
          severity: input.severity ?? "info",
          id,
          leaving: false,
        },
      ]);
      scheduleAutoDismiss(id, duration);
      return id;
    },
    [scheduleAutoDismiss, toasts],
  );

  // Clean up timers on unmount — prevents stray callbacks firing on a
  // dead component if the provider is ever swapped out.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) window.clearTimeout(t);
      timers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ show, dismiss, dismissAll }),
    [show, dismiss, dismissAll],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack
        toasts={toasts}
        onDismiss={dismiss}
        onHoverStart={(id) => clearTimer(id)}
        onHoverEnd={(id, ms) => scheduleAutoDismiss(id, ms)}
      />
    </ToastContext.Provider>
  );
}

/**
 * Read access to the toast stack. Throws if used outside the provider —
 * a missing toast provider is a wiring bug we want to catch loudly, not
 * silently swallow.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Stack + Item
// ---------------------------------------------------------------------------

const SEVERITY_TONE: Record<
  ToastSeverity,
  { border: string; dot: string; Icon: typeof Info }
> = {
  info: { border: "border-l-ink", dot: "bg-ink", Icon: Info },
  success: { border: "border-l-success", dot: "bg-success", Icon: CheckCircle2 },
  warning: { border: "border-l-amber", dot: "bg-amber", Icon: AlertTriangle },
  error: { border: "border-l-error", dot: "bg-error", Icon: XCircle },
};

function ToastStack({
  toasts,
  onDismiss,
  onHoverStart,
  onHoverEnd,
}: {
  toasts: ReadonlyArray<ToastEntry>;
  onDismiss: (id: string) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: (id: string, ms: number) => void;
}): JSX.Element | null {
  if (toasts.length === 0) return null;
  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      // Bottom-right anchor. `pointer-events-none` on the wrapper means
      // clicks pass through the empty space between toasts; each
      // individual toast re-enables pointer events.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-end gap-3 px-4 py-6 sm:px-6"
    >
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          toast={t}
          onDismiss={onDismiss}
          onHoverStart={onHoverStart}
          onHoverEnd={onHoverEnd}
        />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
  onHoverStart,
  onHoverEnd,
}: {
  toast: ToastEntry;
  onDismiss: (id: string) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: (id: string, ms: number) => void;
}): JSX.Element {
  const tone = SEVERITY_TONE[toast.severity ?? "info"];
  const Icon = tone.Icon;
  const remainingMs = toast.durationMs ?? DEFAULT_DURATION_MS;

  function handleActionClick(e: React.MouseEvent): void {
    e.stopPropagation();
    if (!toast.action) return;
    toast.action.onClick();
    if (!toast.action.keepOpen) onDismiss(toast.id);
  }

  return (
    <div
      role="status"
      // Re-enable pointer events on the actual toast surface. The
      // dedicated dismiss button is the only click target — we don't
      // wire click-anywhere-to-dismiss because the toast usually
      // contains an Action button, and accidental dismissals while
      // reaching for it are worse UX than requiring the X.
      // Hover handlers pause the auto-dismiss timer so the user has
      // time to read longer toast bodies; mouse-leave reschedules it.
      className={`pointer-events-auto w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-l-4 ${tone.border} border-line bg-white shadow-2 transition-all duration-200 ease-out ${
        toast.leaving
          ? "translate-x-2 opacity-0"
          : "translate-x-0 opacity-100"
      }`}
      onMouseEnter={() => onHoverStart(toast.id)}
      onMouseLeave={() => onHoverEnd(toast.id, remainingMs)}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div
          aria-hidden
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${tone.dot}/10`}
        >
          <Icon className={`h-3.5 w-3.5 text-${toast.severity ?? "info"}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-body-sm font-semibold text-ink">
            {toast.title}
          </div>
          {toast.body ? (
            <p className="mt-0.5 text-body-sm text-text-muted">{toast.body}</p>
          ) : null}
          {toast.action ? (
            <button
              type="button"
              onClick={handleActionClick}
              className="mt-2 inline-flex font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
            >
              {toast.action.label} →
            </button>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={() => onDismiss(toast.id)}
          className="shrink-0 text-text-subtle hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
