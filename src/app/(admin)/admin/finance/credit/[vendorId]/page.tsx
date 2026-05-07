"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { api, type ApiError } from "@/lib/api-client";

interface VendorRow {
  id: string;
  businessName: string;
  country: string;
  status: "PENDING_KYC" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  wallet: { balanceCents: number; status: string; lowBalanceThresholdCents: number } | null;
}

const formSchema = z.object({
  amountCents: z.coerce.number().int().positive().min(100).max(50_000_000),
  reason: z.enum(["WISE", "PAYONEER", "SUPPORT", "REVERSAL"]),
  reference: z.string().min(2).max(120).optional().or(z.literal("").transform(() => undefined)),
});
type FormInput = z.infer<typeof formSchema>;

export default function CreditDepositPage() {
  const params = useParams<{ vendorId: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [submitError, setSubmitError] = useState<string | null>(null);
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

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: { amountCents: 0, reason: "WISE", reference: "" },
  });
  const amountCents = Number(watch("amountCents") ?? 0);

  async function onSubmit(values: FormInput): Promise<void> {
    setSubmitError(null);
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
        `/admin/wallets/${params.vendorId}/credit`,
        {
          amountCents: values.amountCents,
          reason: values.reason,
          reference: values.reference,
        },
        { idempotencyKey },
      );
      setSuccess(r);
      reset({ amountCents: 0, reason: "WISE", reference: "" });
      await qc.invalidateQueries({ queryKey: ["admin", "vendors"] });
    } catch (err) {
      setSubmitError((err as ApiError).message);
    }
  }

  if (vendorQ.isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="[03] Finance / Credit"
        title="Credit a manual deposit"
        description="Use this when a Wise or Payoneer transfer arrives in the operating account. The credit is audit-logged with the actor, reason, and provider reference."
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
            <StatusPill
              tone={vendorQ.data.status === "ACTIVE" ? "success" : "warning"}
            >
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
          <div className="font-mono text-mono-label uppercase text-success">Credit applied</div>
          <p className="mt-1 text-body-sm text-text">
            Credited ${(success.amountCents / 100).toFixed(2)} · new balance{" "}
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
            Will credit{" "}
            <span className="text-text">${(amountCents / 100).toFixed(2)}</span> to the wallet.
          </div>
        ) : null}

        <Field label="Reason" error={errors.reason?.message}>
          <select
            {...register("reason")}
            className="h-11 rounded-sm border border-line-strong bg-white px-3 font-sans text-body text-text outline-none focus:border-ink"
          >
            <option value="WISE">Wise transfer</option>
            <option value="PAYONEER">Payoneer transfer</option>
            <option value="SUPPORT">Support credit</option>
            <option value="REVERSAL">Reversal / correction</option>
          </select>
        </Field>

        <Field
          label="Reference (optional)"
          error={errors.reference?.message}
          hint="Wise transfer id, Payoneer ref, support ticket, etc."
        >
          <Input type="text" placeholder="WISE-1234567890" {...register("reference")} />
        </Field>

        {submitError ? (
          <div
            role="alert"
            className="rounded-sm border-l-4 border-error bg-error/10 px-4 py-3 text-body-sm text-error"
          >
            {submitError}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" variant="amber" size="lg" withArrow loading={isSubmitting}>
            {isSubmitting ? "Crediting…" : "Apply credit"}
          </Button>
        </div>
      </form>
    </div>
  );
}
