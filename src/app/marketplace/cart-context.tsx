"use client";

/**
 * Global marketplace cart (Phase 2) — spans multiple stores, grouped by vendor.
 * Persisted in localStorage. Distinct from the per-store cart used on an
 * individual storefront.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface MpCartItem {
  productId: string;
  vendorSlug: string;
  storeName: string;
  name: string;
  unitRetailCents: number;
  imageUrl: string | null;
  available: number;
  quantity: number;
}

export interface MpCartGroup {
  vendorSlug: string;
  storeName: string;
  items: MpCartItem[];
  subtotalCents: number;
}

interface MpCartState {
  items: MpCartItem[];
  groups: MpCartGroup[];
  add: (item: Omit<MpCartItem, "quantity">, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  count: number;
  subtotalCents: number;
}

const STORAGE_KEY = "ue_marketplace_cart";
const Ctx = createContext<MpCartState | null>(null);

export function MarketplaceCartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<MpCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as MpCartItem[]);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items, hydrated]);

  const add = useCallback((item: Omit<MpCartItem, "quantity">, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === item.productId);
      if (existing) {
        return prev.map((i) =>
          i.productId === item.productId
            ? { ...i, quantity: Math.min(item.available, i.quantity + qty) }
            : i,
        );
      }
      return [...prev, { ...item, quantity: Math.min(item.available, qty) }];
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

  const remove = useCallback(
    (productId: string) => setItems((prev) => prev.filter((i) => i.productId !== productId)),
    [],
  );
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<MpCartState>(() => {
    const byVendor = new Map<string, MpCartGroup>();
    for (const i of items) {
      const g = byVendor.get(i.vendorSlug) ?? {
        vendorSlug: i.vendorSlug,
        storeName: i.storeName,
        items: [],
        subtotalCents: 0,
      };
      g.items.push(i);
      g.subtotalCents += i.unitRetailCents * i.quantity;
      byVendor.set(i.vendorSlug, g);
    }
    return {
      items,
      groups: [...byVendor.values()],
      add,
      setQty,
      remove,
      clear,
      count: items.reduce((s, i) => s + i.quantity, 0),
      subtotalCents: items.reduce((s, i) => s + i.unitRetailCents * i.quantity, 0),
    };
  }, [items, add, setQty, remove, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMarketplaceCart(): MpCartState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMarketplaceCart must be used within MarketplaceCartProvider");
  return ctx;
}
