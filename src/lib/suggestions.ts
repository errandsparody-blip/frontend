"use client";

/**
 * Saved-suggestions store — remembers values the vendor/operator types
 * often (addresses, carriers, tracking numbers, SKU codes, …) in the
 * browser's localStorage so they can be re-picked instead of retyped.
 *
 * Design goals:
 *   - Per-browser, no server round-trip. Purely a convenience layer.
 *   - Each entry records WHEN it was saved (`savedAt`) so the UI can show
 *     "saved 2d ago" and sort most-recent-first.
 *   - Namespaced by field (e.g. "recipient-address", "return-carrier") so
 *     suggestions don't bleed across unrelated inputs.
 *   - De-duped by a stable key; re-saving an existing value just bumps it
 *     to the front and refreshes its timestamp.
 *   - Capped per namespace so the store can't grow unbounded.
 *
 * SSR-safe: every access guards `typeof window`. Components that use the
 * hook must be client components.
 */

import { useCallback, useEffect, useState } from "react";

const PREFIX = "uer:suggest:";
const MAX_PER_NAMESPACE = 25;

export interface SavedEntry<T> {
  /** Stable de-dupe key (lowercased/normalised). */
  key: string;
  /** The stored value — a string for text fields, an object for addresses. */
  value: T;
  /** Epoch ms when this entry was last saved. */
  savedAt: number;
}

function storageKey(namespace: string): string {
  return `${PREFIX}${namespace}`;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/** Read all entries for a namespace, newest-first. Never throws. */
export function loadEntries<T>(namespace: string): SavedEntry<T>[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(namespace));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedEntry<T>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.key === "string" && typeof e.savedAt === "number")
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/**
 * Remember a value under a namespace. `key` de-dupes; re-saving bumps the
 * entry to the front with a fresh timestamp. No-op on empty keys.
 */
export function rememberEntry<T>(namespace: string, key: string, value: T): void {
  if (!isBrowser()) return;
  const normKey = key.trim().toLowerCase();
  if (!normKey) return;
  try {
    const existing = loadEntries<T>(namespace).filter((e) => e.key !== normKey);
    const next: SavedEntry<T>[] = [{ key: normKey, value, savedAt: Date.now() }, ...existing].slice(
      0,
      MAX_PER_NAMESPACE,
    );
    window.localStorage.setItem(storageKey(namespace), JSON.stringify(next));
  } catch {
    // Quota / disabled storage — remembering is best-effort.
  }
}

/** Remove one entry by key. */
export function removeEntry(namespace: string, key: string): void {
  if (!isBrowser()) return;
  const normKey = key.trim().toLowerCase();
  try {
    const next = loadEntries(namespace).filter((e) => e.key !== normKey);
    window.localStorage.setItem(storageKey(namespace), JSON.stringify(next));
  } catch {
    // best-effort
  }
}

/** Convenience for plain text fields (key === normalized value). */
export function rememberText(namespace: string, value: string): void {
  const v = value.trim();
  if (v.length < 2) return; // don't remember trivial 1-char values
  rememberEntry<string>(namespace, v, v);
}

/**
 * React hook over a namespace. Returns the current entries (newest-first)
 * plus `remember` / `remove` that update both storage and local state so
 * the UI reflects changes immediately.
 */
export function useSuggestions<T>(namespace: string): {
  entries: SavedEntry<T>[];
  remember: (key: string, value: T) => void;
  remove: (key: string) => void;
  refresh: () => void;
} {
  const [entries, setEntries] = useState<SavedEntry<T>[]>([]);

  const refresh = useCallback(() => {
    setEntries(loadEntries<T>(namespace));
  }, [namespace]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const remember = useCallback(
    (key: string, value: T) => {
      rememberEntry<T>(namespace, key, value);
      refresh();
    },
    [namespace, refresh],
  );

  const remove = useCallback(
    (key: string) => {
      removeEntry(namespace, key);
      refresh();
    },
    [namespace, refresh],
  );

  return { entries, remember, remove, refresh };
}

/** Compact relative-time label, e.g. "just now", "3h ago", "2d ago". */
export function savedAgo(savedAt: number): string {
  const s = Math.max(0, Math.floor((Date.now() - savedAt) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
