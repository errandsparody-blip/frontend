/**
 * Public storefront API client (Migration 0059).
 *
 * Buyers are anonymous — these calls carry NO auth token (unlike the vendor/
 * admin api-client). Thin fetch wrappers over the public endpoints.
 */
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/v1";

export interface Storefront {
  vendorId: string;
  slug: string;
  displayName: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  accentColor: string | null;
  about: string | null;
  currency: string;
  availableProcessors: Array<"STRIPE" | "FLUTTERWAVE">;
}

export interface StoreProduct {
  id: string;
  name: string;
  category: string | null;
  tags: string[];
  retailPriceCents: number;
  imageUrl: string | null;
  available: number;
  /** Set when this card is a size×colour variant group — the buyer must pick
   *  options on the product page rather than quick-adding. */
  variantGroupId?: string | null;
  /** Group's variants aren't all one price → show "from $X". */
  priceVaries?: boolean;
}

export interface ListingVariant {
  productId: string;
  optionSize: string | null;
  optionColor: string | null;
  retailPriceCents: number;
  imageUrl: string | null;
  imageUrls: string[];
  available: number;
}
export interface PublicListing {
  name: string;
  category: string | null;
  tags: string[];
  variantGroupId: string | null;
  sizes: string[];
  colors: string[];
  variants: ListingVariant[];
}

export interface ShippingOption {
  speed: "STANDARD" | "EXPRESS";
  label: string;
  deliveryWindow: string;
  costCents: number;
  estimatedDeliveryDays: number;
}

export interface CheckoutQuote {
  currency: string;
  productSubtotalCents: number;
  fulfillmentFeeCents: number;
  taxCents: number;
  shippingOptions: ShippingOption[];
  /** Diagnostic: the combined parcel the shipping estimate was priced on. A
   *  huge weightOz means a product's weight data is wrong (carriers bill on
   *  weight). Inspect in the quote response when a rate looks too high. */
  parcel?: { weightOz: number; lengthIn: number; widthIn: number; heightIn: number };
}

export interface ShipAddressInput {
  recipientName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  phone?: string;
}

export interface CartLine {
  productId: string;
  quantity: number;
}

export class StorefrontApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "StorefrontApiError";
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/public/storefront${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const b = body as { message?: string; code?: string } | null;
    throw new StorefrontApiError(b?.message ?? `Request failed (${res.status})`, res.status, b?.code);
  }
  return body as T;
}

export const storefrontApi = {
  getStore: (slug: string) => req<Storefront>(`/${encodeURIComponent(slug)}`),
  getProducts: (slug: string, category?: string) =>
    req<StoreProduct[]>(
      `/${encodeURIComponent(slug)}/products${category ? `?category=${encodeURIComponent(category)}` : ""}`,
    ),
  getCategories: (slug: string) => req<string[]>(`/${encodeURIComponent(slug)}/categories`),
  getProduct: (slug: string, id: string) =>
    req<StoreProduct>(`/${encodeURIComponent(slug)}/products/${id}`),
  // Listing with size×colour variants; `id` may be a product or a group id.
  getListing: (slug: string, id: string) =>
    req<PublicListing>(`/${encodeURIComponent(slug)}/listing/${id}`),
  quote: (slug: string, items: CartLine[], shipAddress: ShipAddressInput) =>
    req<CheckoutQuote>(`/${encodeURIComponent(slug)}/quote`, {
      method: "POST",
      body: JSON.stringify({ items, shipAddress }),
    }),
  validateDiscount: (slug: string, code: string, subtotalCents: number) =>
    req<{ valid: boolean; code?: string; discountCents?: number; reason?: string }>(
      `/${encodeURIComponent(slug)}/discount/validate`,
      { method: "POST", body: JSON.stringify({ code, subtotalCents }) },
    ),
  checkout: (
    slug: string,
    payload: {
      items: CartLine[];
      shipAddress: ShipAddressInput;
      buyerEmail: string;
      buyerName?: string;
      buyerPhone?: string;
      shippingSpeed: "STANDARD" | "EXPRESS";
      processor: "STRIPE" | "FLUTTERWAVE";
      discountCode?: string;
    },
  ) =>
    req<{ reference: string; checkoutUrl: string }>(
      `/${encodeURIComponent(slug)}/checkout`,
      { method: "POST", body: JSON.stringify(payload) },
    ),
};

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatUsd(cents: number): string {
  // Proper currency formatting with thousands separators, e.g. $200,000.00.
  return usdFormatter.format((cents ?? 0) / 100);
}

// ---------------------------------------------------------------------------
// Multi-vendor marketplace feed (Phase 2)
// ---------------------------------------------------------------------------

export interface MarketplaceProduct extends StoreProduct {
  vendorSlug: string;
  storeName: string;
}
export interface FeaturedStore {
  slug: string;
  displayName: string;
  logoUrl: string | null;
  accentColor: string | null;
}

async function mkReq<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/public/marketplace${path}`, { cache: "no-store" });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) throw new StorefrontApiError("Marketplace request failed", res.status);
  return body as T;
}

export interface CrossVendorGroupInput {
  slug: string;
  items: CartLine[];
  processor: "STRIPE" | "FLUTTERWAVE";
  discountCode?: string;
}
export interface CrossVendorCheckoutResult {
  results: Array<{ slug: string; reference: string; checkoutUrl: string }>;
  errors: Array<{ slug: string; message: string; code?: string }>;
}

async function mkPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/public/marketplace${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  const parsed = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const b = parsed as { message?: string } | null;
    throw new StorefrontApiError(b?.message ?? "Marketplace request failed", res.status);
  }
  return parsed as T;
}

export const marketplaceApi = {
  products: (category?: string) =>
    mkReq<MarketplaceProduct[]>(
      `/products${category ? `?category=${encodeURIComponent(category)}` : ""}`,
    ),
  categories: () => mkReq<string[]>("/categories"),
  stores: () => mkReq<FeaturedStore[]>("/stores"),
  // One consolidated shipping quote for the whole cart (one shipment).
  quote: (
    groups: Array<{ slug: string; items: CartLine[] }>,
    shipAddress: ShipAddressInput,
  ) => mkPost<CheckoutQuote>("/quote", { shipAddress, groups }),
  checkout: (payload: {
    shipAddress: ShipAddressInput;
    buyerEmail: string;
    buyerName?: string;
    buyerPhone?: string;
    // One delivery speed for the whole cart — one shipment, one shipping charge.
    shippingSpeed: "STANDARD" | "EXPRESS";
    groups: CrossVendorGroupInput[];
  }) => mkPost<CrossVendorCheckoutResult>("/checkout", payload),
};
