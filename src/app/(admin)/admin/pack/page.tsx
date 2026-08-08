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
  // Phase N — set on library presets that map to a Shippo carrier
  // template (e.g. seeded USPS flat-rate presets). Absent for custom
  // presets. Not exposed as user input on this tab — presence flows
  // through to the server automatically via packagingOptionId.
  packagingType?: "POLY_MAILER" | "BOX";
  shippoTemplate?: string | null;
}

/**
 * Phase N — Shippo carrier template (Option A in the spec). Static
 * list served from `/admin/packaging-options/carrier`. Selecting one
 * at pack time unlocks flat-rate / one-rate / simple-rate pricing at
 * the Shippo rate request.
 */
interface CarrierTemplate {
  carrier: "USPS" | "UPS" | "FEDEX";
  template: string;
  label: string;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  packagingType: "POLY_MAILER" | "BOX";
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

  // Phase N — Shippo carrier templates. Static registry on the backend
  // so this is effectively cache-forever from the browser's viewpoint.
  const carrierTemplatesQ = useQuery({
    queryKey: ["admin", "packaging-options", "carrier"],
    queryFn: () =>
      api.get<{ items: CarrierTemplate[] }>(
        "/admin/packaging-options/carrier",
      ),
    staleTime: 24 * 60 * 60_000,
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
        shippoTemplate?: string;
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
          carrierTemplates={carrierTemplatesQ.data?.items ?? []}
          carrierTemplatesLoading={carrierTemplatesQ.isLoading}
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
  // Migration 0037 — fulfillment mode + vendor-supplied carrier details.
  // VENDOR_CARRIER means the vendor brought their own label; packing
  // hands the order off directly (no platform label / rate picker).
  fulfillmentMode?: "PLATFORM_SHIP" | "VENDOR_CARRIER";
  vendorCarrierName?: string | null;
  vendorTrackingNumber?: string | null;
  vendorLabelUrl?: string | null;
}

interface BarcodeLookupMatch {
  barcodeId: string;
  productId: string;
  vendorId: string;
  productName: string;
  productCode: string;
  variant: string;
  symbology: string;
  /**
   * Set only when the lookup fell through to a SKU-ID match (Avery
   * label printed from /admin/inventory/[skuId]/label). Null when
   * the match came from a registered product_barcodes row (retail
   * UPC/EAN). Scanner uses this to match at SKU level per spec.
   */
  skuId: string | null;
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
              <li key={l.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-medium text-ink">
                    {l.productName}
                  </div>
                  <div className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
                    {l.productCode} · {l.variant}
                  </div>
                  {/* Phase L — screen-visible SKU code. This is the same
                      string the Avery label from /admin/inventory/[skuId]/label
                      encodes as CODE128. Warehouse operators can eyeball
                      it as a fallback when the physical scanner won't
                      cooperate, or click "Scan +1" below to increment
                      the counter through the same server pipeline. */}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard
                          ?.writeText(l.skuId)
                          .catch(() => undefined);
                      }}
                      title="Copy SKU code"
                      className="break-all rounded-sm border border-line bg-white px-2 py-0.5 font-mono text-[11px] text-ink hover:bg-cream-soft"
                    >
                      {l.skuId}
                    </button>
                    {!done ? (
                      <button
                        type="button"
                        onClick={() => onScan(l.skuId)}
                        title="Register a scan for this SKU without using the scanner"
                        className="rounded-sm border border-amber bg-amber/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[1.2px] text-amber hover:bg-amber/20"
                      >
                        Scan +1
                      </button>
                    ) : null}
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
                <div className="flex shrink-0 items-center gap-3">
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
/**
 * Phase N — packaging tab. Determines which source of truth the pack
 * form uses for dimensions:
 *   * "carrier"  — pick a Shippo carrier template (Option A). Dims
 *                  auto-populate, disabled. Weight = goods only.
 *   * "library"  — pick a saved library preset. Dims auto-populate,
 *                  disabled. Weight = goods only.
 *   * "adhoc"    — type dimensions manually. Poly Mailer / Box
 *                  toggle (Option B). Mailer needs L+W; Box needs
 *                  L+W+H. Weight = full parcel weight.
 * All three tabs converge on the same POST payload — only which
 * fields the payload carries differs.
 */
type PackTab = "carrier" | "library" | "adhoc";

/** Sub-mode inside the ad-hoc tab. */
type AdhocPackagingType = "POLY_MAILER" | "BOX";

function PackDialog({
  row,
  presets,
  presetsLoading,
  carrierTemplates,
  carrierTemplatesLoading,
  submitting,
  onCancel,
  onSubmit,
}: {
  row: QueueRow;
  presets: PackagingPreset[];
  presetsLoading: boolean;
  carrierTemplates: CarrierTemplate[];
  carrierTemplatesLoading: boolean;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: {
    lengthIn: number;
    widthIn: number;
    heightIn: number;
    weightOz: number;
    notes?: string;
    packagingOptionId?: string;
    shippoTemplate?: string;
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
  // Phase N — active packaging tab. Defaults to "carrier" because it
  // maps directly onto the spec's Option A (fastest UX: pick, weigh,
  // submit — and unlocks flat-rate pricing).
  const [tab, setTab] = useState<PackTab>("carrier");
  const [carrierTemplateId, setCarrierTemplateId] = useState<string>("");
  const chosenCarrier =
    carrierTemplates.find((t) => t.template === carrierTemplateId) ?? null;
  // Migration 0043 — selected packaging preset. Empty string = no
  // preset (unused when tab !== "library"). When set, the dims
  // fields are pre-filled AND disabled — the preset's dims are
  // authoritative and any local edit would just be discarded server-side.
  const [presetId, setPresetId] = useState<string>("");
  const chosenPreset = presets.find((p) => p.id === presetId) ?? null;
  // Phase N — Poly Mailer vs Box toggle for the ad-hoc tab. Poly
  // mailer only requires L+W; box requires all three dims.
  const [adhocType, setAdhocType] = useState<AdhocPackagingType>("BOX");

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
  // VENDOR_CARRIER ("use my own carrier") — the vendor supplied their own
  // label. Recording the pack hands the order off directly; there's no
  // platform rate picker / label purchase. Surface their label so the
  // operator can print it and adjust the CTA copy accordingly.
  const isVendorCarrier = orderQ.data?.fulfillmentMode === "VENDOR_CARRIER";
  const vendorLabelUrl = orderQ.data?.vendorLabelUrl ?? null;
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
      // Match at SKU level when the lookup fell through to a SKU-ID
      // barcode (the Avery labels printed from
      // /admin/inventory/[skuId]/label). That's the spec's requirement
      // — "Match the barcode to an expected SKU". When the lookup came
      // from a registered product_barcodes row, skuId is null and we
      // fall back to product-level matching (a single retail UPC can
      // cover multiple variants of the same product).
      const match = res.match!;
      const line = match.skuId
        ? lines.find((l) => l.skuId === match.skuId)
        : lines.find((l) => l.productId === match.productId);
      if (!line) {
        setScanFeedback({
          tone: "error",
          message: `${match.productName} is not on order #${row.orderNumber}.`,
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
  // Phase N — mirror dims from whichever source the active tab uses:
  //   * Carrier tab → the chosen carrier template's canonical dims.
  //   * Library tab → the chosen library preset's dims.
  //   * Ad-hoc tab → nothing (operator types the values).
  // Also clears any inline errors on the dim fields when a source is
  // picked, since they'll be overwritten anyway.
  useEffect(() => {
    const source =
      tab === "carrier"
        ? chosenCarrier
          ? {
              lengthIn: chosenCarrier.lengthIn,
              widthIn: chosenCarrier.widthIn,
              heightIn: chosenCarrier.heightIn,
            }
          : null
        : tab === "library" && chosenPreset
          ? {
              lengthIn: chosenPreset.lengthIn,
              widthIn: chosenPreset.widthIn,
              heightIn: chosenPreset.heightIn,
            }
          : null;
    if (source) {
      setForm((f) => ({
        ...f,
        lengthIn: String(source.lengthIn),
        widthIn: String(source.widthIn),
        heightIn: String(source.heightIn),
      }));
      setErrors((e) => ({
        ...e,
        lengthIn: undefined,
        widthIn: undefined,
        heightIn: undefined,
      }));
    }
  }, [tab, chosenCarrier, chosenPreset]);

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
      shippoTemplate?: string;
    };
  } | { ok: false } {
    const next: Partial<Record<keyof PackFormState, string>> = {};

    // Phase N — tab-specific gate. Carrier and Library both require a
    // selection before submit; ad-hoc requires typed dims (L+W always;
    // H only when the packaging type is BOX). The three converge on
    // the same numeric-parsing helpers below.
    if (tab === "carrier" && !chosenCarrier) {
      next.lengthIn = "Pick a carrier packaging option above.";
      setErrors(next);
      return { ok: false };
    }
    if (tab === "library" && !chosenPreset) {
      next.lengthIn = "Pick a library preset above.";
      setErrors(next);
      return { ok: false };
    }
    const heightRequired = !(tab === "adhoc" && adhocType === "POLY_MAILER");

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
    // Height is only required for boxes and for carrier/library
    // sources (which always have all three). For poly-mailer ad-hoc,
    // default to a 0.5-in floor to satisfy the server's positive-dims
    // DB CHECK — Shippo treats sub-inch heights as flat rate anyway.
    const heightInParsed = heightRequired
      ? parseDim("heightIn", "Height")
      : (() => {
          const raw = form.heightIn.trim();
          if (raw === "") return 0.5;
          const n = Number(raw);
          return Number.isFinite(n) && n > 0 && n <= MAX_DIM_IN ? n : 0.5;
        })();
    const weightOz = parseWeight();

    const notesTrim = form.notes.trim();
    if (notesTrim.length > MAX_NOTES_LEN) {
      next.notes = `Notes cap at ${MAX_NOTES_LEN} characters.`;
    }

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return { ok: false };
    }
    // At this point all required numbers passed — the checks above
    // return null on failure, so a non-null value is safe to assert.
    return {
      ok: true,
      payload: {
        lengthIn: lengthIn as number,
        widthIn: widthIn as number,
        heightIn: heightInParsed as number,
        weightOz: weightOz as number,
        notes: notesTrim.length > 0 ? notesTrim : undefined,
        // Tab-specific identifier flows through. Server dispatches on
        // whichever is set. Both are omitted for pure ad-hoc packaging.
        packagingOptionId:
          tab === "library" && chosenPreset ? chosenPreset.id : undefined,
        shippoTemplate:
          tab === "carrier" && chosenCarrier
            ? chosenCarrier.template
            : undefined,
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
      {/* Container clamps at 90vh; header stays pinned, body scrolls
          internally, footer stays pinned so Cancel/Record pack are
          always reachable regardless of viewport height. flex column
          + min-h-0 on the scroll region is what lets overflow-y
          actually kick in inside a flex parent. */}
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-md border border-line bg-white shadow-lg">
        <div className="border-b border-line px-6 pb-4 pt-6">
          <div className="flex items-baseline justify-between">
            <h2 id="pack-dialog-title" className="text-h2 font-semibold text-ink">
              Pack order <span className="font-mono">#{row.orderNumber}</span>
            </h2>
            <span className="font-mono text-body-sm text-text-muted">
              {row.vendorBusinessName}
            </span>
          </div>
          <p className="mt-1 text-body-sm text-text-muted">
            {isVendorCarrier
              ? "This vendor is using their own carrier. Print their label below, pack the parcel, and record the details — the order is handed off to their carrier immediately. No platform label is bought."
              : "Measure the outside of the box, then weigh the packed parcel on the platform scale. These numbers feed the live carrier rate request in the next step."}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-4">

        {/* VENDOR_CARRIER — surface the vendor's own label so the operator
            can print it and affix it before hand-off. There's no Shippo
            label for these orders. */}
        {isVendorCarrier ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-body-sm text-amber-900">
            <div className="font-semibold">Vendor's own carrier</div>
            <p className="mt-1">
              {orderQ.data?.vendorCarrierName
                ? `Carrier: ${orderQ.data.vendorCarrierName}. `
                : ""}
              {orderQ.data?.vendorTrackingNumber
                ? `Tracking: ${orderQ.data.vendorTrackingNumber}. `
                : ""}
              Recording pack details will hand this order off — no platform
              label is purchased.
            </p>
            {vendorLabelUrl ? (
              <a
                href={vendorLabelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block font-semibold underline"
              >
                Open / print vendor label →
              </a>
            ) : (
              <p className="mt-2 italic">
                No label was attached by the vendor. Confirm with them before
                handing off.
              </p>
            )}
          </div>
        ) : null}

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

        {/* Phase N — 3-tab packaging chooser (Option A / Library /
            Option B in the spec). Only ONE tab is active at a time;
            all three converge on the same POST payload. Dims fields
            below are disabled unless the ad-hoc tab is active — the
            server treats the carrier / library selections as
            authoritative and would discard client-supplied dims. */}
        <div className="mt-5">
          <div className="mb-2 flex gap-1 border-b border-line">
            {(
              [
                { key: "carrier", label: "Carrier packaging" },
                { key: "library", label: "From library" },
                { key: "adhoc", label: "Ad-hoc" },
              ] as Array<{ key: PackTab; label: string }>
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                disabled={submitting}
                className={
                  tab === t.key
                    ? "border-b-2 border-amber px-3 py-2 font-mono text-mono-label uppercase tracking-[1.4px] text-amber"
                    : "border-b-2 border-transparent px-3 py-2 font-mono text-mono-label uppercase tracking-[1.4px] text-text-muted hover:text-ink"
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "carrier" ? (
            <div className="pt-3">
              <Field label="Shippo carrier template">
                <select
                  value={carrierTemplateId}
                  onChange={(e) => setCarrierTemplateId(e.target.value)}
                  disabled={
                    submitting ||
                    carrierTemplatesLoading ||
                    carrierTemplates.length === 0
                  }
                  className="w-full rounded-md border border-line bg-white p-2 text-body-sm text-ink"
                >
                  <option value="">
                    {carrierTemplatesLoading
                      ? "Loading carrier templates…"
                      : "— Pick a carrier packaging option —"}
                  </option>
                  {(["USPS", "UPS", "FEDEX"] as const).map((c) => {
                    const inCarrier = carrierTemplates.filter(
                      (t) => t.carrier === c,
                    );
                    if (inCarrier.length === 0) return null;
                    return (
                      <optgroup key={c} label={c}>
                        {inCarrier.map((t) => (
                          <option key={t.template} value={t.template}>
                            {t.label} · {t.lengthIn} × {t.widthIn} ×{" "}
                            {t.heightIn} in
                            {t.tareWeightOz > 0
                              ? ` · tare ${t.tareWeightOz} oz`
                              : ""}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </Field>
              {chosenCarrier ? (
                <p className="mt-1 text-body-xs text-text-muted">
                  Dimensions locked to <strong>{chosenCarrier.label}</strong>.
                  Passed to Shippo as{" "}
                  <span className="font-mono">{chosenCarrier.template}</span> to
                  unlock flat-rate / one-rate / simple-rate pricing. Enter the{" "}
                  <em>goods</em> weight below;{" "}
                  {chosenCarrier.tareWeightOz > 0
                    ? `${chosenCarrier.tareWeightOz} oz`
                    : "0 oz"}{" "}
                  of packaging tare is added on the server.
                </p>
              ) : (
                <p className="mt-1 text-body-xs text-text-muted">
                  Option A in the spec — pick a Shippo template and Shippo
                  returns flat-rate pricing at the rate step.
                </p>
              )}
            </div>
          ) : null}

          {tab === "library" ? (
            <div className="pt-3">
              <Field label="Library preset">
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
                        ? "No presets — switch to Ad-hoc or ask a super admin to create one"
                        : "— Pick a saved preset —"}
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
                  Dimensions locked to <strong>{chosenPreset.label}</strong>.
                  {chosenPreset.shippoTemplate ? (
                    <>
                      {" "}
                      Maps to Shippo template{" "}
                      <span className="font-mono">
                        {chosenPreset.shippoTemplate}
                      </span>{" "}
                      — flat-rate pricing will be requested.
                    </>
                  ) : null}{" "}
                  Enter the <em>goods</em> weight below;{" "}
                  {chosenPreset.tareWeightOz > 0
                    ? `${chosenPreset.tareWeightOz} oz`
                    : "0 oz"}{" "}
                  of packaging tare is added on the server.
                </p>
              ) : null}
            </div>
          ) : null}

          {tab === "adhoc" ? (
            <div className="pt-3">
              <div className="mb-2 flex gap-2">
                {(
                  [
                    { key: "BOX", label: "Box (L × W × H)" },
                    { key: "POLY_MAILER", label: "Poly mailer (L × W)" },
                  ] as Array<{ key: AdhocPackagingType; label: string }>
                ).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setAdhocType(t.key)}
                    disabled={submitting}
                    className={
                      adhocType === t.key
                        ? "rounded-sm border border-amber bg-amber/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[1.2px] text-amber"
                        : "rounded-sm border border-line bg-white px-3 py-1 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="text-body-xs text-text-muted">
                Option B in the spec — type the measured outside dims of the
                parcel. Weight-based pricing at the rate step.
              </p>
            </div>
          ) : null}
        </div>

        {/* Dim inputs — always visible. Disabled + auto-filled on the
            carrier / library tabs; editable on ad-hoc. Height hidden
            for the ad-hoc poly-mailer sub-mode (server floors to 0.5). */}
        <div
          className={
            tab === "adhoc" && adhocType === "POLY_MAILER"
              ? "mt-4 grid grid-cols-2 gap-4"
              : "mt-4 grid grid-cols-3 gap-4"
          }
        >
          <Field label="Length (in)" error={errors.lengthIn}>
            <Input
              type="text"
              inputMode="decimal"
              value={form.lengthIn}
              onChange={(e) => set("lengthIn", e.target.value)}
              disabled={submitting || tab !== "adhoc"}
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
              disabled={submitting || tab !== "adhoc"}
            />
          </Field>
          {tab === "adhoc" && adhocType === "POLY_MAILER" ? null : (
            <Field label="Height (in)" error={errors.heightIn}>
              <Input
                type="text"
                inputMode="decimal"
                value={form.heightIn}
                onChange={(e) => set("heightIn", e.target.value)}
                disabled={submitting || tab !== "adhoc"}
              />
            </Field>
          )}
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

        </div>

        {/* Pinned footer — stays visible no matter how tall the body
            content grows. Border-top separates it from the scrolling
            region above. */}
        <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
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
            {submitting
              ? "Saving…"
              : isVendorCarrier
                ? "Record pack & hand off"
                : "Record pack"}
          </Button>
        </div>
      </div>
    </div>
  );
}
