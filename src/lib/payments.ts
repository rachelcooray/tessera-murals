"use client";
/**
 * Talks to the payments server function. When the two public settings below are empty
 * (as on a fresh checkout), the app runs in test mode and no card is charged.
 */
export const PAYMENTS_URL = (process.env.NEXT_PUBLIC_PAYMENTS_URL ?? "").replace(/\/$/, "");
export const STRIPE_PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
export const paymentsLive = Boolean(PAYMENTS_URL && STRIPE_PK);

export interface Intent { clientSecret: string; intentId: string; amount: number; capture: "manual" | "automatic" }

async function post<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${PAYMENTS_URL}/${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Payment server error ${res.status}`);
  return data as T;
}

export function createIntent(quantity: number, email: string, tileRef: string): Promise<Intent> {
  return post<Intent>("create", { quantity, email, tileRef });
}

/** Capture or release a hold. Sends the signed-in admin's session; the server checks it. */
export async function settlePayment(action: "capture" | "cancel", intentId: string, approvedCount?: number): Promise<{ status: string }> {
  const { accessToken } = await import("./auth");
  return post(action, { intentId, approvedCount }, { authorization: `Bearer ${await accessToken()}` });
}

/** One payment for a whole mosaic, charged straight away. The server sets the price from the tier id. */
export function createMosaicIntent(tierId: string, email: string, ref: string): Promise<Intent> {
  return post<Intent>("create-mosaic", { tierId, email, ref });
}
