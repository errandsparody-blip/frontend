/**
 * Admin SKU detail — current bucket counts, full movement history, and
 * the manual ADJUST form.
 *
 * The Adjust form posts to POST /admin/skus/:id/adjust with a signed
 * delta + reason + optional note. The backend writes an
 * InventoryMovement row of type=ADJUST and audit-logs the change. This
 * is the only path through which SKU counts change OUTSIDE of receiving,
 * order allocation, and returns.
 */

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ErrorBanner } from "@/components/errors/error-banner";
import { BackButton } from "@/components/portal/back-button";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";

interface AdminSku {
  id: string;
  vendorId: string;
  vendorBusinessName: string;
  productId: string;
  productCode: string;
  productName: string;
  variant: string;
  /** Locked product image URL (R2). Null when the vendor never uploaded one. */
  productImageUrl: string | null;
  quantityAvailable: number;
  quantityReserved: number;
  storageTier: string;
  warehouseLocation: string | null;
  status: "ACTIVE" | "RESERVED" | "DAMAGED" | "QUARANTINED" | "OUT_OF_STOCK";
  createdAt: string;
  updatedAt: string;
}

interface Movement {
  id: string;
  type: string;
  deltaAvailable: number;
  deltaReserved: number;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  actorId: string | null;
  createdAt: string;
}

const STATUS_TONE: Record<AdminSku["status"], "neutral" | "info" | "success" | "warning" | "error"> = {
  ACTIVE: "success",
  RESERVED: "info",
  DAMAGED: "error",
  QUARANTINED: "warning",
  OUT_OF_STOCK: "neutral",
};

const MOVEMENT_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "error"> = {
  RECEIVE: "success",
  RESERVE: "info",
  RELEASE: "info",
  SHIP: "neutral",
  RETURN: "warning",
  ADJUST: "warning",
  DAMAGE: "error",
  TRANSFER: "neutral",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminInventoryDetailPage(): JSX.Element {
  const params = useParams<{ skuId: string }>();
  const skuId = params.skuId;

  const skuQ = useQuery({
    queryKey: ["admin", "sku", skuId],
    queryFn: () => api.get<AdminSku>(`/admin/skus/${encodeURIComponent(skuId)}`),
    enabled: !!skuId,
  });

  const movementsQ = useQuery({
    queryKey: ["admin", "sku", skuId, "movements"],
    queryFn: () =>
      api.get<{ items: Movement[]; nextCursor: string | null }>(
        `/admin/skus/${encodeURIComponent(skuId)}/movements?limit=100`,
      ),
    enabled: !!skuId,
  });

  if (skuQ.isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  }
  if (skuQ.error || !skuQ.data) {
    const normalized = skuQ.error ? normalizeError(skuQ.error) : null;
    return (
      <div role="alert" className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4">
        <div className="font-mono text-mono-label uppercase text-error">
          {normalized?.entry.title ?? "SKU not found"}
        </div>
        <p className="mt-1 text-body-sm text-text">
          {normalized?.entry.body ?? "Confirm the id is correct or try again."}
        </p>
      </div>
    );
  }

  const s = skuQ.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`[03] Inventory / ${s.id}`}
        title={s.productName}
        description={`${s.vendorBusinessName} · ${s.productCode} · ${s.variant}`}
        actions={
          <div className="flex items-center gap-4">
            {/* Print label jumps straight to the Avery 5160 sheet for
                this SKU. Same component the vendor uses, so labels
                printed here are interchangeable with vendor-printed
                ones on scanners. */}
            <Link
              href={`/admin/inventory/${encodeURIComponent(s.id)}/label`}
              className="font-mono text-mono-label uppercase tracking-[1.2px] text-text hover:text-amber"
            >
              Print label →
            </Link>
            <BackButton fallback="/admin/inventory" label="← Back to inventory" />
          </div>
        }
      />

      {/* Product visual + stats. The image sits in its own column on the
          left so staff can confirm "yes, this is the SKU I'm looking
          for" at a glance before reading the counts. When no image was
          uploaded we drop the column entirely rather than rendering a
          placeholder, so the stat grid expands naturally on text-only
          products. */}
      <section
        className={
          "grid gap-6 rounded-md border border-line bg-white p-6 " +
          (s.productImageUrl
            ? "md:grid-cols-[160px_repeat(4,minmax(0,1fr))]"
            : "md:grid-cols-4")
        }
      >
        {s.productImageUrl ? (
          <div className="row-span-1 md:row-span-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.productImageUrl}
              alt={s.productName}
              className="aspect-square w-full rounded-md border border-line object-cover"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="mt-2 font-mono text-mono-label uppercase text-text-subtle">
              Locked at creation
            </div>
          </div>
        ) : null}
        <Stat label="Available" value={s.quantityAvailable} highlight="success" />
        <Stat label="Reserved" value={s.quantityReserved} muted />
        <Stat
          label="Tier"
          value={s.storageTier.replace("_", "-")}
          mono
        />
        <div>
          <div className="font-mono text-mono-label uppercase text-text-muted">Status</div>
          <div className="mt-2">
            <StatusPill tone={STATUS_TONE[s.status]}>
              {s.status.replace(/_/g, " ")}
            </StatusPill>
          </div>
        </div>
      </section>

      <AdjustForm sku={s} />

      <section className="rounded-md border border-line bg-white p-6">
        <header className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-h3 font-semibold text-ink">Movement history</h2>
          <span className="font-mono text-mono-label uppercase text-text-muted">
            Append-only ledger
          </span>
        </header>
        <p className="max-w-prose text-body-sm text-text-muted">
          Every increment or decrement to this SKU is one row here. Cannot be edited or
          deleted at the database level. Sum of <code className="font-mono">deltaAvailable</code>{" "}
          across this list should equal the current Available count above.
        </p>

        <div className="mt-6">
          {movementsQ.isLoading ? (
            <p className="font-mono text-mono-label uppercase text-text-muted">Loading…</p>
          ) : !movementsQ.data || movementsQ.data.items.length === 0 ? (
            <p className="font-mono text-mono-label uppercase text-text-subtle">
              No movements yet.
            </p>
          ) : (
            <DataTable>
              <THead>
                <Th>When</Th>
                <Th>Type</Th>
                <Th align="right">Δ available</Th>
                <Th align="right">Δ reserved</Th>
                <Th>Reason / source</Th>
              </THead>
              <TBody>
                {movementsQ.data.items.map((m) => (
                  <TR key={m.id}>
                    <Td mono className="text-text-muted">
                      {new Date(m.createdAt).toLocaleString()}
                    </Td>
                    <Td>
                      <StatusPill tone={MOVEMENT_TONE[m.type] ?? "neutral"}>
                        {m.type}
                      </StatusPill>
                    </Td>
                    <Td num className={m.deltaAvailable > 0 ? "text-success" : m.deltaAvailable < 0 ? "text-error" : "text-text-muted"}>
                      {m.deltaAvailable > 0 ? "+" : ""}
                      {m.deltaAvailable}
                    </Td>
                    <Td num className={m.deltaReserved > 0 ? "text-info" : m.deltaReserved < 0 ? "text-text-muted" : "text-text-subtle"}>
                      {m.deltaReserved > 0 ? "+" : ""}
                      {m.deltaReserved}
                    </Td>
                    <Td>
                      <div className="text-text">{m.reason ?? "—"}</div>
                      {m.referenceType ? (
                        <div className="font-mono text-[11px] text-text-muted">
                          {m.referenceType}
                          {m.referenceId ? ` · ${m.referenceId.slice(0, 8)}` : ""}
                        </div>
                      ) : null}
                    </Td>
                  </TR>
                ))}
              </TBody>
            </DataTable>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Adjust form
// ---------------------------------------------------------------------------

const REASONS = [
  { value: "CYCLE_COUNT", label: "Cycle count correction" },
  { value: "FOUND", label: "Found extra units" },
  { value: "LOST", label: "Units missing" },
  { value: "DAMAGE_WRITE_OFF", label: "Damage write-off" },
  { value: "RECONCILIATION", label: "Reconciliation" },
  { value: "OTHER", label: "Other (explain in note)" },
] as const;

const adjustSchema = z.object({
  delta: z.coerce
    .number()
    .int("Whole units only.")
    .refine((v) => v !== 0, "Adjustment must be non-zero."),
  reason: z.enum([
    "CYCLE_COUNT",
    "FOUND",
    "LOST",
    "DAMAGE_WRITE_OFF",
    "RECONCILIATION",
    "OTHER",
  ]),
  note: z.string().trim().max(500, "Keep under 500 characters.").optional(),
});
type AdjustInput = z.infer<typeof adjustSchema>;

function AdjustForm({ sku }: { sku: AdminSku }): JSX.Element {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const form = useForm<AdjustInput>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { delta: 0, reason: "CYCLE_COUNT", note: "" },
  });
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  const { bannerError, handle, clear } = useApiErrorHandler(form);

  const adjustMut = useMutation({
    mutationFn: (input: AdjustInput) => {
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return api.post<AdminSku>(
        `/admin/skus/${encodeURIComponent(sku.id)}/adjust`,
        {
          delta: input.delta,
          reason: input.reason,
          ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        },
        { idempotencyKey },
      );
    },
    onMutate: clear,
    onSuccess: async () => {
      setSaved(true);
      reset({ delta: 0, reason: "CYCLE_COUNT", note: "" });
      await qc.invalidateQueries({ queryKey: ["admin", "sku", sku.id] });
      await qc.invalidateQueries({ queryKey: ["admin", "sku", sku.id, "movements"] });
      await qc.invalidateQueries({ queryKey: ["admin", "skus"] });
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => handle(err),
  });

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "support") window.location.href = "mailto:support@myusaerrands.com";
  }

  const delta = Number(watch("delta") ?? 0);
  const projected = sku.quantityAvailable + (Number.isFinite(delta) ? delta : 0);
  const willGoNegative = projected < 0;

  return (
    <section className="rounded-md border border-line bg-white p-6">
      <header className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-h3 font-semibold text-ink">Manual adjustment</h2>
        <span className="font-mono text-mono-label uppercase text-text-muted">
          Audit-logged · idempotent
        </span>
      </header>
      <p className="max-w-prose text-body-sm text-text-muted">
        Use this only when no other workflow fits — found units behind a pallet, lost in
        transit between bays, cycle-count corrections, etc. Receiving / orders / returns
        already update SKU counts on their own.
      </p>

      <form
        onSubmit={handleSubmit((v) => adjustMut.mutate(v))}
        noValidate
        className="mt-6 grid gap-4 md:grid-cols-[160px_1fr]"
      >
        <Field
          label="Delta"
          hint="Positive to add, negative to remove"
          error={errors.delta?.message}
        >
          <Input
            type="number"
            inputMode="numeric"
            step={1}
            invalid={!!errors.delta || willGoNegative}
            {...register("delta")}
          />
        </Field>

        <Field label="Reason" error={errors.reason?.message}>
          <select
            {...register("reason")}
            className="h-11 rounded-sm border border-line-strong bg-white px-3 font-sans text-body text-text outline-none focus:border-ink"
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="md:col-span-2">
          <Field
            label="Note (optional but recommended)"
            hint="Free-text explanation. Lands in the audit log next to the actor and timestamp."
            error={errors.note?.message}
          >
            <textarea
              rows={3}
              maxLength={500}
              className="w-full rounded-sm border border-line-strong bg-white p-3 font-sans text-body text-text outline-none focus:border-ink"
              {...register("note")}
            />
          </Field>
        </div>

        <div className="md:col-span-2 rounded-md border border-line bg-cream-soft p-4 font-mono text-body-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-text-muted">Current available</span>
            <span className="text-text">{sku.quantityAvailable}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-text-muted">Adjustment</span>
            <span className={delta > 0 ? "text-success" : delta < 0 ? "text-error" : "text-text-muted"}>
              {delta > 0 ? "+" : ""}
              {delta || 0}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2">
            <span className="text-h3 font-semibold text-ink">After</span>
            <span
              className={
                "text-h3 font-semibold " + (willGoNegative ? "text-error" : "text-ink")
              }
            >
              {willGoNegative ? "—" : projected}
            </span>
          </div>
          {willGoNegative ? (
            <div className="mt-2 text-body-sm text-error">
              That delta would drive the bucket negative. The backend will reject this.
            </div>
          ) : null}
        </div>

        <div className="md:col-span-2">
          <ErrorBanner error={bannerError} onAction={onAction} />
        </div>

        {saved ? (
          <div className="md:col-span-2 rounded-sm border-l-4 border-success bg-success/10 px-4 py-2 text-body-sm text-success">
            Adjustment saved. Movement appended to the ledger.
          </div>
        ) : null}

        <div className="md:col-span-2 flex justify-end">
          <Button
            type="submit"
            variant="amber"
            withArrow
            loading={isSubmitting || adjustMut.isPending}
            disabled={delta === 0 || willGoNegative}
          >
            Apply adjustment
          </Button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  mono,
  muted,
  highlight,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
  muted?: boolean;
  highlight?: "success" | "info";
}) {
  const valueClass =
    highlight === "success"
      ? "text-h1 tabular-nums text-success"
      : muted
        ? "text-h2 tabular-nums text-text-muted"
        : "text-h2 tabular-nums text-ink";
  return (
    <div>
      <div className="font-mono text-mono-label uppercase text-text-muted">{label}</div>
      <div className={"mt-2 " + (mono ? "font-mono " : "") + valueClass}>{value}</div>
    </div>
  );
}
