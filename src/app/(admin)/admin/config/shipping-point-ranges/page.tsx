/**
 * /admin/config/shipping-point-ranges — SUPER_ADMIN-only editor for
 * the vendor-facing estimate range table (Fulfillment v2 config).
 *
 * Introduced by migration 0040. Talks to:
 *   GET   /v1/admin/shipping-point-ranges
 *   PATCH /v1/admin/shipping-point-ranges
 *
 * UX shape:
 *   * Table with one row per bucket. Columns: pointsMin, pointsMax,
 *     dollarsMin, dollarsMax. All four are inline-editable.
 *   * Add / Remove row buttons; the editor accepts 1..N buckets.
 *   * "Reset to defaults" restores the compiled-in seed (page 11
 *     table from the client's Fulfillment v2 spec).
 *   * Save button is disabled while nothing is dirty and shows
 *     inline validation errors — the backend enforces the same
 *     rules (no overlap, min<max on both axes, integer cents) but
 *     surfacing them client-side saves a round trip.
 *
 * Auth: SUPER_ADMIN only. Client-side redirect for non-SUPER_ADMIN;
 * backend is authoritative (403s the API regardless).
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useApiErrorHandler } from "@/lib/errors";
import {
  DEFAULT_SHIPPING_POINT_RANGES,
  type ShippingPointBucket,
  type ShippingPointRangeTable,
} from "@/lib/schemas/shipping-points";

interface GetResponse {
  current: ShippingPointRangeTable;
  defaults: ShippingPointRangeTable;
}

interface PatchResponse {
  current: ShippingPointRangeTable;
}

// Local edit shape — strings for every input so we can render
// intermediate typing states without coercing "1." to NaN. Parsed
// on save. Coherence errors (overlap, min>max) surface inline.
interface EditRow {
  key: string; // stable local key, not persisted
  pointsMin: string;
  pointsMax: string;
  dollarsMin: string; // dollars, not cents — friendlier to type
  dollarsMax: string;
}

export default function ShippingPointRangesPage(): JSX.Element | null {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user && user.role !== "SUPER_ADMIN") {
      router.replace("/admin");
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return (
      <div className="p-8 font-mono text-mono-label uppercase text-text-muted">
        Loading…
      </div>
    );
  }
  if (user.role !== "SUPER_ADMIN") return null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Configuration / Fulfillment v2"
        title="Shipping-point estimate ranges"
        description="Maps a summed shipping-point value on an order to the dollar range shown to the vendor at submit. The vendor never sees the point value; they see the estimate range and must have enough wallet balance to cover the top of the range. Every change is audit-logged."
      />
      <RangesEditor />
    </div>
  );
}

function RangesEditor(): JSX.Element {
  const qc = useQueryClient();
  const { bannerError, handle, clear } = useApiErrorHandler();

  const dataQ = useQuery({
    queryKey: ["admin", "shipping-point-ranges"],
    queryFn: () => api.get<GetResponse>("/admin/shipping-point-ranges"),
  });

  const [rows, setRows] = useState<EditRow[]>([]);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // Materialise rows on data load. Also runs on refetch so a saved
  // round-trip's authoritative payload flows into the editor
  // without stale local state.
  useEffect(() => {
    if (!dataQ.data) return;
    setRows(
      dataQ.data.current.buckets.map((b, i) => bucketToRow(b, `initial-${i}`)),
    );
  }, [dataQ.data]);

  // Client-side validation — surfaces inline errors so the SUPER_ADMIN
  // doesn't have to round-trip to see coherence issues. Same rules
  // the backend enforces, restated here so both agree.
  const validation = useMemo(() => validateRows(rows), [rows]);

  const patchMut = useMutation({
    mutationFn: () => {
      const buckets = rows.map(rowToBucket);
      return api.patch<PatchResponse>("/admin/shipping-point-ranges", {
        buckets,
      });
    },
    onMutate: () => {
      clear();
      setSavedMessage(null);
    },
    onSuccess: () => {
      setSavedMessage("Ranges saved. New value applies within 30 seconds (server-side cache TTL).");
      void qc.invalidateQueries({ queryKey: ["admin", "shipping-point-ranges"] });
    },
    onError: (err) => handle(err),
  });

  function addRow(): void {
    const last = rows[rows.length - 1];
    // Seed a new row right after the last one so it's a natural
    // continuation — most edits just extend the top of the table.
    setRows((prev) => [
      ...prev,
      {
        key: `local-${crypto.randomUUID()}`,
        pointsMin: last ? last.pointsMax : "0",
        pointsMax: last ? String(Number(last.pointsMax) + 1) : "1",
        dollarsMin: last ? last.dollarsMax : "5",
        dollarsMax: last ? String(Number(last.dollarsMax) + 5) : "10",
      },
    ]);
  }

  function removeRow(key: string): void {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function resetToDefaults(): void {
    clear();
    setSavedMessage(null);
    setRows(
      DEFAULT_SHIPPING_POINT_RANGES.buckets.map((b, i) =>
        bucketToRow(b, `default-${i}-${crypto.randomUUID()}`),
      ),
    );
  }

  if (dataQ.isLoading) {
    return (
      <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
    );
  }
  if (dataQ.isError) {
    return (
      <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
        Failed to load ranges. Refresh to retry.
      </div>
    );
  }

  const canSave = rows.length > 0 && !validation.hasError && !patchMut.isPending;

  return (
    <section className="rounded-md border border-line bg-white p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-mono text-mono-label uppercase text-text-muted">
            Range table
          </h2>
          <p className="mt-1 max-w-prose text-body-sm text-text-muted">
            Buckets are walked low → high; the first match wins. Half-open on
            the right (pointsMin ≤ sum &lt; pointsMax) except the last bucket,
            which is inclusive. Buckets must not overlap.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={resetToDefaults}>
            Reset to defaults
          </Button>
          <Button
            type="button"
            variant="amber"
            onClick={() => patchMut.mutate()}
            disabled={!canSave}
            loading={patchMut.isPending}
          >
            {patchMut.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <ErrorBanner error={bannerError} onAction={() => undefined} />
      {savedMessage ? (
        <div className="mb-4 rounded-sm border-l-4 border-success bg-success/10 px-4 py-2 text-body-sm text-text">
          {savedMessage}
        </div>
      ) : null}
      {validation.messages.length > 0 ? (
        <ul className="mb-4 flex flex-col gap-1 rounded-sm border-l-4 border-amber bg-amber/10 px-4 py-2 text-body-sm text-text">
          {validation.messages.map((m, i) => (
            <li key={i}>• {m}</li>
          ))}
        </ul>
      ) : null}

      <DataTable>
        <THead>
          <Th align="right">Points min (≥)</Th>
          <Th align="right">Points max (&lt;)</Th>
          <Th align="right">$ min</Th>
          <Th align="right">$ max</Th>
          <Th align="right">Remove</Th>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.key}>
              <Td align="right">
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  value={row.pointsMin}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) =>
                        r.key === row.key ? { ...r, pointsMin: e.target.value } : r,
                      ),
                    )
                  }
                  className="h-8 w-24 py-0 text-right font-mono text-body-sm"
                />
              </Td>
              <Td align="right">
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  value={row.pointsMax}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) =>
                        r.key === row.key ? { ...r, pointsMax: e.target.value } : r,
                      ),
                    )
                  }
                  className="h-8 w-24 py-0 text-right font-mono text-body-sm"
                />
              </Td>
              <Td align="right">
                <Input
                  type="number"
                  step="0.5"
                  min={0}
                  value={row.dollarsMin}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) =>
                        r.key === row.key ? { ...r, dollarsMin: e.target.value } : r,
                      ),
                    )
                  }
                  className="h-8 w-24 py-0 text-right font-mono text-body-sm"
                />
              </Td>
              <Td align="right">
                <Input
                  type="number"
                  step="0.5"
                  min={0}
                  value={row.dollarsMax}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) =>
                        r.key === row.key ? { ...r, dollarsMax: e.target.value } : r,
                      ),
                    )
                  }
                  className="h-8 w-24 py-0 text-right font-mono text-body-sm"
                />
              </Td>
              <Td align="right">
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  className="text-text-muted hover:text-error"
                  aria-label="Remove row"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Td>
            </TR>
          ))}
        </TBody>
      </DataTable>

      <div className="mt-4">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add bucket
        </Button>
      </div>

      <p className="mt-6 rounded-sm bg-cream-soft px-4 py-3 text-body-sm text-text-muted">
        Dollars are stored server-side in cents. Values entered here are dollars
        (e.g. 8 = $8.00) and converted on save. The change takes effect within
        30 seconds of Save (server-side cache TTL).
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Row ↔ bucket conversion + validation
// ---------------------------------------------------------------------------

function bucketToRow(b: ShippingPointBucket, key: string): EditRow {
  return {
    key,
    pointsMin: String(b.pointsMin),
    pointsMax: String(b.pointsMax),
    // Cents → dollars for edit; save converts back.
    dollarsMin: String(b.dollarsMin / 100),
    dollarsMax: String(b.dollarsMax / 100),
  };
}

function rowToBucket(r: EditRow): ShippingPointBucket {
  return {
    pointsMin: Number(r.pointsMin),
    pointsMax: Number(r.pointsMax),
    // Round to cents to avoid FP drift (12.505 → 1251 cents, not 1250.5).
    dollarsMin: Math.round(Number(r.dollarsMin) * 100),
    dollarsMax: Math.round(Number(r.dollarsMax) * 100),
  };
}

function validateRows(rows: EditRow[]): {
  hasError: boolean;
  messages: string[];
} {
  const messages: string[] = [];
  if (rows.length === 0) {
    return { hasError: true, messages: ["At least one bucket is required."] };
  }
  // Field-level: numeric + non-negative + min<max on both axes.
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const idx = i + 1;
    const pMin = Number(row.pointsMin);
    const pMax = Number(row.pointsMax);
    const dMin = Number(row.dollarsMin);
    const dMax = Number(row.dollarsMax);
    if (!Number.isFinite(pMin) || pMin < 0) {
      messages.push(`Row ${idx}: points min must be a non-negative number.`);
    }
    if (!Number.isFinite(pMax) || pMax <= 0) {
      messages.push(`Row ${idx}: points max must be a positive number.`);
    }
    if (Number.isFinite(pMin) && Number.isFinite(pMax) && pMin >= pMax) {
      messages.push(`Row ${idx}: points min must be less than points max.`);
    }
    if (!Number.isFinite(dMin) || dMin < 0) {
      messages.push(`Row ${idx}: $ min must be a non-negative number.`);
    }
    if (!Number.isFinite(dMax) || dMax < 0) {
      messages.push(`Row ${idx}: $ max must be a non-negative number.`);
    }
    if (Number.isFinite(dMin) && Number.isFinite(dMax) && dMin > dMax) {
      messages.push(`Row ${idx}: $ min cannot exceed $ max.`);
    }
  }
  // Cross-row: no overlap. Assumes rows are already ordered by
  // pointsMin — the backend enforces this too, so a user who edited
  // out of order will see a message here and can drag/reorder or
  // renumber.
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!;
    const cur = rows[i]!;
    const prevMax = Number(prev.pointsMax);
    const curMin = Number(cur.pointsMin);
    if (Number.isFinite(prevMax) && Number.isFinite(curMin) && curMin < prevMax) {
      messages.push(`Row ${i + 1}: points min (${cur.pointsMin}) overlaps the previous bucket's max (${prev.pointsMax}).`);
    }
  }
  return { hasError: messages.length > 0, messages };
}
