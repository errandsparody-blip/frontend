"use client";

/**
 * Storefront cart (Migration 0059) — a small client-side cart scoped to one
 * store, persisted in localStorage so a buyer's cart survives a refresh. Cart
 * is single-vendor by design (Phase 1), so it's keyed by slug.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface CartItem {
  productId: string;
  name: string;
  unitRetailCents: number;
  imageUrl: string | null;
  quantity: number;
  available: number;
}

interface CartState {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  count: number;
  subtotalCents: number;
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  const storageKey = `ue_cart_${slug}`;
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setItems(JSON.parse(raw) as CartItem[]);
    } catch {
      /* ignore malformed cart */
    }
    setHydrated(true);
  }, [storageKey]);

  // Persist on change (after hydration so we don't clobber with []).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      /* storage may be unavailable; cart stays in memory */
    }
  }, [items, hydrated, storageKey]);

  const add = useCallback((item: Omit<CartItem, "quantity">, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === item.productId);
      const cap = item.available;
      if (existing) {
        return prev.map((i) =>
          i.productId === item.productId
            ? { ...i, quantity: Math.min(cap, i.quantity + qty) }
            : i,
        );
      }
      return [...prev, { ...item, quantity: Math.min(cap, qty) }];
    });
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setItems((prev) =>
      prev
        .map((i) =>
          i.productId === productId
            ? { ...i, quantity: Math.max(0, Math.min(i.available, qty)) }
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartState>(
    () => ({
      items,
      add,
      setQty,
      remove,
      clear,
      count: items.reduce((s, i) => s + i.quantity, 0),
      subtotalCents: items.reduce((s, i) => s + i.unitRetailCents * i.quantity, 0),
    }),
    [items, add, setQty, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
