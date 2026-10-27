"use client";

/**
 * useFormDraft — client-side autosave for long entry forms.
 *
 * Keeps an in-progress form snapshot in localStorage so that if the vendor
 * is logged out, reloads, or the browser crashes mid-entry, they can resume
 * exactly where they stopped. localStorage (not sessionStorage) is used
 * deliberately: it survives tab close, browser restart, and session loss —
 * which is the whole point of the feature.
 *
 * Design:
 *   - Keyed per-user AND per-form (`ue_draft_v1:<form>:<userId>`), so one
 *     user's draft never leaks to another on a shared machine, and the order
 *     draft never collides with the return draft.
 *   - Generic over the snapshot type `T`. The caller passes the current
 *     serialisable `value` (built from react-hook-form `watch()` and/or plain
 *     `useState`) and applies a resumed snapshot itself via `resume()`. This
 *     keeps the hook agnostic to how each form stores its state.
 *   - Autosave is debounced and only begins AFTER the user has acted on any
 *     found draft (resumed or discarded) — so the pristine initial render can
 *     never clobber a saved draft before the user decides. A pristine/empty
 *     value is never saved (see `isEmpty`), so merely opening a form doesn't
 *     create a phantom draft.
 *   - `clear()` is called on successful submit to drop the draft.
 *
 * All storage access is wrapped and SSR-safe (guards `typeof window`), and
 * failures (quota, private mode) are swallowed — autosave is best-effort and
 * must never break the form.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PREFIX = "ue_draft_v1";

interface StoredDraft<T> {
  v: 1;
  savedAt: number;
  data: T;
}

function keyFor(form: string, userId: string | undefined): string | null {
  if (!userId) return null;
  return `${PREFIX}:${form}:${userId}`;
}

function readDraft<T>(key: string): StoredDraft<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as StoredDraft<T>).v === 1 &&
      "data" in (parsed as object)
    ) {
      return parsed as StoredDraft<T>;
    }
    return null;
  } catch {
    return null;
  }
}

function writeDraft<T>(key: string, draft: StoredDraft<T>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    /* quota / private mode — best-effort, ignore */
  }
}

function removeDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export interface UseFormDraftArgs<T> {
  /** Stable form identifier, e.g. "order_new". */
  form: string;
  /** Current user id — drafts are namespaced per user. */
  userId: string | undefined;
  /** Current serialisable snapshot of the form. */
  value: T;
  /** Gate saving until the form is ready (e.g. after server prefill). Default true. */
  enabled?: boolean;
  /** Debounce before persisting, ms. Default 800. */
  debounceMs?: number;
  /** Return true when `value` is pristine/empty so we don't save a phantom draft. */
  isEmpty?: (value: T) => boolean;
}

export interface UseFormDraftResult<T> {
  /** A saved draft exists and the user hasn't resumed/discarded it yet. */
  hasDraft: boolean;
  /** When the found draft was last saved (ms epoch), or null. */
  savedAt: number | null;
  /** Resume: returns the saved snapshot for the caller to apply, hides the banner. */
  resume: () => T | null;
  /** Discard the saved draft and hide the banner. */
  discard: () => void;
  /** Drop the saved draft — call on successful submit. */
  clear: () => void;
}

export function useFormDraft<T>({
  form,
  userId,
  value,
  enabled = true,
  debounceMs = 800,
  isEmpty,
}: UseFormDraftArgs<T>): UseFormDraftResult<T> {
  const [found, setFound] = useState<StoredDraft<T> | null>(null);
  // `decided` is true once the user has acted on a found draft (resume/discard)
  // OR there was no draft to resume. Autosave only runs after this, so the
  // empty initial value can't overwrite a saved draft before the user decides.
  const [decided, setDecided] = useState(false);

  // Keep the latest value in a ref so the debounced save always persists the
  // freshest snapshot without re-arming the timer identity.
  const valueRef = useRef(value);
  valueRef.current = value;
  const isEmptyRef = useRef(isEmpty);
  isEmptyRef.current = isEmpty;

  // On mount (and when the user id resolves), load any existing draft.
  useEffect(() => {
    const key = keyFor(form, userId);
    if (!key) return; // user not known yet — wait
    const existing = readDraft<T>(key);
    if (existing && (!isEmptyRef.current || !isEmptyRef.current(existing.data))) {
      setFound(existing);
      setDecided(false);
    } else {
      setFound(null);
      setDecided(true); // nothing to resume — free to autosave immediately
    }
  }, [form, userId]);

  // Debounced autosave. Runs only once the user is past the resume decision.
  useEffect(() => {
    if (!enabled || !decided) return;
    const key = keyFor(form, userId);
    if (!key) return;
    const snapshot = value;
    if (isEmptyRef.current && isEmptyRef.current(snapshot)) {
      // Pristine — don't create a phantom draft. (We intentionally do NOT
      // delete here; clearing happens on submit/discard only.)
      return;
    }
    const t = window.setTimeout(() => {
      writeDraft<T>(key, { v: 1, savedAt: Date.now(), data: valueRef.current });
    }, debounceMs);
    return () => window.clearTimeout(t);
  }, [value, enabled, decided, form, userId, debounceMs]);

  const resume = useCallback((): T | null => {
    const data = found?.data ?? null;
    setDecided(true);
    setFound(null);
    return data;
  }, [found]);

  const discard = useCallback(() => {
    const key = keyFor(form, userId);
    if (key) removeDraft(key);
    setFound(null);
    setDecided(true);
  }, [form, userId]);

  const clear = useCallback(() => {
    const key = keyFor(form, userId);
    if (key) removeDraft(key);
    setFound(null);
    setDecided(true);
  }, [form, userId]);

  const hasDraft = useMemo(() => found != null && !decided, [found, decided]);

  return { hasDraft, savedAt: found?.savedAt ?? null, resume, discard, clear };
}
