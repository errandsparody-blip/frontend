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
  /** True once the cart has loaded from the cookie. Consumers that clear the
   *  cart on mount (e.g. the order-confirmation page) must wait for this, or the
   *  hydration effect races them and restores the just-cleared item. */
  hydrated: boolean;
}

// The cart is stored in a COOKIE scoped to the registrable domain
// (`.myusaerrands.com`) — not localStorage — so it's the SAME cart on the apex
// (myusaerrands.com) and on every vendor subdomain (<slug>.myusaerrands.com).
// localStorage can't be shared across those origins; a parent-domain cookie can.
// On localhost / Vercel previews there's no shared parent, so it falls back to a
// host-only cookie (still one cart per origin, same as before).
const COOKIE_KEY = "ue_mp_cart";
const LEGACY_LS_KEY = "ue_marketplace_cart"; // migrate old localStorage carts once
const COOKIE_MAX_BYTES = 3800; // stay under the ~4KB per-cookie limit

function rootDomain(): string {
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "myusaerrands.com";
}

/** Cookie Domain that spans apex + all subdomains, or undefined off-platform. */
function cartCookieDomain(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const host = window.location.hostname;
  const root = rootDomain();
  if (host === root || host.endsWith(`.${root}`)) return `.${root}`;
  return undefined; // localhost / *.vercel.app → host-only cookie
}

function readCartCookie(): MpCartItem[] {
  if (typeof document === "undefined") return [];
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  if (!m) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(m[1]!));
    return Array.isArray(parsed) ? (parsed as MpCartItem[]) : [];
  } catch {
    return [];
  }
}

function writeCartCookie(items: MpCartItem[]): void {
  if (typeof document === "undefined") return;
  const domain = cartCookieDomain();
  const secure = window.location.protocol === "https:";
  const base = (payload: string, maxAge: number) => {
    const parts = [`${COOKIE_KEY}=${payload}`, "path=/", `max-age=${maxAge}`, "samesite=lax"];
    if (domain) parts.push(`domain=${domain}`);
    if (secure) parts.push("secure");
    return parts.join("; ");
  };
  // Serialise; if it's too big for a cookie, drop the heaviest field (imageUrl)
  // so the cart still travels across origins (thumbnails degrade gracefully).
  let payload = encodeURIComponent(JSON.stringify(items));
  if (payload.length > COOKIE_MAX_BYTES) {
    const slim = items.map(({ imageUrl: _drop, ...rest }) => ({ ...rest, imageUrl: null }));
    payload = encodeURIComponent(JSON.stringify(slim));
  }
  document.cookie = base(payload, items.length === 0 ? 0 : 60 * 60 * 24 * 30);
}

const Ctx = createContext<MpCartState | null>(null);

export function MarketplaceCartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<MpCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let initial = readCartCookie();
    // One-time migration: seed from a legacy per-origin localStorage cart.
    if (initial.length === 0) {
      try {
        const raw = localStorage.getItem(LEGACY_LS_KEY);
        if (raw) {
          const legacy = JSON.parse(raw) as MpCartItem[];
          if (Array.isArray(legacy) && legacy.length > 0) {
            initial = legacy;
            writeCartCookie(legacy);
          }
          localStorage.removeItem(LEGACY_LS_KEY);
        }
      } catch {
        /* ignore */
      }
    }
    setItems(initial);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeCartCookie(items);
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
  const clear = useCallback(() => {
    setItems([]);
    // Persist the empty cart immediately (don't wait for the effect) so a
    // subsequent read of the cookie — including this provider's own hydration —
    // can't restore the just-cleared items.
    writeCartCookie([]);
  }, []);

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
      hydrated,
    };
  }, [items, add, setQty, remove, clear, hydrated]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMarketplaceCart(): MpCartState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMarketplaceCart must be used within MarketplaceCartProvider");
  return ctx;
}
