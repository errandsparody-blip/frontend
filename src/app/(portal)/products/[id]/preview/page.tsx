"use client";

/**
 * Vendor product preview — `/products/:id/preview`.
 *
 * Renders the product the way a buyer or admin would see it: hero image
 * on the left, name + key facts on the right. Pulls the same data the
 * edit page uses (GET /v1/products/:id) so the vendor sees exactly what
 * they've persisted — not a stale snapshot.
 *
 * The intent is "is this the right image and the right copy?" — a sanity
 * check before submitting a PSN. Read-only by design; the Edit button at
 * the top routes back to the form when the vendor wants to change
 * something.
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { api } from "@/lib/api-client";
import type { PublicProduct } from "@/lib/schemas/products";

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function ozToLb(oz: number): string {
  // Show oz under 1 lb (e.g. 4 oz) and pounds with one decimal for
  // anything heavier. Buyers don't think in ounces past about a pound.
  if (oz < 16) return `${oz.toFixed(1)} oz`;
  return `${(oz / 16).toFixed(2)} lb`;
}

export default function ProductPreviewPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const { data: product, isLoading, error } = useQuery({
    queryKey: ["products", params.id],
    queryFn: () => api.get<PublicProduct>(`/products/${params.id}`),
    enabled: !!params.id,
  });

  if (isLoading) {
    return (
      <div className="font-mono text-mono-label uppercase text-text-muted">
        Loading…
      </div>
    );
  }
  if (error || !product) {
    return (
      <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
        {(error as { message?: string })?.message ?? "Product not found."}
      </div>
    );
  }

  const dimensionsKnown =
    product.lengthIn != null && product.widthIn != null && product.heightIn != null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`[02] Catalogue / ${product.code} / Preview`}
        title={`Preview: ${product.name}`}
        description="This is how your product looks to admin operators and (when the public catalog ships) buyers. Edit the product to change the image, name, or details."
        actions={
          <div className="flex items-center gap-3">
            {/* Preview is the success state of the create flow, so the
                back affordance jumps directly to the products list — not
                to whichever page brought the user here. Using the smart
                BackButton would pop to `/products/new` because that's
                the same-origin referrer immediately after create, which
                feels broken ("I just saved this — why am I on the
                create form again?"). A plain Link keeps the destination
                explicit and unambiguous. */}
            <Link
              href="/products"
              className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
            >
              ← All products
            </Link>
            <Link
              href={`/products/${product.id}`}
              className="font-mono text-mono-label uppercase tracking-[1.2px] text-amber hover:text-amber-hi"
            >
              Edit →
            </Link>
            <StatusPill tone={product.status === "ACTIVE" ? "success" : "neutral"}>
              {product.status}
            </StatusPill>
          </div>
        }
      />

      <section className="grid gap-8 rounded-md border border-line bg-white p-8 md:grid-cols-[minmax(280px,420px)_1fr]">
        {/* Image column — square aspect ratio so the layout doesn't
            wobble whether the vendor uploaded a portrait or landscape
            crop. `object-cover` will crop centred; we tell the vendor
            in the form helper text that square images look best. */}
        <div className="overflow-hidden rounded-md border border-line bg-cream-soft">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
              className="aspect-square w-full object-cover"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center bg-cream">
              <div className="text-center">
                <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted">
                  No image yet
                </div>
                <p className="mt-2 text-body-sm text-text-muted">
                  Upload one on the edit page so this preview looks the way
                  you want it to.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
              {product.code} · {product.variant}
            </div>
            <h1 className="mt-1 text-h2 font-semibold text-ink">{product.name}</h1>
            <div className="mt-2 font-mono text-body-sm text-text-muted">
              Declared at {dollars(product.declaredValueCents)} ·
              Origin {product.countryOfOrigin}
            </div>
          </div>

          {/* Quick-look stats. Mirrors what an admin operator sees on
              the pick line so the vendor can verify everything's set
              up correctly before stock arrives. */}
          <dl className="grid gap-4 border-y border-line py-5 md:grid-cols-2">
            <Stat label="Unit weight" value={ozToLb(product.weightOz)} />
            <Stat
              label="Dimensions"
              value={
                dimensionsKnown
                  ? `${product.lengthIn} × ${product.widthIn} × ${product.heightIn} in`
                  : "Not set"
              }
            />
            <Stat
              label="Storage tier"
              value={product.storageTier.replace("_", "-")}
            />
            <Stat
              label="HS code"
              value={product.hsCode ?? "—"}
              mono
            />
          </dl>

          <div>
            <h2 className="mb-2 font-mono text-mono-label uppercase text-text-muted">
              About this preview
            </h2>
            <p className="text-body-sm text-text">
              The image, name, code, and details above are exactly what
              admin operators see when picking and packing this product.
              Once a public catalog ships, the same image and copy will
              appear to buyers.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div>
      <dt className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
        {label}
      </dt>
      <dd
        className={
          "mt-1 text-body text-ink" + (mono ? " font-mono tabular-nums" : "")
        }
      >
        {value}
      </dd>
    </div>
  );
}
