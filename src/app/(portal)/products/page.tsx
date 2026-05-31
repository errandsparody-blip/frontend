"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import type { PublicProduct } from "@/lib/schemas/products";

export default function ProductsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["products"],
    queryFn: () =>
      api.get<{ items: PublicProduct[]; nextCursor: string | null }>("/products?limit=50"),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Catalogue"
        title="Products"
        description="Pre-create the products you'll be sending us. SKUs are generated at receiving time from these definitions."
        actions={
          <Link href="/products/new">
            <Button variant="amber" withArrow>
              Add product
            </Button>
          </Link>
        }
      />

      {isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : error ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          Failed to load products. {(error as { message?: string }).message ?? ""}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="Pre-create at least one product before submitting a Pre-Shipment Notice."
          action={
            <Link href="/products/new">
              <Button variant="primary" withArrow>
                Add your first product
              </Button>
            </Link>
          }
        />
      ) : (
        <DataTable>
          <THead>
            <Th>Image</Th>
            <Th>Code</Th>
            <Th>Name</Th>
            <Th>Variant</Th>
            <Th align="right">Declared</Th>
            <Th align="right">Weight</Th>
            <Th>Origin</Th>
            <Th>Status</Th>
            <Th align="right">Action</Th>
          </THead>
          <TBody>
            {data.items.map((p) => (
              <TR key={p.id}>
                <Td>
                  {/* 48×48 thumbnail. Falls back to a quiet placeholder
                      tile so unstyled rows don't shift when one product
                      has an image and the next doesn't. */}
                  <div className="h-12 w-12 overflow-hidden rounded-sm border border-line bg-cream-soft">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt={`${p.name} thumbnail`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-mono text-[9px] uppercase tracking-[1px] text-text-subtle">
                        no image
                      </div>
                    )}
                  </div>
                </Td>
                <Td mono>{p.code}</Td>
                <Td strong>{p.name}</Td>
                <Td mono className="text-text-muted">{p.variant}</Td>
                <Td num>${(p.declaredValueCents / 100).toFixed(2)}</Td>
                <Td num>{p.weightOz.toFixed(1)} oz</Td>
                <Td mono>{p.countryOfOrigin}</Td>
                <Td>
                  <StatusPill tone={p.status === "ACTIVE" ? "success" : "neutral"}>
                    {p.status}
                  </StatusPill>
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/products/${p.id}/preview`}
                      className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
                    >
                      Preview
                    </Link>
                    <Link
                      href={`/products/${p.id}`}
                      className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
                    >
                      Edit →
                    </Link>
                  </div>
                </Td>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}
    </div>
  );
}
