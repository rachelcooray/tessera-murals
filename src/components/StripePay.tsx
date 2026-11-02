"use client";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Appearance } from "@stripe/stripe-js";
import { useState } from "react";
import { STRIPE_PK } from "@/lib/payments";

const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null;

const appearance: Appearance = {
  theme: "night",
  variables: {
    colorPrimary: "#C9A24F", colorBackground: "#17120E", colorText: "#EFE3CC", colorTextSecondary: "#A89A84",
    colorDanger: "#C8665A", fontFamily: "Geist, system-ui, sans-serif", borderRadius: "0px", spacingUnit: "4px",
  },
  rules: { ".Input": { border: "1px solid #3B2F25", boxShadow: "none" }, ".Input:focus": { border: "1px solid #C9A24F", boxShadow: "none" } },
};

export function StripePay({ clientSecret, label, onPaid }: { clientSecret: string; label: string; onPaid: (intentId: string) => void }) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance, fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap" }] }}>
      <PayForm label={label} onPaid={onPaid} />
    </Elements>
  );
}

function PayForm({ label, onPaid }: { label: string; onPaid: (intentId: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true); setError(null);
    const { error: err, paymentIntent } = await stripe.confirmPayment({ elements, redirect: "if_required", confirmParams: { return_url: window.location.href } });
    if (err) { setError(err.message ?? "The payment didn’t go through."); setBusy(false); return; }
    if (paymentIntent && ["requires_capture", "succeeded", "processing"].includes(paymentIntent.status)) onPaid(paymentIntent.id);
    else { setError("The payment didn’t go through. Please try again."); setBusy(false); }
  };

  return (
    <form onSubmit={pay} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn--primary btn--block" type="submit" disabled={!stripe || busy}>{busy ? "Working…" : label}</button>
    </form>
  );
}
