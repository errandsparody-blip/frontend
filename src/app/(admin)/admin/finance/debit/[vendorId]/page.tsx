"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";

interface VendorRow {
  id: string;
  businessName: string;
  country: string;
  status: "PENDING_KYC" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  wallet: { balanceCents: number; status: string; lowBalanceThresholdCents: number } | null;
}

const formSchema = z.object({
  amountCents: z.coerce.number().int().positive().min(100).max(50_000_000),
  reason: z.enum(["CORRECTION", "CLAWBACK", "ADJUSTMENT", "CHARGEBACK", "OTHER"]),
  reference: z.string().min(2).max(120).optional().or(z.literal("").transform(() => undefined)),
});
type FormInput = z.infer<typeof formSchema>;

export default function DebitWalletPage() {
  const params = useParams<{ vendorId: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [success, setSuccess] = useState<{
    ledgerEntryId: string;
    balanceAfterCents: number;
    amountCents: number;
  } | null>(null);

  const vendorQ = useQuery({
    queryKey: ["admin", "vendors", "single", params.vendorId],
    queryFn: () =>
      api
        .get<{ items: VendorRow[]; nextCursor: string | null }>(
          `/admin/vendors?limit=1&search=${encodeURIComponent("")}`,
        )
        .then((r) => r.items.find((v) => v.id === params.vendorId) ?? null),
    enabled: !!params.vendorId,
  });

  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: { amountCents: 0, reason: "CORRECTION", reference: "" },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = form;
  const amountCents = Number(watch("amountCents") ?? 0);

  const { bannerError, handle, clear } = useApiErrorHandler(form);

  const balanceCents = vendorQ.data?.wallet?.balanceCents ?? null;
  const overBalance = balanceCents !== null && amountCents > balanceCents;

  async function onSubmit(values: FormInput): Promise<void> {
    clear();
    try {
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const r = await api.post<{
        ledgerEntryId: string;
        balanceAfterCents: number;
        amountCents: number;
      }>(
        `/admin/wallets/${params.vendorId}/debit`,
        {
          amountCents: values.amountCents,
          reason: values.reason,
          reference: values.reference,
        },
        { idempotencyKey },
      );
      setSuccess(r);
      reset({ amountCents: 0, reason: "CORRECTION", reference: "" });
      await qc.invalidateQueries({ queryKey: ["admin", "vendors"] });
    } catch (err) {
      handle(err);
    }
  }

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "support") window.location.href = "mailto:hello@myusaerrands.com";
  }

  if (vendorQ.isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="  Finance / Debit"
        title="Debit a vendor wallet"
        description="Claw back an erroneous credit or apply an off-platform adjustment. The debit is blocked if it would take the wallet below zero, and is audit-logged with the actor, reason, and reference."
        actions={
          <button
            type="button"
            onClick={() => router.push("/admin/finance")}
            className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
          >
            ← Back
          </button>
        }
      />

      {vendorQ.data ? (
        <section className="rounded-md border border-line bg-white p-6">
          <div className="font-mono text-mono-label uppercase text-text-muted">Vendor</div>
          <div className="mt-2 flex flex-wrap items-baseline gap-4">
            <span className="text-h1 font-semibold text-ink">{vendorQ.data.businessName}</span>
            <span className="font-mono text-body-sm text-text-muted">{vendorQ.data.country}</span>
            <StatusPill tone={vendorQ.data.status === "ACTIVE" ? "success" : "warning"}>
              {vendorQ.data.status.replace("_", " ")}
            </StatusPill>
          </div>
          {vendorQ.data.wallet ? (
            <div className="mt-3 font-mono text-body-sm text-text-muted">
              Current balance:{" "}
              <span className="text-text">
                ${(vendorQ.data.wallet.balanceCents / 100).toFixed(2)}
              </span>
            </div>
          ) : null}
        </section>
      ) : null}

      {success ? (
        <div className="rounded-md border-l-4 border-success bg-success/10 px-5 py-4">
          <div className="font-mono text-mono-label uppercase text-success">Debit applied</div>
          <p className="mt-1 text-body-sm text-text">
            Debited ${(success.amountCents / 100).toFixed(2)} · new balance{" "}
            <span className="font-mono">${(success.balanceAfterCents / 100).toFixed(2)}</span> ·
            ledger entry{" "}
            <span className="font-mono text-text-muted">{success.ledgerEntryId.slice(0, 8)}</span>
          </p>
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-5 rounded-md border border-line bg-white p-8"
        noValidate
      >
        <Field
          label="Amount (cents)"
          error={errors.amountCents?.message}
          hint="Whole cents. 5000 = $50.00."
        >
          <Input
            type="number"
            min={100}
            step={1}
            invalid={!!errors.amountCents}
            {...register("amountCents")}
            className="max-w-xs"
          />
        </Field>

        {amountCents >= 100 ? (
          <div className="font-mono text-body-sm text-text-muted">
            Will debit{" "}
            <span className="text-text">${(amountCents / 100).toFixed(2)}</span> from the wallet.
            {overBalance ? (
              <span className="ml-2 text-error">
                Exceeds the current balance — this will be rejected.
              </span>
            ) : null}
          </div>
        ) : null}

        <Field label="Reason" error={errors.reason?.message}>
          <select
            {...register("reason")}
            className="h-11 rounded-sm border border-line-strong bg-white px-3 font-sans text-body text-text outline-none focus:border-ink"
          >
            <option value="CORRECTION">Correction</option>
            <option value="CLAWBACK">Clawback of erroneous credit</option>
            <option value="ADJUSTMENT">Adjustment</option>
            <option value="CHARGEBACK">Chargeback</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>

        <Field
          label="Reference (optional)"
          error={errors.reference?.message}
          hint="Support ticket, related ledger entry, dispute id, etc."
        >
          <Input type="text" placeholder="SUPPORT-1234" {...register("reference")} />
        </Field>

        <ErrorBanner error={bannerError} onAction={onAction} />

        <div className="flex justify-end">
          <Button
            type="submit"
            variant="amber"
            size="lg"
            withArrow
            loading={isSubmitting}
            disabled={isSubmitting || overBalance}
          >
            {isSubmitting ? "Debiting…" : "Apply debit"}
          </Button>
        </div>
      </form>
    </div>
  );
}
