/**
 * /admin/pack — Fulfillment v2 pack queue (Migration 0042).
 *
 * Lists orders in PENDING_PACKING. Warehouse operators click a row to
 * open a modal that captures real box dimensions + weight, then POSTs
 * to `/admin/pack/:id/record`. On success the order moves to
 * PACKING_COMPLETED and disappears from this queue (it's now visible
 * in `/admin/pack/rates` for the rate-picker step).
 *
 * RBAC — enforced on the server via `admin.orders.read` /
 * `admin.orders.write`. This page also runs a soft client check so
 * unqualified users see a clean redirect instead of a 403 wall.
 *
 * SOLID
 *   * SRP: this page ONLY renders the pack queue and the pack modal.
 *     The rate picker lives at /admin/pack/rates.
 *   * DIP: the modal is a stateless component receiving props;
 *     mutations are wired at the page level.
 *   * Client validation mirrors the backend Zod schema (positive,
 *     bounded, integer weight, 500-char notes) so the user sees inline
 *     errors instead of round-tripping to a 400.
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";

interface QueueRow {
  id: string;
  orderNumber: number;
  vendorBusinessName: string;
  lineCount: number;
  submittedAt: string | null;
  recipientName: string;
  shipCity: string;
  shipState: string;
}

/**
 * Migration 0043 — packaging library preset shape (must mirror the API
 * `/admin/packaging-options/active` response). Kept local to this
 * file — the pack UI is the only web consumer for now.
 */
interface PackagingPreset {
  id: string;
  code: string;
  label: string;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  tareWeightOz: number;
}

interface RecordPackResponse {
  orderId: string;
  status: string;
  packedLengthIn: number;
  packedWidthIn: number;
  packedHeightIn: number;
  packedWeightOz: number;
  packedAt: string;
  packingNotes: string | null;
}

interface PackFormState {
  lengthIn: string;
  widthIn: string;
  heightIn: string;
  weightOz: string;
  notes: string;
}

// Mirror the backend Zod bounds so the user sees inline validation
// rather than an HTTP 400. Keep the constants close to the form so a
// change here surfaces the need to update the schema too.
const MAX_DIM_IN = 48;
const MAX_WEIGHT_OZ = 1120; // 70 lb — USPS domestic parcel ceiling
const MAX_NOTES_LEN = 500;

export default function AdminPackQueuePage(): JSX.Element {
  const qc = useQueryClient();
  const { bannerError, handle, clear } = useApiErrorHandler();
  const [selected, setSelected] = useState<QueueRow | null>(null);

  const queueQ = useQuery({
    queryKey: ["admin", "pack", "queue"],
    queryFn: () => api.get<{ items: QueueRow[] }>("/admin/pack/queue?limit=100"),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  // Migration 0043 — packaging presets. Fetched once per session (via
  // the shared PackagingLibraryService cache on the API) and passed
  // into every pack dialog opened during this session.
  const presetsQ = useQuery({
    queryKey: ["admin", "packaging-options", "active"],
    queryFn: () =>
      api.get<{ items: PackagingPreset[] }>(
        "/admin/packaging-options/active",
      ),
    staleTime: 5 * 60_000,
  });

  const recordMut = useMutation({
    mutationFn: async (input: {
      id: string;
      payload: {
        lengthIn: number;
        widthIn: number;
        heightIn: number;
        weightOz: number;
        notes?: string;
        packagingOptionId?: string;
      };
    }) =>
      api.post<RecordPackResponse>(`/admin/pack/${input.id}/record`, input.payload),
    onMutate: () => clear(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "pack", "queue"] });
      // The order just moved to PACKING_COMPLETED — invalidate the
      // rate-picker queue too so it appears there without a manual
      // refresh if the operator navigates over.
      await qc.invalidateQueries({ queryKey: ["admin", "pack", "rate-queue"] });
      setSelected(null);
    },
    onError: (err) => handle(err),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Fulfillment v2"
        title="Pack queue"
        description="Orders waiting for real box dimensions. Recording pack details unlocks live carrier rates in the next step."
        actions={
          <Link
            href="/admin/pack/rates"
            className="rounded-md border border-line bg-white px-3 py-1.5 text-body-sm font-semibold text-ink hover:bg-cream-soft"
          >
            Rate picker →
          </Link>
        }
      />

      {bannerError ? <ErrorBanner error={bannerError} /> : null}

      {queueQ.isLoading ? (
        <div className="rounded-md border border-line bg-white p-6 text-body-sm text-text-muted">
          Loading queue…
        </div>
      ) : queueQ.data && queueQ.data.items.length === 0 ? (
        <EmptyState
          title="No orders waiting to pack"
          description="When a vendor submits a Fulfillment v2 order it will appear here for the warehouse team."
        />
      ) : (
        <DataTable>
          <THead>
            <Th>Order</Th>
            <Th>Vendor</Th>
            <Th align="right">Lines</Th>
            <Th>Ship to</Th>
            <Th>Submitted</Th>
            <Th align="right">Action</Th>
          </THead>
          <TBody>
            {(queueQ.data?.items ?? []).map((row) => (
              <TR key={row.id}>
                <Td mono>#{row.orderNumber}</Td>
                <Td>{row.vendorBusinessName}</Td>
                <Td num>{row.lineCount}</Td>
                <Td>
                  {row.recipientName} · {row.shipCity}, {row.shipState}
                </Td>
                <Td mono className="text-text-muted">
                  {row.submittedAt
                    ? new Date(row.submittedAt).toLocaleString()
                    : "—"}
                </Td>
                <Td align="right">
                  <Button
                    type="button"
                    variant="amber"
                    size="sm"
                    onClick={() => setSelected(row)}
                  >
                    Pack
                  </Button>
                </Td>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}

      {selected ? (
        <PackDialog
          row={selected}
          presets={presetsQ.data?.items ?? []}
          presetsLoading={presetsQ.isLoading}
          submitting={recordMut.isPending}
          onCancel={() => setSelected(null)}
          onSubmit={(payload) =>
            recordMut.mutate({ id: selected.id, payload })
          }
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types used by the scan panel below.
// ---------------------------------------------------------------------------

interface OrderLine {
  id: string;
  skuId: string;
  productId: string;
  productCode: string;
  productName: string;
  variant: string;
  quantity: number;
}

interface SkuLocationLookup {
  skuId: string;
  location: {
    id: string;
    code: string;
    label: string;
    aisle: string | null;
    bay: string | null;
    shelf: string | null;
    bin: string | null;
  } | null;
}

interface AdminOrderDetail {
  id: string;
  vendor: { id: string; businessName: string };
  lines: OrderLine[];
}

interface BarcodeLookupMatch {
  barcodeId: string;
  productId: string;
  vendorId: string;
  productName: string;
  productCode: string;
  variant: string;
  symbology: string;
}

// ---------------------------------------------------------------------------

/**
 * Escape-to-close handler for modals. Registering the listener on
 * `window` (rather than the modal div) avoids the jsx-a11y warning
 * about assigning keyboard handlers to non-interactive elements, and
 * also catches the key even when focus is inside a form input.
 */
function EscapeKeyHandler({
  enabled,
  onEscape,
}: {
  enabled: boolean;
  onEscape: () => void;
}): null {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, onEscape]);
  return null;
}

// ---------------------------------------------------------------------------

/**
 * ScanPanel (Migration 0044) — bar-code verification for the pack step.
 *
 * Renders a scanner-style text input (auto-focus, `Enter` submits),
 * a per-line progress list with a checkmark once fully scanned, and
 * inline feedback from the last scan attempt.
 *
 * Design notes:
 *   * Barcode scanners typically emit the barcode as keystrokes
 *     followed by Enter. We consume the value on form submit rather
 *     than on every change to keep the state churn low.
 *   * The input clears itself after each scan so the next code lands
 *     in a fresh field. Refocusing happens automatically because the
 *     underlying <input> keeps focus after a value reset.
 *   * A "Reset scans" button lets the operator start over without
 *     closing the modal.
 *   * `loading` shows a stub while the order-detail query resolves.
 */
function ScanPanel({
  lines,
  scanCounts,
  scannedUnits,
  totalUnits,
  feedback,
  onScan,
  onReset,
  loading,
  locations,
}: {
  lines: OrderLine[];
  scanCounts: Record<string, number>;
  scannedUnits: number;
  totalUnits: number;
  feedback: { tone: "success" | "error"; message: string } | null;
  onScan: (code: string) => void;
  onReset: () => void;
  loading: boolean;
  /**
   * Migration 0045 — SKU → location map. Undefined for a SKU still
   * loading; null for a SKU with no location assigned. Rendered as a
   * chip under the product name so the operator can walk directly.
   */
  locations: Record<string, SkuLocationLookup["location"] | undefined>;
}): JSX.Element {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Autofocus on first render (safe — the modal ensures this only
  // mounts when the operator opened it).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const allScanned = totalUnits > 0 && scannedUnits >= totalUnits;

  return (
    <section className="mt-5 rounded-md border border-line bg-cream-soft p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
          Scan items
        </h3>
        <div className="font-mono text-body-sm text-text">
          {loading ? "Loading lines…" : `${scannedUnits} / ${totalUnits} units`}
        </div>
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim().length === 0) return;
          onScan(value);
          setValue("");
        }}
      >
        <Input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Scan or type a barcode + Enter"
          ref={inputRef}
          disabled={loading}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onReset}
          disabled={loading || scannedUnits === 0}
        >
          Reset scans
        </Button>
      </form>

      {feedback ? (
        <div
          className={
            feedback.tone === "success"
              ? "mt-2 rounded-md border border-green-200 bg-green-50 p-2 text-body-sm text-green-800"
              : "mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-body-sm text-red-800"
          }
          role={feedback.tone === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </div>
      ) : null}

      {loading ? null : lines.length === 0 ? (
        <div className="mt-3 text-body-sm text-text-muted">
          No lines on this order — the scan gate is bypassed.
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {lines.map((l) => {
            const count = scanCounts[l.id] ?? 0;
            const done = count >= l.quantity;
            const loc = locations[l.skuId];
            return (
              <li key={l.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-body-sm font-medium text-ink">
                    {l.productName}
                  </div>
                  <div className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
                    {l.productCode} · {l.variant}
                  </div>
                  {/* Migration 0045 — SKU location chip. */}
                  {loc ? (
                    <div
                      className="mt-1 inline-flex items-center gap-1 rounded-sm border border-line bg-white px-2 py-0.5 font-mono text-[11px] uppercase tracking-[1.2px] text-ink"
                      title={loc.label}
                    >
                      📍 {loc.code}
                    </div>
                  ) : loc === undefined ? null : (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-sm border border-dashed border-line bg-white px-2 py-0.5 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
                      no location
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-body-sm text-text">
                    {Math.min(count, l.quantity)} / {l.quantity}
                  </span>
                  {done ? (
                    <span
                      className="rounded-sm bg-green-100 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[1.2px] text-green-800"
                      title="All units scanned"
                    >
                      ✓ done
                    </span>
                  ) : (
                    <span className="rounded-sm bg-cream-soft px-2 py-0.5 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
                      pending
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && !allScanned && totalUnits > 0 ? (
        <div className="mt-3 text-body-xs text-text-muted">
          Every unit must be scanned before the pack can be recorded. If a
          product has no registered barcode, ask a super admin to register
          one from the product page.
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------

/**
 * Pack dialog — modal form for capturing dimensions + weight + notes.
 * All inputs are strings during typing so partially-typed values like
 * "1." don't coerce to NaN. Parsed on submit; validation errors surface
 * inline. Cancel + Escape close without submitting.
 */
function PackDialog({
  row,
  presets,
  presetsLoading,
  submitting,
  onCancel,
  onSubmit,
}: {
  row: QueueRow;
  presets: PackagingPreset[];
  presetsLoading: boolean;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: {
    lengthIn: number;
    widthIn: number;
    heightIn: number;
    weightOz: number;
    notes?: string;
    packagingOptionId?: string;
  }) => void;
}): JSX.Element {
  const [form, setForm] = useState<PackFormState>({
    lengthIn: "",
    widthIn: "",
    heightIn: "",
    weightOz: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof PackFormState, string>>>(
    {},
  );
  // Migration 0043 — selected packaging preset. Empty string = ad-hoc
  // (operator will type dimensions manually). When set, the dims
  // fields are pre-filled AND disabled — the preset's dims are
  // authoritative and any local edit would just be discarded server-side.
  // The weightOz field remains editable: it's the GOODS weight, and
  // the tare weight is added on the server.
  const [presetId, setPresetId] = useState<string>("");
  const chosenPreset = presets.find((p) => p.id === presetId) ?? null;

  // Migration 0044 — fetch this order's line items so the scan panel
  // can validate scans against them. Cached across modal remounts by
  // React Query (keyed on the order id).
  const orderQ = useQuery({
    queryKey: ["admin", "order", row.id],
    queryFn: () => api.get<AdminOrderDetail>(`/admin/orders/${row.id}`),
    staleTime: 60_000,
  });
  // Migration 0045 — resolve each line SKU's location so the pack UI
  // shows warehouse operators exactly where to walk. Runs in parallel
  // (one lookup per SKU); errors and misses render as "—" rather
  // than blocking the pack flow.
  const skuIds = orderQ.data?.lines.map((l) => l.skuId) ?? [];
  const locationsQ = useQuery({
    queryKey: ["admin", "sku-locations", ...skuIds],
    queryFn: async () => {
      const results = await Promise.all(
        skuIds.map(async (skuId) => {
          try {
            const r = await api.get<SkuLocationLookup>(
              `/admin/inventory-locations/lookup/${encodeURIComponent(skuId)}`,
            );
            return [skuId, r.location] as const;
          } catch {
            return [skuId, null] as const;
          }
        }),
      );
      const out: Record<string, SkuLocationLookup["location"]> = {};
      for (const [id, loc] of results) out[id] = loc;
      return out;
    },
    enabled: skuIds.length > 0,
    staleTime: 60_000,
  });
  // Scanned counts per line-id. Never over-counts (capped at line qty).
  const [scanCounts, setScanCounts] = useState<Record<string, number>>({});
  const [scanFeedback, setScanFeedback] = useState<
    | { tone: "success" | "error"; message: string }
    | null
  >(null);
  const lines = orderQ.data?.lines ?? [];
  const totalUnits = lines.reduce((s, l) => s + l.quantity, 0);
  const scannedUnits = Object.entries(scanCounts).reduce(
    (s, [id, count]) => {
      const line = lines.find((l) => l.id === id);
      if (!line) return s;
      return s + Math.min(count, line.quantity);
    },
    0,
  );
  const allScanned = totalUnits > 0 && scannedUnits >= totalUnits;

  async function handleScan(raw: string): Promise<void> {
    const code = raw.trim();
    if (code.length === 0) return;
    try {
      const res = await api.get<{ match: BarcodeLookupMatch | null }>(
        `/admin/barcodes/lookup?code=${encodeURIComponent(code)}`,
      );
      if (!res.match) {
        setScanFeedback({
          tone: "error",
          message: `Unknown barcode: ${code}`,
        });
        return;
      }
      // Match must belong to this order's vendor AND a line on this order.
      const line = lines.find((l) => l.productId === res.match!.productId);
      if (!line) {
        setScanFeedback({
          tone: "error",
          message: `${res.match.productName} is not on order #${row.orderNumber}.`,
        });
        return;
      }
      setScanCounts((prev) => {
        const current = prev[line.id] ?? 0;
        if (current >= line.quantity) {
          setScanFeedback({
            tone: "error",
            message: `${line.productName} already fully scanned (${line.quantity}).`,
          });
          return prev;
        }
        return { ...prev, [line.id]: current + 1 };
      });
      setScanFeedback({
        tone: "success",
        message: `+1 ${line.productName} (${line.variant})`,
      });
    } catch (err) {
      setScanFeedback({
        tone: "error",
        message:
          err instanceof Error ? err.message : "Barcode lookup failed.",
      });
    }
  }

  // Focus the first input on mount without using autoFocus (which
  // jsx-a11y flags as an antipattern). Scoped to modal open only.
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  // When a preset is picked, mirror its dims into the form so the
  // user SEES what will be sent. Weight stays as goods weight; the
  // dialog's tare hint shows what's added on the server.
  useEffect(() => {
    if (chosenPreset) {
      setForm((f) => ({
        ...f,
        lengthIn: String(chosenPreset.lengthIn),
        widthIn: String(chosenPreset.widthIn),
        heightIn: String(chosenPreset.heightIn),
      }));
      setErrors((e) => ({
        ...e,
        lengthIn: undefined,
        widthIn: undefined,
        heightIn: undefined,
      }));
    }
  }, [chosenPreset]);

  function set<K extends keyof PackFormState>(key: K, value: string): void {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function parseAndValidate(): {
    ok: true;
    payload: {
      lengthIn: number;
      widthIn: number;
      heightIn: number;
      weightOz: number;
      notes?: string;
      packagingOptionId?: string;
    };
  } | { ok: false } {
    const next: Partial<Record<keyof PackFormState, string>> = {};

    const parseDim = (name: keyof PackFormState, label: string): number | null => {
      const raw = form[name].trim();
      if (raw === "") {
        next[name] = `${label} is required.`;
        return null;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        next[name] = `${label} must be a positive number.`;
        return null;
      }
      if (n > MAX_DIM_IN) {
        next[name] = `${label} exceeds ${MAX_DIM_IN} in.`;
        return null;
      }
      return n;
    };

    const parseWeight = (): number | null => {
      const raw = form.weightOz.trim();
      if (raw === "") {
        next.weightOz = "Weight is required.";
        return null;
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) {
        next.weightOz = "Weight must be a whole number of ounces.";
        return null;
      }
      if (n > MAX_WEIGHT_OZ) {
        next.weightOz = `Weight exceeds ${MAX_WEIGHT_OZ} oz (${MAX_WEIGHT_OZ / 16} lb).`;
        return null;
      }
      return n;
    };

    const lengthIn = parseDim("lengthIn", "Length");
    const widthIn = parseDim("widthIn", "Width");
    const heightIn = parseDim("heightIn", "Height");
    const weightOz = parseWeight();

    const notesTrim = form.notes.trim();
    if (notesTrim.length > MAX_NOTES_LEN) {
      next.notes = `Notes cap at ${MAX_NOTES_LEN} characters.`;
    }

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return { ok: false };
    }
    // At this point all four numbers passed — the checks above return
    // null on failure, so a non-null value is safe to assert.
    return {
      ok: true,
      payload: {
        lengthIn: lengthIn as number,
        widthIn: widthIn as number,
        heightIn: heightIn as number,
        weightOz: weightOz as number,
        notes: notesTrim.length > 0 ? notesTrim : undefined,
        packagingOptionId: chosenPreset ? chosenPreset.id : undefined,
      },
    };
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pack-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <EscapeKeyHandler enabled={!submitting} onEscape={onCancel} />
      <div className="w-full max-w-xl rounded-md border border-line bg-white p-6 shadow-lg">
        <div className="flex items-baseline justify-between">
          <h2 id="pack-dialog-title" className="text-h2 font-semibold text-ink">
            Pack order <span className="font-mono">#{row.orderNumber}</span>
          </h2>
          <span className="font-mono text-body-sm text-text-muted">
            {row.vendorBusinessName}
          </span>
        </div>
        <p className="mt-1 text-body-sm text-text-muted">
          Measure the outside of the box, then weigh the packed parcel on
          the platform scale. These numbers feed the live carrier rate
          request in the next step.
        </p>

        {/* Migration 0044 — scan-to-verify panel. Each scanned barcode
            is resolved to a product; the operator can only advance
            when every line item on the order has been fully scanned.
            Belt-and-braces against the pick step going wrong. */}
        <ScanPanel
          lines={lines}
          scanCounts={scanCounts}
          scannedUnits={scannedUnits}
          totalUnits={totalUnits}
          feedback={scanFeedback}
          onScan={handleScan}
          onReset={() => {
            setScanCounts({});
            setScanFeedback(null);
          }}
          loading={orderQ.isLoading}
          locations={locationsQ.data ?? {}}
        />

        {/* Migration 0043 — packaging preset selector. When a preset
            is chosen the dimensions are pinned to the preset's values;
            weight remains the operator-entered goods weight and the
            server adds the tare on top. */}
        <div className="mt-5">
          <Field label="Packaging preset (optional)">
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              disabled={submitting || presetsLoading || presets.length === 0}
              className="w-full rounded-md border border-line bg-white p-2 text-body-sm text-ink"
            >
              <option value="">
                {presetsLoading
                  ? "Loading presets…"
                  : presets.length === 0
                    ? "No presets — enter dimensions manually"
                    : "— Ad-hoc dimensions (type below) —"}
              </option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.lengthIn} × {p.widthIn} × {p.heightIn} in
                  {p.tareWeightOz > 0 ? ` · tare ${p.tareWeightOz} oz` : ""}
                </option>
              ))}
            </select>
          </Field>
          {chosenPreset ? (
            <p className="mt-1 text-body-xs text-text-muted">
              Dimensions are locked to <strong>{chosenPreset.label}</strong>.
              Enter the <em>goods</em> weight below;{" "}
              {chosenPreset.tareWeightOz > 0
                ? `${chosenPreset.tareWeightOz} oz`
                : "0 oz"}{" "}
              of packaging tare is added on the server.
            </p>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4">
          <Field label="Length (in)" error={errors.lengthIn}>
            <Input
              type="text"
              inputMode="decimal"
              value={form.lengthIn}
              onChange={(e) => set("lengthIn", e.target.value)}
              disabled={submitting || chosenPreset !== null}
              // First input focused via useEffect below rather than the
              // autoFocus prop (jsx-a11y flags autoFocus as an
              // accessibility antipattern; a controlled focus lets us
              // scope it to the modal-open transition only).
              ref={firstInputRef}
            />
          </Field>
          <Field label="Width (in)" error={errors.widthIn}>
            <Input
              type="text"
              inputMode="decimal"
              value={form.widthIn}
              onChange={(e) => set("widthIn", e.target.value)}
              disabled={submitting || chosenPreset !== null}
            />
          </Field>
          <Field label="Height (in)" error={errors.heightIn}>
            <Input
              type="text"
              inputMode="decimal"
              value={form.heightIn}
              onChange={(e) => set("heightIn", e.target.value)}
              disabled={submitting || chosenPreset !== null}
            />
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <Field label="Weight (oz)" error={errors.weightOz}>
            <Input
              type="text"
              inputMode="numeric"
              value={form.weightOz}
              onChange={(e) => set("weightOz", e.target.value)}
              disabled={submitting}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field
            label={`Notes (optional, ≤ ${MAX_NOTES_LEN} chars)`}
            error={errors.notes}
          >
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              disabled={submitting}
              rows={3}
              maxLength={MAX_NOTES_LEN + 20 /* soft over-cap; hard check on submit */}
              className="w-full rounded-md border border-line bg-white p-2 text-body-sm text-ink"
              placeholder="Anything the shipper should know (fragile, upright, etc.)"
            />
          </Field>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="amber"
            size="md"
            loading={submitting}
            // Require every unit scanned before pack can be recorded.
            // Warehouse operators can force-submit ONLY by first
            // marking all lines scanned; there's no bypass switch in
            // the modal because the scan step exists to catch pick
            // errors. If the barcode registry is incomplete the
            // super_admin should register the missing barcodes rather
            // than skipping verification.
            disabled={submitting || (totalUnits > 0 && !allScanned)}
            title={
              totalUnits > 0 && !allScanned
                ? `${scannedUnits}/${totalUnits} units scanned. Scan every item before recording pack.`
                : undefined
            }
            onClick={() => {
              const parsed = parseAndValidate();
              if (parsed.ok) onSubmit(parsed.payload);
            }}
          >
            {submitting ? "Saving…" : "Record pack"}
          </Button>
        </div>
      </div>
    </div>
  );
}
