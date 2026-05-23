"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Layers, Package, PackagePlus, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";

import { ErrorBanner } from "@/components/errors/error-banner";
import { StorageTierGuide } from "@/components/portal/storage-tier-guide";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";
import type { PublicProduct } from "@/lib/schemas/products";
import {
  createPsnSchema,
  type CreatePsnInput,
  type PublicPsn,
  type StorageTier,
} from "@/lib/schemas/psn";
import {
  FALLBACK_PALLET_POLICY,
  FALLBACK_TIERS,
  TIER_METADATA,
} from "@/lib/storage-tiers";

const TIERS: StorageTier[] = ["SMALL", "MEDIUM", "LARGE", "X_LARGE", "PALLET"];

// Wire shape returned by GET /v1/fees/onboarding. Mirrors the storage on
// the `fee_schedule` config row — each tier is either a priced object or
// a "negotiated" marker.
type OnboardingFeeEntry =
  | { stockingCents: number; firstMonthStorageCents: number; totalCents: number; negotiated?: false }
  | { negotiated: true };
type OnboardingFees = Record<StorageTier, OnboardingFeeEntry>;

export default function NewPsnPage() {
  const router = useRouter();
  const qc = useQueryClient();

  // The API caps `limit` at 100. Asking for more makes Zod reject with 400
  // and the page silently falls into the empty state below.
  // TODO: paginate properly once a vendor has >100 active products.
  const productsQ = useQuery({
    queryKey: ["products", { status: "ACTIVE" }],
    queryFn: () =>
      api.get<{ items: PublicProduct[]; nextCursor: string | null }>("/products?limit=100&status=ACTIVE"),
  });

  // Pull the live onboarding fee schedule from the API instead of trusting
  // a frontend constant. Without this, finance staff editing rates via
  // /admin/config/fees would silently desync from what vendors see in the
  // submit preview here. The backend's compute path at PSN submit reads
  // the same source of truth, so preview and reality always agree.
  const feesQ = useQuery({
    queryKey: ["fees", "onboarding"],
    queryFn: () => api.get<{ onboarding: OnboardingFees }>("/fees/onboarding"),
    // Rates change rarely; let the data sit a bit before re-fetching.
    staleTime: 60_000,
  });

  const form = useForm<CreatePsnInput>({
    resolver: zodResolver(createPsnSchema),
    defaultValues: {
      // Migration 0033 — explicit shipping mode on the wire. LOOSE matches
      // the historical implicit default for any client that didn't carry
      // the field.
      shippingMode: "LOOSE",
      declaredBoxCounts: { SMALL: 0, MEDIUM: 0, LARGE: 0, X_LARGE: 0, PALLET: 0 },
      lines: [],
      notes: "",
    },
  });
  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  const { bannerError, handle, clear } = useApiErrorHandler(form);

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const declaredBoxCounts = watch("declaredBoxCounts");

  // ---------------------------------------------------------------------------
  // Shipping mode — loose boxes, new pallet shipment, or top-up of an
  // existing pallet. Mirrors the backend ShippingMode enum (migration 0033).
  // Local string is uppercase to match the wire format directly; submit
  // includes `shippingMode` on the payload alongside `declaredBoxCounts`.
  //
  // Aggregation:
  //   LOOSE          — declaredBoxCounts is the source of truth, one row
  //                    per tier from the simple per-tier input row.
  //   PALLET         — separate `pallets` array aggregates into
  //                    declaredBoxCounts (sum per tier + PALLET = count).
  //   ADD_TO_PALLET  — single uniform tier + single box count, written
  //                    straight into declaredBoxCounts[tier]. PALLET tier
  //                    stays zero (no new pallet is being created).
  // ---------------------------------------------------------------------------
  type ShippingMode = "LOOSE" | "PALLET" | "ADD_TO_PALLET";
  type PalletBoxTier = "SMALL" | "MEDIUM" | "LARGE" | "X_LARGE";
  interface PalletSpec {
    id: string;
    tier: PalletBoxTier;
    boxCount: number;
  }
  const PALLET_BOX_TIERS: PalletBoxTier[] = ["SMALL", "MEDIUM", "LARGE", "X_LARGE"];

  const [shippingMode, setShippingMode] = useState<ShippingMode>("LOOSE");
  const [pallets, setPallets] = useState<PalletSpec[]>([]);

  // ADD_TO_PALLET mode — single uniform tier + single box count. Kept in
  // local state because the form's declaredBoxCounts is per-tier and we
  // want the tier selector to be a radio rather than a number input row.
  const [addToPalletTier, setAddToPalletTier] = useState<PalletBoxTier>("MEDIUM");
  const [addToPalletBoxes, setAddToPalletBoxes] = useState<number>(0);

  // When pallets change OR the mode flips, push the aggregate counts back
  // into the form's declaredBoxCounts so the existing preview/submit math
  // (which reads from declaredBoxCounts) keeps working unchanged.
  useEffect(() => {
    if (shippingMode !== "PALLET") return;
    const agg: Record<StorageTier, number> = {
      SMALL: 0,
      MEDIUM: 0,
      LARGE: 0,
      X_LARGE: 0,
      PALLET: 0,
    };
    for (const p of pallets) {
      const n = Math.max(0, Math.floor(Number(p.boxCount) || 0));
      if (n > 0) {
        agg[p.tier] += n;
        agg.PALLET += 1;
      }
    }
    setValue("declaredBoxCounts", agg, { shouldDirty: true });
    // We deliberately omit setValue from the deps — react-hook-form
    // guarantees a stable reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pallets, shippingMode]);

  // ADD_TO_PALLET — aggregate the single tier + count straight into
  // declaredBoxCounts (PALLET stays zero; the backend rejects a non-zero
  // PALLET tier in this mode with `psn_invalid_shipping_declaration`).
  useEffect(() => {
    if (shippingMode !== "ADD_TO_PALLET") return;
    const n = Math.max(0, Math.floor(Number(addToPalletBoxes) || 0));
    const agg: Record<StorageTier, number> = {
      SMALL: 0,
      MEDIUM: 0,
      LARGE: 0,
      X_LARGE: 0,
      PALLET: 0,
    };
    agg[addToPalletTier] = n;
    setValue("declaredBoxCounts", agg, { shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shippingMode, addToPalletTier, addToPalletBoxes]);

  // When the vendor flips between modes, reset declaredBoxCounts so we
  // don't carry stale numbers across. The user gets a clean slate to
  // enter the box mix or pallet plan from scratch.
  function flipShippingMode(next: ShippingMode): void {
    if (next === shippingMode) return;
    setShippingMode(next);
    setValue("shippingMode", next, { shouldDirty: true });
    setValue(
      "declaredBoxCounts",
      { SMALL: 0, MEDIUM: 0, LARGE: 0, X_LARGE: 0, PALLET: 0 },
      { shouldDirty: true },
    );
    if (next === "PALLET" && pallets.length === 0) {
      // Bootstrap with one empty pallet so the vendor sees the picker.
      setPallets([{ id: crypto.randomUUID(), tier: "SMALL", boxCount: 0 }]);
    }
    if (next === "ADD_TO_PALLET") {
      // Reset add-to-pallet inputs on entry so the vendor doesn't carry
      // a stale tier/count from a previous attempt.
      setAddToPalletBoxes(0);
    }
  }

  // Mutating the pallet list re-renders the form section, which (when a
  // field is later focused or the form revalidates) can cause the page
  // to jump as the browser scrolls a field into view. Capture the scroll
  // position on the click event and restore it on the next animation
  // frame so the click feels like an in-place mutation.
  function preserveScroll(fn: () => void): void {
    const y = typeof window !== "undefined" ? window.scrollY : 0;
    fn();
    if (typeof window === "undefined") return;
    // Restore on the next frame after React commits the new card to the
    // DOM. A simple setTimeout(0) sometimes lands BEFORE the commit on
    // slower machines; rAF is reliably post-commit.
    requestAnimationFrame(() => {
      window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
    });
  }

  function addPallet(e?: React.MouseEvent): void {
    e?.preventDefault();
    preserveScroll(() => {
      setPallets((prev) => [
        ...prev,
        { id: crypto.randomUUID(), tier: "SMALL", boxCount: 0 },
      ]);
    });
  }

  function updatePallet(id: string, patch: Partial<Omit<PalletSpec, "id">>): void {
    setPallets((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removePallet(id: string): void {
    preserveScroll(() => {
      setPallets((prev) => prev.filter((p) => p.id !== id));
    });
  }

  // Aggregate stats for the pallet summary row.
  const palletSummary = useMemo(() => {
    let totalBoxes = 0;
    let validPallets = 0;
    for (const p of pallets) {
      const n = Math.max(0, Math.floor(Number(p.boxCount) || 0));
      if (n > 0) {
        totalBoxes += n;
        validPallets += 1;
      }
    }
    return { totalBoxes, validPallets };
  }, [pallets]);

  // Live preview total. Mirrors the backend's computeOnboardingFeeCents():
  //   - LOOSE:          per-box stocking + first-month storage (totalCents)
  //   - PALLET:         per-box stocking + pallet's $45/mo first-month line
  //   - ADD_TO_PALLET:  per-box stocking only (existing pallet's $45/mo
  //                     covers storage; no new pallet line)
  // Falls back to null when the live schedule hasn't loaded so the UI
  // doesn't show a guessed estimate.
  const onboardingFees = feesQ.data?.onboarding;
  const previewIsLive = !!onboardingFees;
  const isPalletMode = shippingMode === "PALLET";
  const isAddToPalletMode = shippingMode === "ADD_TO_PALLET";
  // Pallet monthly storage rate. The /v1/fees/onboarding endpoint doesn't
  // surface monthly storage rates — we read it from FALLBACK_TIERS, which
  // mirrors prisma/seed.ts. KEEP IN SYNC if pallet pricing changes.
  const palletMonthlyCents = FALLBACK_TIERS.monthlyStorage.PALLET ?? 0;
  const previewFeeCents = onboardingFees
    ? TIERS.reduce((acc, tier) => {
        const count = Number(declaredBoxCounts?.[tier] ?? 0);
        if (count <= 0) return acc;
        if (tier === "PALLET") {
          // Pallet's first-month storage line — only in PALLET mode.
          // ADD_TO_PALLET never declares PALLET (the backend rejects it
          // with `psn_invalid_shipping_declaration`); LOOSE doesn't have
          // a pallet line. Either way we skip it.
          return isPalletMode ? acc + palletMonthlyCents * count : acc;
        }
        const entry = onboardingFees[tier];
        if (!entry || ("negotiated" in entry && entry.negotiated)) return acc;
        // PALLET / ADD_TO_PALLET: stocking only (an existing or new pallet
        // covers storage). LOOSE: full stocking + first-month per box.
        const perBox =
          isPalletMode || isAddToPalletMode ? entry.stockingCents : entry.totalCents;
        return acc + perBox * count;
      }, 0)
    : null;
  // ADD_TO_PALLET savings hint — what the vendor would have paid in LOOSE
  // mode for the same boxes, so we can show the delta on the preview.
  // Only meaningful in ADD_TO_PALLET mode; null otherwise.
  const looseEquivalentCents =
    isAddToPalletMode && onboardingFees
      ? TIERS.reduce((acc, tier) => {
          if (tier === "PALLET") return acc;
          const count = Number(declaredBoxCounts?.[tier] ?? 0);
          if (count <= 0) return acc;
          const entry = onboardingFees[tier];
          if (!entry || ("negotiated" in entry && entry.negotiated)) return acc;
          return acc + entry.totalCents * count;
        }, 0)
      : null;
  // A non-PALLET tier is "negotiated" if the live schedule says so. PALLET
  // is no longer auto-negotiated — it has a real $45/mo rate now.
  const hasNegotiatedDeclared = TIERS.some((t) => {
    if (t === "PALLET") return false;
    const count = Number(declaredBoxCounts?.[t] ?? 0);
    if (count <= 0) return false;
    if (!onboardingFees) return false;
    const entry = onboardingFees[t];
    return !!entry && "negotiated" in entry && entry.negotiated;
  });

  async function onSubmit(values: CreatePsnInput): Promise<void> {
    clear();
    try {
      // Strip zero-count tiers — the API requires at least one positive entry.
      const cleanedCounts = Object.fromEntries(
        Object.entries(values.declaredBoxCounts).filter(([, v]) => Number(v) > 0),
      );
      const created = await api.post<PublicPsn>("/psns", {
        ...values,
        declaredBoxCounts: cleanedCounts,
      });
      await qc.invalidateQueries({ queryKey: ["psns"] });
      router.push(`/psn/${created.id}`);
    } catch (err) {
      handle(err);
    }
  }

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "support") window.location.href = "mailto:support@myusaerrands.com";
  }

  if (productsQ.isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading products…</div>;
  }
  // Distinguish "the request failed" from "no products yet" — they're very
  // different problems and conflating them masked a query-cap bug for a
  // while. Show the real error so the next regression is obvious.
  if (productsQ.error) {
    const normalized = normalizeError(productsQ.error);
    return (
      <div
        role="alert"
        className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4"
      >
        <div className="font-mono text-mono-label uppercase text-error">
          {normalized.entry.title}
        </div>
        <p className="mt-1 text-body-sm text-text">{normalized.entry.body}</p>
        {normalized.correlationId ? (
          <div className="mt-2 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted">
            Reference: {normalized.correlationId.slice(0, 16)}
          </div>
        ) : null}
      </div>
    );
  }
  if (!productsQ.data || productsQ.data.items.length === 0) {
    return (
      <div className="rounded-md border-l-4 border-amber bg-amber/10 px-5 py-4 text-body-sm">
        Add at least one product before creating a PSN. Go to Products → Add product.
      </div>
    );
  }
  const products = productsQ.data.items;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="[04] PSN / New"
        title="New Pre-Shipment Notice"
        description="Declare every product and box you're shipping. The onboarding fee is computed from the box mix at submit — open the storage tier guide if you're unsure which tier to pick."
      />

      {/* Boxes by tier — same prominent reference card as on the PSN list.
          Lives under the header so a vendor about to fill in box counts
          can look up the live pricing without leaving the form. */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-cream-soft px-6 py-5">
        <div>
          <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
            Boxes by tier
          </div>
          <h2 className="mt-1 text-h3 font-semibold text-ink">
            Look up storage tier pricing
          </h2>
          <p className="mt-1 max-w-prose text-body-sm text-text-muted">
            Dimensions, cubic volume, stocking fee, and monthly storage for each
            tier — sourced live from the admin pricing config, so what you see
            is exactly what your wallet is debited at submit.
          </p>
        </div>
        <StorageTierGuide triggerLabel="Open storage tier guide" />
      </section>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-8" noValidate>
        {/* Shipment meta */}
        <section className="rounded-md border border-line bg-white p-8">
          <h2 className="mb-4 font-mono text-mono-label uppercase text-text-muted">Shipment</h2>
          <div className="grid gap-5 md:grid-cols-3">
            <Field label="Expected arrival">
              <Input type="date" {...register("expectedArrivalDate")} />
            </Field>
            <Field label="Carrier" hint="DHL, FedEx International, UPS, etc.">
              <Input type="text" placeholder="DHL Express" {...register("carrier")} />
            </Field>
            <Field label="Master tracking">
              <Input type="text" placeholder="1Z999AA10123456784" {...register("masterTracking")} />
            </Field>
          </div>
          <Field label="Notes (optional)" className="mt-5">
            <Input
              type="text"
              placeholder="Anything the warehouse should know"
              {...register("notes")}
            />
          </Field>
        </section>

        {/* Shipment composition — vendor picks loose-boxes OR pallet
            shipping. Loose mode keeps the simple per-tier box-count
            row. Pallet mode renders a per-pallet builder where each
            pallet has a uniform box tier and a count capped by the
            policy. Both modes write through to declaredBoxCounts so
            the fee preview and submit math are identical downstream. */}
        <section className="rounded-md border border-line bg-white p-8">
          <h2 className="mb-1 font-mono text-mono-label uppercase text-text-muted">
            Shipment composition
          </h2>
          <p className="mb-5 max-w-prose text-body-sm text-text-muted">
            Loose boxes drop into our receiving lanes one carton at a time. A
            pallet is a single bulk unit with uniform-tier boxes on top — same
            per-box receiving &amp; setup fees, but the pallet itself is
            billed at the static pallet storage rate going forward.
          </p>

          <div role="radiogroup" aria-label="Shipping mode" className="grid gap-3 md:grid-cols-3">
            <ModeCard
              active={shippingMode === "LOOSE"}
              icon={Package}
              title="Loose boxes"
              body="Individual cartons declared per tier. Receiving fees + first-month storage charged at PSN submit per box."
              onSelect={() => flipShippingMode("LOOSE")}
            />
            <ModeCard
              active={shippingMode === "PALLET"}
              icon={Layers}
              title="Pallet shipment"
              body="One pallet = one bulk unit. Each pallet carries a single uniform box tier (never mixed). Per-box receiving fees apply, then $45/month per pallet from the next billing cycle."
              onSelect={() => flipShippingMode("PALLET")}
            />
            <ModeCard
              active={shippingMode === "ADD_TO_PALLET"}
              icon={PackagePlus}
              title="Add to existing pallet"
              body="Top up a pallet you already have at our warehouse. Pay receiving fees only — your existing pallet's $45/month covers storage. Confirm space + tier with admin before submitting."
              onSelect={() => flipShippingMode("ADD_TO_PALLET")}
            />
          </div>

          {shippingMode === "LOOSE" ? (
            // Loose-box inputs — four tiers (PALLET stays out of this row;
            // pallets live in the other modes).
            <div className="mt-6 grid gap-5 md:grid-cols-4">
              {PALLET_BOX_TIERS.map((tier) => (
                <Field key={tier} label={tier.replace("_", "-")}>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    {...register(`declaredBoxCounts.${tier}`, { valueAsNumber: true })}
                  />
                </Field>
              ))}
            </div>
          ) : shippingMode === "ADD_TO_PALLET" ? (
            // ADD_TO_PALLET — single uniform tier + single box count.
            // Yellow disclaimer card up top is the only thing standing
            // between a vendor and a bad declaration in V1 (we don't yet
            // have a Pallet entity to enforce capacity / tier match
            // automatically), so it's loud on purpose.
            <div className="mt-6 flex flex-col gap-5">
              <div
                role="alert"
                className="flex gap-3 rounded-md border-l-4 border-amber bg-amber/10 px-5 py-4"
              >
                <AlertTriangle
                  aria-hidden
                  className="mt-0.5 h-5 w-5 shrink-0 text-amber"
                />
                <div className="text-body-sm leading-relaxed text-text">
                  <strong className="block text-ink">
                    Confirm with admin before submitting.
                  </strong>
                  <span>
                    Open the PSN chat (or email support) to confirm{" "}
                    <strong>how many slots are free</strong> on your existing pallet
                    and <strong>the tier of boxes</strong> on it. Boxes you ship
                    must match that tier exactly — mismatched tiers or extra
                    boxes will be rejected at receive (charged as a new pallet,
                    quarantined, or returned at your cost). Your existing
                    pallet&apos;s ${(palletMonthlyCents / 100).toFixed(0)}/month
                    covers storage for everything that fits.
                  </span>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-[1fr_180px]">
                <div>
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-[1.4px] text-text-muted">
                    Box tier (must match your existing pallet)
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PALLET_BOX_TIERS.map((t) => {
                      const checked = addToPalletTier === t;
                      return (
                        <label
                          key={t}
                          className={
                            "flex cursor-pointer flex-col gap-1 rounded-sm border px-3 py-2 text-body-sm transition-colors " +
                            (checked
                              ? "border-amber bg-amber/10 text-ink"
                              : "border-line bg-white text-text hover:border-line-strong")
                          }
                        >
                          <input
                            type="radio"
                            name="add-to-pallet-tier"
                            value={t}
                            checked={checked}
                            onChange={() => setAddToPalletTier(t)}
                            className="sr-only"
                          />
                          <span className="font-medium">
                            {t.replace("_", "-")}
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted">
                            up to {FALLBACK_PALLET_POLICY.maxBoxesPerPallet[t]} boxes
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <Field
                  label="Box count"
                  hint="Confirmed free slots only"
                >
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={addToPalletBoxes}
                    onChange={(e) =>
                      setAddToPalletBoxes(
                        Math.max(0, Math.floor(Number(e.target.value) || 0)),
                      )
                    }
                  />
                </Field>
              </div>
            </div>
          ) : (
            // Pallet-builder mode. Each pallet card picks its uniform
            // box tier (radio) + box count (capped by the policy). The
            // declaredBoxCounts aggregation runs in useEffect above.
            <div className="mt-6 flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
                  {palletSummary.validPallets} pallet
                  {palletSummary.validPallets === 1 ? "" : "s"} ·{" "}
                  {palletSummary.totalBoxes} box
                  {palletSummary.totalBoxes === 1 ? "" : "es"} total
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => addPallet(e)}
                >
                  <Plus className="h-4 w-4" /> Add pallet
                </Button>
              </div>

              {pallets.length === 0 ? (
                <div className="rounded-md border border-dashed border-line-strong bg-cream-soft px-6 py-8 text-center text-body-sm text-text-muted">
                  Click <strong>Add pallet</strong> to start declaring pallets.
                </div>
              ) : (
                pallets.map((p, idx) => {
                  const cap =
                    FALLBACK_PALLET_POLICY.maxBoxesPerPallet[p.tier] ?? 50;
                  const over = p.boxCount > cap;
                  return (
                    <div
                      key={p.id}
                      className={
                        "rounded-md border bg-cream-soft p-5 " +
                        (over ? "border-error" : "border-line")
                      }
                    >
                      <div className="mb-3 flex items-baseline justify-between">
                        <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-text">
                          Pallet #{idx + 1}
                        </div>
                        {pallets.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removePallet(p.id)}
                            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-error"
                            aria-label={`Remove pallet ${idx + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remove
                          </button>
                        ) : null}
                      </div>

                      <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                        <div>
                          <div className="mb-2 font-mono text-[10px] uppercase tracking-[1.4px] text-text-muted">
                            Box tier on this pallet
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {PALLET_BOX_TIERS.map((t) => {
                              const checked = p.tier === t;
                              return (
                                <label
                                  key={t}
                                  className={
                                    "flex cursor-pointer flex-col gap-1 rounded-sm border px-3 py-2 text-body-sm transition-colors " +
                                    (checked
                                      ? "border-amber bg-amber/10 text-ink"
                                      : "border-line bg-white text-text hover:border-line-strong")
                                  }
                                >
                                  <input
                                    type="radio"
                                    name={`pallet-${p.id}-tier`}
                                    value={t}
                                    checked={checked}
                                    onChange={() =>
                                      updatePallet(p.id, {
                                        tier: t,
                                        // Clamp the existing count down to the
                                        // new tier's cap so we don't carry a
                                        // 50-box count across to LARGE (max 8).
                                        boxCount: Math.min(
                                          p.boxCount,
                                          FALLBACK_PALLET_POLICY
                                            .maxBoxesPerPallet[t] ?? 50,
                                        ),
                                      })
                                    }
                                    className="sr-only"
                                  />
                                  <span className="font-medium">
                                    {t.replace("_", "-")}
                                  </span>
                                  <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-text-muted">
                                    up to {FALLBACK_PALLET_POLICY.maxBoxesPerPallet[t]} boxes
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        <Field
                          label="Box count"
                          hint={`Max ~${cap} for this tier`}
                          error={over ? `Over the ~${cap}-box recommendation.` : undefined}
                        >
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={p.boxCount}
                            invalid={over}
                            onChange={(e) =>
                              updatePallet(p.id, {
                                boxCount: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                              })
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          <div className="mt-6 flex items-baseline justify-between border-t border-line pt-4">
            <span className="font-mono text-mono-label uppercase text-text-muted">
              {shippingMode === "PALLET"
                ? "Receiving & setup (per-box) + pallet at submit"
                : shippingMode === "ADD_TO_PALLET"
                  ? "Receiving fee (stocking only) at submit"
                  : "Estimated onboarding fee"}
            </span>
            <span className="font-mono text-h2 tabular-nums">
              {previewIsLive && previewFeeCents !== null ? (
                <>
                  ${(previewFeeCents / 100).toFixed(2)}
                  {hasNegotiatedDeclared ? (
                    <span className="ml-2 font-mono text-body-sm text-amber">
                      + negotiated tier quote
                    </span>
                  ) : null}
                </>
              ) : (
                // Schedule fetch is in flight or failed. Don't show a stale
                // estimate from frontend constants — the backend computes
                // the real charge at submit either way.
                <span className="font-mono text-body-sm text-text-muted">
                  {feesQ.error
                    ? "Live rate unavailable — submit will use the current schedule."
                    : "Loading rates…"}
                </span>
              )}
            </span>
          </div>
          {shippingMode === "PALLET" && palletSummary.validPallets > 0 ? (
            <p className="mt-2 text-caption text-text-muted">
              Pallet mode: stocking fees apply per box on every pallet; per-box
              storage is replaced by the pallet&apos;s ${(palletMonthlyCents / 100).toFixed(0)}/month
              rate (charged for the first month at submit, then monthly on the
              1st going forward).
            </p>
          ) : null}
          {isAddToPalletMode &&
          previewFeeCents !== null &&
          looseEquivalentCents !== null &&
          looseEquivalentCents > previewFeeCents &&
          addToPalletBoxes > 0 ? (
            <p className="mt-2 text-caption text-text-muted">
              Add-to-pallet: stocking fee only — no new pallet line, no per-box
              first-month storage. Your existing pallet&apos;s ${(palletMonthlyCents / 100).toFixed(0)}/month
              continues to cover storage.{" "}
              <span className="text-success">
                Saves ${((looseEquivalentCents - previewFeeCents) / 100).toFixed(2)}{" "}
                vs. shipping these boxes loose.
              </span>
            </p>
          ) : null}
          {errors.declaredBoxCounts ? (
            <span className="mt-2 block text-caption text-error">
              {errors.declaredBoxCounts.message ?? "Declare at least one box."}
            </span>
          ) : null}

          {/* Pallet policy reminder — only shown in pallet mode. The
              uniform-tier rule is already enforced per-pallet by the UI,
              so this reminder mostly serves to surface the max-box
              counts for each tier. */}
          {shippingMode === "PALLET" && palletSummary.validPallets > 0 ? (
            <PalletPolicyReminder
              declared={declaredBoxCounts ?? {
                SMALL: 0,
                MEDIUM: 0,
                LARGE: 0,
                X_LARGE: 0,
                PALLET: 0,
              }}
            />
          ) : null}
        </section>

        {/* Lines */}
        <section className="rounded-md border border-line bg-white p-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-mono text-mono-label uppercase text-text-muted">Lines</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({
                  productId: products[0]?.id ?? "",
                  declaredQty: 1,
                  notes: "",
                })
              }
            >
              <Plus className="h-4 w-4" />
              Add line
            </Button>
          </div>

          {fields.length === 0 ? (
            <div className="rounded-md border border-dashed border-line-strong bg-cream-soft px-6 py-10 text-center text-body-sm text-text-muted">
              No lines yet. Add a line for each product type in this shipment.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {fields.map((f, idx) => (
                <div
                  key={f.id}
                  className="grid gap-4 rounded-sm border border-line bg-cream-soft p-4 md:grid-cols-[1fr_140px_1fr_44px] md:items-end"
                >
                  <Field label="Product">
                    <Controller
                      control={control}
                      name={`lines.${idx}.productId`}
                      render={({ field }) => (
                        <select
                          {...field}
                          className="h-11 rounded-sm border border-line-strong bg-white px-3 font-sans text-body text-text outline-none focus:border-ink"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} — {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                    />
                  </Field>
                  <Field label="Qty" error={errors.lines?.[idx]?.declaredQty?.message}>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      {...register(`lines.${idx}.declaredQty`, { valueAsNumber: true })}
                    />
                  </Field>
                  <Field label="Notes (optional)">
                    <Input type="text" {...register(`lines.${idx}.notes`)} />
                  </Field>
                  <button
                    type="button"
                    aria-label="Remove line"
                    onClick={() => remove(idx)}
                    className="flex h-11 w-11 items-center justify-center rounded-sm border border-line-strong bg-white text-text-muted hover:border-error hover:text-error"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {errors.lines?.message ? (
            <span className="mt-2 block text-caption text-error">{errors.lines.message}</span>
          ) : null}
        </section>

        <ErrorBanner error={bannerError} onAction={onAction} />

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/psn")}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="lg" withArrow loading={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save as draft"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModeCard — radio-style selector card for the shipping-mode toggle.
// Clicking the card flips the form into either loose-box or pallet mode.
// ---------------------------------------------------------------------------

function ModeCard({
  active,
  icon: Icon,
  title,
  body,
  onSelect,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  onSelect: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={
        "flex flex-col gap-3 rounded-md border p-5 text-left transition-colors " +
        (active
          ? "border-amber bg-amber/10 text-ink"
          : "border-line bg-white text-text hover:border-line-strong")
      }
    >
      <div className="flex items-center gap-2">
        <Icon className={"h-5 w-5 " + (active ? "text-amber" : "text-text-muted")} aria-hidden />
        <span className="font-medium text-ink">{title}</span>
        {active ? (
          <span className="ml-auto rounded-sm border border-amber/40 bg-amber/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[1.2px] text-amber">
            Selected
          </span>
        ) : null}
      </div>
      <p className="text-body-sm text-text-muted">{body}</p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// PalletPolicyReminder — uniform-tier rule + max-box hint when the vendor
// declares PALLET boxes. Pure UI helper, no validation side-effects: the
// API still accepts mixed counts. The reminder exists so the vendor can
// recognise the policy violation BEFORE it hits the warehouse and turns
// into a Hold + extra-charge debit.
// ---------------------------------------------------------------------------

function PalletPolicyReminder({
  declared,
}: {
  declared: Partial<Record<StorageTier, number>>;
}): JSX.Element {
  const palletCount = Number(declared.PALLET ?? 0);
  const boxTiers = (Object.keys(FALLBACK_PALLET_POLICY.maxBoxesPerPallet) as Array<
    keyof typeof FALLBACK_PALLET_POLICY.maxBoxesPerPallet
  >).filter((t) => Number(declared[t] ?? 0) > 0);

  // Detect a possible mixed-pallet situation: multiple non-pallet tiers
  // declared alongside the pallet. We can't tie individual boxes to
  // specific pallets in the PSN schema, but >1 tier means the vendor must
  // either separate the boxes onto multiple uniform-tier pallets or ship
  // them loose. Render the warning so they don't pack a mixed pallet.
  const possibleMixed = boxTiers.length > 1;

  return (
    <aside
      role="note"
      className="mt-6 rounded-md border-l-4 border-amber bg-amber/10 px-5 py-4"
    >
      <div className="font-mono text-mono-eyebrow uppercase text-amber">
        Pallet policy reminder
      </div>
      <p className="mt-2 text-body-sm text-text">
        You&apos;ve declared {palletCount} pallet{palletCount === 1 ? "" : "s"}.
        All boxes on a single pallet must be the same tier and dimensions —
        mixed-tier pallets aren&apos;t accepted at receive.
      </p>

      <ul className="mt-3 grid gap-2 text-body-sm text-text md:grid-cols-2">
        {(Object.keys(FALLBACK_PALLET_POLICY.maxBoxesPerPallet) as Array<
          keyof typeof FALLBACK_PALLET_POLICY.maxBoxesPerPallet
        >).map((tier) => (
          <li
            key={tier}
            className="flex items-baseline justify-between gap-3 rounded-sm border border-line bg-white px-3 py-2"
          >
            <span className="font-medium text-ink">{TIER_METADATA[tier].label}</span>
            <span className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
              up to ~{FALLBACK_PALLET_POLICY.maxBoxesPerPallet[tier]} boxes / pallet
            </span>
          </li>
        ))}
      </ul>

      {possibleMixed ? (
        <p className="mt-3 rounded-sm border border-error/40 bg-error/5 px-3 py-2 text-body-sm text-error">
          You&apos;ve declared boxes from{" "}
          <strong>{boxTiers.length} different tiers</strong> alongside a pallet.
          Make sure each pallet contains only one tier — split into multiple
          pallets if needed.
        </p>
      ) : null}
    </aside>
  );
}
