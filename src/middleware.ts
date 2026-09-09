/**
 * Storefront subdomain resolver (Migration 0059).
 *
 * Maps `[slug].myusaerrands.com` (and `[slug].localhost` in dev) onto the
 * canonical `/store/[slug]` route, so the subdomain and the path-slug URL
 * models render the exact same page from one code path. The apex domain and
 * reserved subdomains (www, api, app…) pass through untouched, so the
 * marketing / portal / admin app is unaffected.
 *
 * Custom domains (Phase 3) will add a host lookup here without changing the
 * rewrite target.
 */
import { NextResponse, type NextRequest } from "next/server";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "myusaerrands.com";

// Subdomains that belong to the platform, never to a vendor store.
const RESERVED_SUBDOMAINS = new Set([
  "www", "api", "app", "admin", "mail", "static", "assets", "cdn", "status",
]);

/**
 * Extract a single-label subdomain from the host, or null if the host is the
 * apex, a multi-level host, or not one of our domains. Only single-label
 * subdomains map to a store (`shop.myusaerrands.com`, not `a.b.myusaerrands.com`).
 */
function storeSubdomain(host: string): string | null {
  const bare = (host.split(":")[0] ?? "").toLowerCase();
  for (const root of [`.${ROOT_DOMAIN}`, ".localhost"]) {
    if (bare.endsWith(root)) {
      const label = bare.slice(0, -root.length);
      if (!label || label.includes(".")) return null;
      return label;
    }
  }
  return null;
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const url = req.nextUrl;
  if (url.pathname.startsWith("/store/")) return NextResponse.next();

  // 1. Platform subdomain: [slug].myusaerrands.com → /store/[slug].
  const label = storeSubdomain(host);
  if (label && !RESERVED_SUBDOMAINS.has(label)) {
    return rewriteToStore(url, label);
  }

  // 2. Custom domain (Phase 3): a verified vendor host → /store/[slug].
  //    Off by default (adds a per-request resolve), enabled once DNS + SSL are
  //    provisioned by setting NEXT_PUBLIC_CUSTOM_DOMAINS=1.
  if (label === null && process.env.NEXT_PUBLIC_CUSTOM_DOMAINS === "1") {
    const bare = (host.split(":")[0] ?? "").toLowerCase();
    const slug = await resolveCustomHost(bare);
    if (slug) return rewriteToStore(url, slug);
  }

  return NextResponse.next();
}

function rewriteToStore(url: NextRequest["nextUrl"], slug: string) {
  const rewritten = url.clone();
  const suffix = url.pathname === "/" ? "" : url.pathname;
  rewritten.pathname = `/store/${slug}${suffix}`;
  return NextResponse.rewrite(rewritten);
}

async function resolveCustomHost(host: string): Promise<string | null> {
  const api = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/v1";
  try {
    const res = await fetch(`${api}/public/storefront/by-host/${encodeURIComponent(host)}`, {
      // Short revalidate so a newly-verified domain resolves quickly without a
      // fetch on every single request.
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { slug?: string | null };
    return body.slug ?? null;
  } catch {
    return null;
  }
}

export const config = {
  // Run on everything except Next internals, the API proxy, and static files
  // (any path containing a dot, plus favicon).
  matcher: ["/((?!_next/|api/|.*\\..*|favicon.ico).*)"],
};
