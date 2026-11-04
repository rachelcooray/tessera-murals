// Tessera payments. Supabase Edge Function (Deno). Deploy with:
//   supabase functions deploy payments --no-verify-jwt
// Routes: POST /create, POST /create-mosaic, POST /capture, POST /cancel, POST /webhook
//
// Every order is one card hold (manual capture) covering all its squares. When every tile
// in the order has been reviewed, Admin captures the price for the approved count only,
// or cancels the hold if none were approved.

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
// Supabase provides these two automatically inside Edge Functions.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const CURRENCY = Deno.env.get("CURRENCY") ?? "usd";
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://rachelcooray.github.io,http://localhost:3000,http://localhost:3217").split(",").map((s) => s.trim());
const MAX_PER_ORDER = Number(Deno.env.get("MAX_PER_ORDER") ?? 20);

type Tier = { n: number; price: number };
// Keep in step with src/lib/pricing.ts. Override without redeploying code via the PRICE_TIERS secret.
const TIERS: Tier[] = JSON.parse(Deno.env.get("PRICE_TIERS") ?? '[{"n":1,"price":1},{"n":2,"price":1.9},{"n":3,"price":2.7},{"n":4,"price":3.6},{"n":5,"price":4.5},{"n":10,"price":7}]')
  .sort((a: Tier, b: Tier) => a.n - b.n);

// Commissioned mosaics: one charge per order, captured straight away. Keep in step with src/config/mosaic.ts,
// or override with the MOSAIC_TIERS secret, e.g. {"small":4500,"medium":9500,"large":14500,"grand":19500} (cents).
const MOSAIC_TIERS: Record<string, number> = JSON.parse(Deno.env.get("MOSAIC_TIERS") ?? '{"small":4500,"medium":9500,"large":14500,"grand":19500}');

function priceCents(n: number): number {
  const exact = TIERS.find((t) => t.n === n);
  if (exact) return Math.round(exact.price * 100);
  const below = [...TIERS].reverse().find((t) => t.n <= n) ?? TIERS[0];
  return Math.round((below.price / below.n) * n * 100);
}

function cors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors(origin) } });
}

async function stripe(path: string, params: Record<string, string> | null = {}, idempotencyKey?: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${STRIPE_KEY}`, "Content-Type": "application/x-www-form-urlencoded" };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = params === null
    ? await fetch(`https://api.stripe.com/v1/${path}`, { headers })
    : await fetch(`https://api.stripe.com/v1/${path}`, { method: "POST", headers, body: new URLSearchParams(params) });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe error ${res.status}`);
  return data;
}

function sameText(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyWebhook(payload: string, header: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts["t"], v1 = parts["v1"];
  if (!t || !v1 || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sameText(hex, v1);
}

/** True when the request carries a valid Supabase session for an email on ADMIN_EMAILS. */
async function isAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ") || !SUPABASE_URL || !ADMIN_EMAILS.length) return false;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: SUPABASE_ANON_KEY } });
  if (!res.ok) return false;
  const user = await res.json();
  return typeof user?.email === "string" && ADMIN_EMAILS.includes(user.email.toLowerCase());
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (!STRIPE_KEY) return json({ error: "Payments are not configured" }, 503, origin);
  const route = new URL(req.url).pathname.split("/").pop();

  try {
    if (route === "create") {
      const body = await req.json();
      const quantity = Number(body.quantity);
      const email = String(body.email ?? "").trim();
      const tileRef = String(body.tileRef ?? "").slice(0, 80);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PER_ORDER) return json({ error: "Choose between 1 and " + MAX_PER_ORDER + " squares" }, 400, origin);
      if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 200) return json({ error: "A valid email is needed" }, 400, origin);
      const pi = await stripe("payment_intents", {
        amount: String(priceCents(quantity)),
        currency: CURRENCY,
        "payment_method_types[]": "card",
        capture_method: "manual",
        receipt_email: email,
        description: `Tessera: ${quantity} square${quantity === 1 ? "" : "s"}`,
        "metadata[quantity]": String(quantity),
        "metadata[tile_ref]": tileRef,
      }, tileRef ? `create-${tileRef}-${quantity}` : undefined);
      return json({ clientSecret: pi.client_secret, intentId: pi.id, amount: pi.amount / 100, capture: "manual" }, 200, origin);
    }

    if (route === "create-mosaic") {
      const body = await req.json();
      const tierId = String(body.tierId ?? "");
      const email = String(body.email ?? "").trim();
      const ref = String(body.ref ?? "").slice(0, 80);
      const amount = MOSAIC_TIERS[tierId];
      if (!Number.isInteger(amount) || amount <= 0) return json({ error: "Unknown mosaic size" }, 400, origin);
      if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 200) return json({ error: "A valid email is needed" }, 400, origin);
      const pi = await stripe("payment_intents", {
        amount: String(amount),
        currency: CURRENCY,
        "payment_method_types[]": "card",
        receipt_email: email,
        description: `Tessera mosaic: ${tierId}`,
        "metadata[kind]": "mosaic",
        "metadata[tier]": tierId,
        "metadata[ref]": ref,
      }, ref ? `mosaic-${ref}` : undefined);
      return json({ clientSecret: pi.client_secret, intentId: pi.id, amount: pi.amount / 100, capture: "automatic" }, 200, origin);
    }

    if (route === "capture" || route === "cancel") {
      if (!(await isAdmin(req))) return json({ error: "Sign in as an admin to do this" }, 401, origin);
      const { intentId, approvedCount } = await req.json();
      if (!/^pi_[A-Za-z0-9]+$/.test(String(intentId))) return json({ error: "Bad payment id" }, 400, origin);
      let pi;
      if (route === "capture") {
        const held = await stripe(`payment_intents/${intentId}`, null);
        const ordered = Number(held.metadata?.quantity ?? 1);
        const approved = Math.max(1, Math.min(ordered, Math.floor(Number(approvedCount ?? ordered))));
        // Charge the price for the approved count, never more than was held.
        const amount = Math.min(held.amount_capturable ?? held.amount, priceCents(approved));
        pi = await stripe(`payment_intents/${intentId}/capture`, approved < ordered ? { amount_to_capture: String(amount) } : {});
      } else {
        pi = await stripe(`payment_intents/${intentId}/cancel`, { cancellation_reason: "abandoned" });
      }
      return json({ status: pi.status }, 200, origin);
    }

    if (route === "webhook") {
      const payload = await req.text();
      if (!(await verifyWebhook(payload, req.headers.get("stripe-signature")))) return new Response("Bad signature", { status: 400 });
      const event = JSON.parse(payload);
      // Phase 2 stores these against the tile. For now they are logged so expired holds are visible.
      if (["payment_intent.canceled", "payment_intent.succeeded", "payment_intent.amount_capturable_updated", "payment_intent.payment_failed"].includes(event.type)) {
        console.log(event.type, event.data?.object?.id, event.data?.object?.metadata?.tile_ref);
      }
      return new Response("ok", { status: 200 });
    }

    return json({ error: "Not found" }, 404, origin);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Payment error" }, 502, origin);
  }
});
