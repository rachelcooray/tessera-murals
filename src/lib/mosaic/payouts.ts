/**
 * Payout providers. Tessera talks to this interface only, so Stripe Connect, PayPal Payouts or
 * Payoneer can be plugged in later without touching the ledger or the admin screens.
 * Today only the mock exists: it moves no money.
 */

export interface PayoutRequest {
  requestId: string;
  artistId: string;
  amountCents: number;
  currency: string;
  /** Where the artist asked to be paid. Real details are collected by the provider, never stored here. */
  method: "bank" | "paypal" | "payoneer" | "unset";
}

export interface PayoutResult { ok: boolean; reference: string; message: string }

export interface PayoutProvider {
  readonly name: string;
  /** True when this provider can send real money. */
  readonly live: boolean;
  send(request: PayoutRequest): Promise<PayoutResult>;
}

export const mockPayoutProvider: PayoutProvider = {
  name: "Mock provider",
  live: false,
  async send(r) {
    if (r.amountCents <= 0) return { ok: false, reference: "", message: "Nothing to pay" };
    return { ok: true, reference: `mock_${r.requestId}`, message: "Recorded as paid. No money moved." };
  },
};

/** The provider in use. Swap this when a real one is integrated. */
export function payoutProvider(): PayoutProvider {
  return mockPayoutProvider;
}
