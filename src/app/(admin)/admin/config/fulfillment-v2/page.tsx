/**
 * /admin/config/fulfillment-v2 — SUPER_ADMIN-only master switch for
 * the Fulfillment v2 workflow.
 *
 * Introduced by migration 0041. Talks to the generic config surface:
 *   GET   /v1/admin/config/fulfillment_v2_enabled
 *   PATCH /v1/admin/config/fulfillment_v2_enabled  { "value": true|false }
 *
 * What toggling this flag actually does:
 *   • Only affects orders CREATED AFTER the flip. `workflowVersion` is
 *     set once at create time and never mutated, so in-flight orders
 *     keep whatever behaviour they were submitted under.
 *   • When true, new PLATFORM_SHIP orders enter the pack-first flow:
 *     the vendor pays only the fulfillment fee at submit; shipping
 *     is quoted and debited later, at pack time.
 *   • When false (default), the legacy quote-a-rate-then-submit flow
 *     stays in effect.
 *
 * Auth: SUPER_ADMIN only. Client-side redirect for non-SUPER_ADMIN;
 * backend is authoritative (403s regardless).
 *
 * SOLID:
 *   • SRP — this page does ONE thing: read + flip a boolean config.
 *     No side-panels, no telemetry, no batch operations.
 *   • The confirm dialog is a stateless local component; extracting
 *     it to its own file would be premature.
 *
 * Security notes:
 *   • The endpoint validates the payload shape with Zod (`{ value }`).
 *     We only send `true` or `false`, never a caller-supplied string.
 *   • Every write is audit-logged server-side with before/after JSON.
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useApiErrorHandler } from "@/lib/errors";

interface ConfigRow {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

const CONFIG_KEY = "fulfillment_v2_enabled";

/**
 * Narrow the config value to a boolean without swallowing typo'd
 * strings ("true"/"false"/"1"/"0"). If anyone sets the row to
 * something other than a JSON boolean via the raw editor, the toggle
 * shows an "invalid state" banner rather than silently interpreting it.
 */
function readBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export default function FulfillmentV2TogglePage(): JSX.Element {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const { bannerError, handle, clear } = useApiErrorHandler();

  // Redirect non-SUPER_ADMIN users out. The backend is authoritative,
  // but a soft-fail here spares them a page that would just 403 on
  // every action.
  useEffect(() => {
    if (authLoading) return;
    if (user?.role !== "SUPER_ADMIN") {
      router.replace("/admin");
    }
  }, [authLoading, user, router]);

  const rowQ = useQuery({
    queryKey: ["admin", "config", CONFIG_KEY],
    queryFn: () => api.get<ConfigRow>(`/admin/config/${CONFIG_KEY}`),
    enabled: !authLoading && user?.role === "SUPER_ADMIN",
    // Fresh reads every visit — no stale caching on a security switch.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const [confirmTarget, setConfirmTarget] = useState<boolean | null>(null);

  const patchMut = useMutation({
    mutationFn: async (next: boolean) => {
      return api.patch<ConfigRow>(`/admin/config/${CONFIG_KEY}`, { value: next });
    },
    onMutate: () => clear(),
    onSuccess: async (row) => {
      qc.setQueryData(["admin", "config", CONFIG_KEY], row);
      // Also drop the vendor-side config cache so the change is
      // visible to a vendor tab open in the same browser session
      // on next focus.
      await qc.invalidateQueries({ queryKey: ["orders", "fulfillment-config"] });
      setConfirmTarget(null);
    },
    onError: (err) => handle(err),
  });

  const current = readBool(rowQ.data?.value);
  const invalidShape = rowQ.data !== undefined && current === null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Configuration"
        title="Fulfillment v2 master switch"
        description="Controls whether new orders enter the pack-first workflow. Only affects orders CREATED after the flip — existing orders keep their original behaviour."
      />

      {bannerError ? <ErrorBanner error={bannerError} /> : null}

      {rowQ.isLoading ? (
        <div className="rounded-md border border-line bg-white p-6 text-body-sm text-text-muted">
          Loading current state…
        </div>
      ) : rowQ.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-6 text-body-sm text-red-800">
          Failed to load the current state. Refresh the page or check API
          connectivity.
        </div>
      ) : invalidShape ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-body-sm text-amber-900">
          The current stored value isn&apos;t a boolean — someone likely
          edited the raw config row. Open{" "}
          <a
            className="underline"
            href={`/admin/config/${CONFIG_KEY}`}
          >
            the raw editor
          </a>{" "}
          to inspect, or click a button below to set it explicitly.
        </div>
      ) : null}

      <section className="rounded-md border border-line bg-white p-6">
        <div className="flex flex-wrap items-baseline gap-4">
          <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted">
            Current state
          </div>
          <div
            className={
              current
                ? "rounded-sm border border-green-300 bg-green-50 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[1.2px] text-green-800"
                : "rounded-sm border border-line bg-cream-soft px-2 py-0.5 font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted"
            }
          >
            {current === null ? "unknown" : current ? "enabled" : "disabled"}
          </div>
          {rowQ.data?.updatedAt ? (
            <div className="font-mono text-body-xs text-text-muted">
              last updated {new Date(rowQ.data.updatedAt).toLocaleString()}
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <ExplainerCard
            title="When ENABLED"
            body={
              <>
                New PLATFORM_SHIP orders enter the pack-first flow. Vendors
                pay <strong>only the fulfillment fee</strong> at submit and
                see a shipping <em>estimate</em> range. The warehouse packs
                the order first with real box dimensions, then live carrier
                rates are fetched, an admin picks a rate, and the actual
                shipping cost is debited from the vendor&apos;s wallet before
                the label is bought.
              </>
            }
          />
          <ExplainerCard
            title="When DISABLED"
            body={
              <>
                New orders use the legacy flow: vendor picks a carrier rate
                during the wizard and the full total (shipping + fulfillment
                + insurance) is debited at submit. Rates come from a live
                Shippo quote using declared box tiers rather than measured
                dimensions.
              </>
            }
          />
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant={current ? "outline" : "amber"}
            size="lg"
            disabled={rowQ.isLoading || patchMut.isPending || current === true}
            onClick={() => setConfirmTarget(true)}
          >
            Enable Fulfillment v2
          </Button>
          <Button
            type="button"
            variant={current ? "amber" : "outline"}
            size="lg"
            disabled={rowQ.isLoading || patchMut.isPending || current === false}
            onClick={() => setConfirmTarget(false)}
          >
            Disable Fulfillment v2
          </Button>
        </div>

        <p className="mt-4 max-w-prose text-body-sm text-text-muted">
          This change only affects orders <strong>created after</strong> the
          flip. In-flight orders keep their existing workflow — the version
          is fixed at submit time and never mutated. Every change is written
          to the audit log with the full before/after JSON.
        </p>
      </section>

      {confirmTarget !== null ? (
        <ConfirmDialog
          target={confirmTarget}
          submitting={patchMut.isPending}
          onCancel={() => setConfirmTarget(null)}
          onConfirm={() => patchMut.mutate(confirmTarget)}
        />
      ) : null}
    </div>
  );
}

function ExplainerCard({
  title,
  body,
}: {
  title: string;
  body: React.ReactNode;
}): JSX.Element {
  return (
    <div className="rounded-md border border-line bg-cream-soft p-4">
      <div className="font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
        {title}
      </div>
      <p className="mt-2 text-body-sm text-text">{body}</p>
    </div>
  );
}

/**
 * Modal confirm dialog — deliberately blocks the page so the user can
 * read the impact statement before flipping the switch. Escape and the
 * Cancel button close it; there's no click-outside dismissal because
 * this is a high-stakes toggle and we want an explicit choice.
 */
function ConfirmDialog({
  target,
  submitting,
  onCancel,
  onConfirm,
}: {
  target: boolean;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel, submitting]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="v2-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-lg rounded-md border border-line bg-white p-6 shadow-lg">
        <h2 id="v2-confirm-title" className="text-h2 font-semibold text-ink">
          {target ? "Enable" : "Disable"} Fulfillment v2?
        </h2>
        <p className="mt-3 text-body-sm text-text">
          {target
            ? "New PLATFORM_SHIP orders submitted after this change will enter the pack-first workflow. Vendors will pay only the fulfillment fee at submit; shipping will be debited later. In-flight orders are unaffected."
            : "New orders submitted after this change will use the legacy quote-a-rate flow. Vendors will pay the full total (shipping + fulfillment) at submit again. In-flight v2 orders will keep their v2 lifecycle — they don't get downgraded."}
        </p>
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
            onClick={onConfirm}
            loading={submitting}
            disabled={submitting}
          >
            {submitting ? "Saving…" : `Confirm — ${target ? "enable" : "disable"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
