/**
 * A small Stripe client over fetch (no SDK, so it runs the same in Deno and Node tests),
 * plus webhook signature checking. https://docs.stripe.com/webhooks#verify-manually
 */

export interface StripeApi {
  post(path: string, params: Record<string, string>, idempotencyKey?: string): Promise<Record<string, unknown>>;
  get(path: string): Promise<Record<string, unknown>>;
}

export function stripeClient(secretKey: string, base = "https://api.stripe.com/v1", fetchFn: typeof fetch = fetch): StripeApi {
  async function call(method: "GET" | "POST", path: string, params?: Record<string, string>, idempotencyKey?: string) {
    const headers: Record<string, string> = { Authorization: `Bearer ${secretKey}`, "Stripe-Version": "2024-06-20" };
    if (method === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const res = await fetchFn(`${base}/${path}`, { method, headers, body: method === "POST" ? new URLSearchParams(params) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: { message?: string } })?.error?.message ?? `Stripe error ${res.status}`);
    return data as Record<string, unknown>;
  }
  return { post: (p, params, key) => call("POST", p, params, key), get: (p) => call("GET", p) };
}

function equalTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Builds a Stripe-Signature header. Used by tests; Stripe does this for real webhooks. */
export async function signWebhook(payload: string, secret: string, t = Math.floor(Date.now() / 1000)): Promise<string> {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${payload}`)}`;
}

/** True when the header carries a valid v1 signature made in the last 5 minutes. */
export async function verifyWebhook(payload: string, header: string | null, secret: string, now = Date.now()): Promise<boolean> {
  if (!secret || !header) return false;
  let t = "";
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") t = v;
    if (k === "v1" && v) v1.push(v);
  }
  if (!t || !v1.length || Math.abs(now / 1000 - Number(t)) > 300) return false;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  return v1.some((s) => equalTime(s, expected));
}
