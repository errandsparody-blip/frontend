/**
 * Tiny global error-toast bus. Any error the app handles can "pop" a toast
 * notification that's fixed at the top of the screen, so a vendor sees it
 * immediately — no scrolling, no hunting for an inline message. The host
 * component (ErrorToastHost, mounted once in the root layout) subscribes here
 * and renders the stack. Decoupled via a module-level emitter so any
 * component's error handler can fire a toast without prop-drilling.
 */

export interface ErrorToast {
  id: number;
  message: string;
  /** Optional backend code, shown small for support reference. */
  code?: string;
}

type Listener = (toast: ErrorToast) => void;

const listeners = new Set<Listener>();
let nextId = 1;

/** Fire a toast. Safe to call from anywhere; no-ops if nothing is listening. */
export function showErrorToast(message: string, code?: string): void {
  const toast: ErrorToast = { id: nextId++, message: message.slice(0, 300), ...(code ? { code } : {}) };
  for (const l of listeners) {
    try {
      l(toast);
    } catch {
      /* a broken listener must not break the caller */
    }
  }
}

/** Subscribe to toasts. Returns an unsubscribe function. */
export function subscribeErrorToast(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
