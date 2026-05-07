"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : Promise.resolve(null);
  }
  return stripePromise;
}

interface ConfirmInnerProps {
  onSuccess: () => void;
  submitLabel: string;
}

function ConfirmInner({ onSuccess, submitLabel }: ConfirmInnerProps): JSX.Element {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/wallet?status=processing`,
      },
      redirect: "if_required",
    });

    if (result.error) {
      setError(result.error.message ?? "Payment failed.");
      setSubmitting(false);
      return;
    }
    // The webhook actually credits the wallet — we just send the user back to
    // /wallet where TanStack Query will pick up the new balance.
    onSuccess();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <PaymentElement options={{ layout: "tabs" }} />
      {error ? (
        <div role="alert" className="rounded-sm border-l-4 border-error bg-error/10 px-4 py-3 text-body-sm text-error">
          {error}
        </div>
      ) : null}
      <Button
        type="submit"
        variant="amber"
        size="lg"
        withArrow
        disabled={!stripe || !elements || submitting}
        loading={submitting}
      >
        {submitting ? "Processing" : submitLabel}
      </Button>
    </form>
  );
}

interface StripePaymentFormProps {
  clientSecret: string;
  submitLabel: string;
  onSuccess: () => void;
}

export function StripePaymentForm({
  clientSecret,
  submitLabel,
  onSuccess,
}: StripePaymentFormProps): JSX.Element {
  const [stripe, setStripe] = useState<Stripe | null>(null);
  useEffect(() => {
    void getStripePromise().then(setStripe);
  }, []);

  if (!PUBLISHABLE_KEY) {
    return (
      <div className="rounded-md border-l-4 border-amber bg-amber/10 px-5 py-4 text-body-sm">
        Stripe is not configured. Set <code className="font-mono">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>{" "}
        in <code className="font-mono">.env.local</code>.
      </div>
    );
  }
  if (!stripe) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading payment form…</div>;
  }
  return (
    <Elements
      stripe={stripe}
      options={{
        clientSecret,
        appearance: {
          theme: "flat",
          variables: {
            colorPrimary: "#0A0A0A",
            colorBackground: "#FFFFFF",
            colorText: "#111111",
            colorDanger: "#B33333",
            fontFamily: '"Inter Tight", "Inter", system-ui, sans-serif',
            spacingUnit: "4px",
            borderRadius: "4px",
            fontSizeBase: "14px",
          },
          rules: {
            ".Input": { border: "1px solid rgba(0,0,0,0.12)", boxShadow: "none" },
            ".Input:focus": { border: "1px solid #0A0A0A", boxShadow: "0 0 0 3px rgba(10,10,10,0.10)" },
            ".Label": { fontWeight: "500", color: "#6B6B6B", textTransform: "uppercase", letterSpacing: "1.4px", fontSize: "11px", fontFamily: '"JetBrains Mono", monospace' },
          },
        },
      }}
    >
      <ConfirmInner onSuccess={onSuccess} submitLabel={submitLabel} />
    </Elements>
  );
}
