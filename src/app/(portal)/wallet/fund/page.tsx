"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StripePaymentForm } from "@/components/portal/stripe-payment-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { api, type ApiError } from "@/lib/api-client";

interface CreateIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  grossAmountCents: number;
  netAmountCents: number;
  processorFeeCents: number;
}

type Method = "stripe" | "wise" | "payoneer";

export default function FundWalletPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [method, setMethod] = useState<Method>("stripe");
  const [netInput, setNetInput] = useState<string>("100");
  const [intent, setIntent] = useState<CreateIntentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const netAmountCents = Math.round(Number(netInput || "0") * 100);

  async function createIntent(): Promise<void> {
    setError(null);
    setRequesting(true);
    try {
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const r = await api.post<CreateIntentResponse>(
        "/wallet/fund/stripe",
        { netAmountCents },
        { idempotencyKey },
      );
      setIntent(r);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setRequesting(false);
    }
  }

  async function onSuccess(): Promise<void> {
    await qc.invalidateQueries({ queryKey: ["wallet"] });
    await qc.invalidateQueries({ queryKey: ["wallet", "ledger"] });
    router.push("/wallet?status=processing");
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="[05] Wallet / Fund"
        title="Add funds"
        description="Stripe deposits are credited the moment the charge clears. Wise and Payoneer are reconciled manually by our finance team within one business day."
      />

      {/* Method tabs */}
      <div className="inline-flex rounded-sm border border-line-strong bg-white p-1">
        {(["stripe", "wise", "payoneer"] as Method[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMethod(m);
              setIntent(null);
              setError(null);
            }}
            className={
              "rounded-sm px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-[1.2px] transition-colors duration-fast " +
              (method === m ? "bg-ink text-text-inv" : "text-text-muted hover:text-ink")
            }
          >
            {m === "stripe" ? "Card (Stripe)" : m === "wise" ? "Wise" : "Payoneer"}
          </button>
        ))}
      </div>

      {method === "stripe" ? (
        <section className="rounded-md border border-line bg-white p-8">
          {!intent ? (
            <div className="flex flex-col gap-6">
              <Field
                label="Amount to add (USD)"
                hint="The amount that will be credited to your wallet. Stripe processor fees are added on top and shown before you confirm."
              >
                <Input
                  type="number"
                  min={1}
                  step="0.01"
                  value={netInput}
                  onChange={(e) => setNetInput(e.target.value)}
                  className="max-w-xs"
                />
              </Field>

              {netAmountCents > 0 ? (
                <FeeBreakdownPreview netCents={netAmountCents} />
              ) : null}

              {error ? (
                <div
                  role="alert"
                  className="rounded-sm border-l-4 border-error bg-error/10 px-4 py-3 text-body-sm text-error"
                >
                  {error}
                </div>
              ) : null}

              <div>
                <Button
                  variant="primary"
                  size="lg"
                  withArrow
                  onClick={createIntent}
                  loading={requesting}
                  disabled={netAmountCents < 100}
                >
                  Continue
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <StripeBreakdown intent={intent} />
              <StripePaymentForm
                clientSecret={intent.clientSecret}
                submitLabel={`Pay $${(intent.grossAmountCents / 100).toFixed(2)} & deposit`}
                onSuccess={onSuccess}
              />
              <button
                type="button"
                className="self-start font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted hover:text-ink"
                onClick={() => setIntent(null)}
              >
                ← Change amount
              </button>
            </div>
          )}
        </section>
      ) : (
        <ManualInstructions provider={method} />
      )}
    </div>
  );
}

function FeeBreakdownPreview({ netCents }: { netCents: number }) {
  // Stripe: 2.9% + $0.30. Mirrors apps/api StripeService.grossUpCents.
  const grossExact = (netCents + 30) / (1 - 0.029);
  const grossCents = Math.ceil(grossExact);
  const feeCents = grossCents - netCents;
  return (
    <div className="rounded-md border border-line bg-cream-soft p-5 font-mono text-body-sm">
      <Row label="You add to wallet" value={`$${(netCents / 100).toFixed(2)}`} />
      <Row label="Stripe processor fee" value={`+$${(feeCents / 100).toFixed(2)}`} muted />
      <div className="mt-2 border-t border-line pt-2">
        <Row label="You pay" value={`$${(grossCents / 100).toFixed(2)}`} strong />
      </div>
    </div>
  );
}

function StripeBreakdown({ intent }: { intent: CreateIntentResponse }) {
  return (
    <div className="rounded-md border border-line bg-cream-soft p-5 font-mono text-body-sm">
      <Row label="Wallet credit" value={`$${(intent.netAmountCents / 100).toFixed(2)}`} />
      <Row label="Processor fee" value={`+$${(intent.processorFeeCents / 100).toFixed(2)}`} muted />
      <div className="mt-2 border-t border-line pt-2">
        <Row label="Card charge" value={`$${(intent.grossAmountCents / 100).toFixed(2)}`} strong />
      </div>
    </div>
  );
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className={"uppercase tracking-[1.2px] " + (muted ? "text-text-muted" : "text-text")}>{label}</span>
      <span className={"tabular-nums " + (strong ? "text-h3 text-ink" : muted ? "text-text-muted" : "text-text")}>
        {value}
      </span>
    </div>
  );
}

function ManualInstructions({ provider }: { provider: "wise" | "payoneer" }) {
  const name = provider === "wise" ? "Wise" : "Payoneer";
  return (
    <section className="rounded-md border border-line bg-white p-8">
      <div className="font-mono text-mono-eyebrow uppercase text-amber">[manual]</div>
      <h2 className="mt-3 text-h1 font-semibold tracking-[-0.4px] text-ink">{name} bank transfer</h2>
      <p className="mt-3 max-w-2xl text-body text-text-muted">
        Send your transfer to the destination below. Include your vendor id in the reference field. Our
        finance team reconciles within one business day; the credit appears in your ledger as a{" "}
        <span className="font-mono text-text">manual_credit</span> entry.
      </p>

      <dl className="mt-8 grid gap-5 md:grid-cols-2">
        <Detail label="Beneficiary">USA Errands Inc.</Detail>
        <Detail label="Currency">USD</Detail>
        <Detail label={`${name} ID`}>(provided in onboarding email)</Detail>
        <Detail label="Reference">your-vendor-id</Detail>
      </dl>

      <div className="mt-8 rounded-md border-l-4 border-amber bg-amber/10 px-5 py-4 text-body-sm">
        Manual deposits are non-refundable once credited. If you need a different payment method, contact
        support before sending.
      </div>
    </section>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-mono-label uppercase text-text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-body text-text">{children}</dd>
    </div>
  );
}
