/**
 * The orders function against the local database, with a fake Stripe.
 * Run with: npm run test:db (needs `supabase start`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { makeOrdersHandler } from "../../supabase/functions/orders/handler.ts";
import { signWebhook, type StripeApi } from "../../supabase/functions/_shared/stripe.ts";
import { TIERS } from "../../supabase/functions/_shared/tiers.ts";

const URL_ = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const db = createClient(URL_, SERVICE, opts);
const WHSEC = "whsec_test_secret";
const small = TIERS[0];
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

/** A pretend Stripe that remembers the payment intents it made. */
function fakeStripe() {
  const intents = new Map<string, Record<string, unknown>>();
  const calls: { path: string; params?: Record<string, string>; key?: string }[] = [];
  const api: StripeApi = {
    async post(path, params, key) {
      calls.push({ path, params, key });
      const id = `pi_${intents.size + 1}${Date.now()}`;
      const pi = { id, client_secret: `${id}_secret`, amount: Number(params.amount), currency: params.currency, status: "requires_payment_method", metadata: { mosaic_id: params["metadata[mosaic_id]"] } };
      intents.set(id, pi);
      return pi;
    },
    async get(path) { return intents.get(path.split("/").pop()!)!; },
  };
  return { api, intents, calls, succeed(id: string) { const pi = intents.get(id)!; pi.status = "succeeded"; pi.amount_received = pi.amount; return pi; } };
}

async function buyer(): Promise<{ sb: SupabaseClient; id: string; jwt: string }> {
  const sb = createClient(URL_, ANON, opts);
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  return { sb, id: data.user!.id, jwt: data.session!.access_token };
}

async function order(handle: (r: Request) => Promise<Response>, b: { sb: SupabaseClient; id: string; jwt: string }, over: Record<string, unknown> = {}) {
  const path = `${b.id}/${crypto.randomUUID()}.jpg`;
  const up = await b.sb.storage.from("targets").upload(path, JPEG, { contentType: "image/jpeg" });
  if (up.error) throw up.error;
  const body = {
    tierId: small.id, title: "Amaya and Dev", occasion: "wedding", email: "buyer@example.com", visibility: "public", openToArtists: true,
    revealAt: new Date(Date.now() + 21 * 86400_000).toISOString(), slotsPacked: "ab12cd".repeat(small.cols * small.rows), targetPath: path, ...over,
  };
  const res = await handle(new Request("http://x/orders/create", { method: "POST", headers: { authorization: `Bearer ${b.jwt}`, "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}

const call = (handle: (r: Request) => Promise<Response>, route: string, jwt: string, body: unknown) =>
  handle(new Request(`http://x/orders/${route}`, { method: "POST", headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" }, body: JSON.stringify(body) }));

async function sendWebhook(handle: (r: Request) => Promise<Response>, event: unknown, secret = WHSEC) {
  const payload = JSON.stringify(event);
  return handle(new Request("http://x/orders/webhook", { method: "POST", headers: { "stripe-signature": await signWebhook(payload, secret) }, body: payload }));
}

test("an order is saved unpaid at the server's price, then paid by the webhook", async () => {
  const s = fakeStripe();
  const handle = makeOrdersHandler({ db, stripe: s.api, webhookSecret: WHSEC, testMode: false, allowedOrigins: ["http://localhost:3000"] });
  const b = await buyer();
  const r = await order(handle, b, { priceCents: 1 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.clientSecret);
  assert.equal(s.calls[0].params!.amount, String(small.priceCents), "price comes from the server, not the browser");
  assert.equal(s.calls[0].key, `mosaic-${r.body.mosaicId}`, "idempotent per order");

  const { data: m } = await db.from("mosaics").select("*").eq("id", r.body.mosaicId).single();
  assert.equal(m.status, "awaiting_payment");
  assert.equal(m.owner_id, b.id);
  assert.equal(m.pool_cents, Math.floor(small.priceCents * 0.3));

  const pi = s.succeed(m.payment_intent_id);
  const event = { id: `evt_${Date.now()}`, type: "payment_intent.succeeded", data: { object: pi } };
  assert.equal((await sendWebhook(handle, event, "wrong")).status, 400, "unsigned webhooks are refused");
  assert.equal((await sendWebhook(handle, event)).status, 200);
  assert.equal((await sendWebhook(handle, event)).status, 200, "a retried event is fine");
  const { data: paid } = await db.from("mosaics").select("status, paid_at").eq("id", m.id).single();
  assert.equal(paid!.status, "collecting");
  assert.ok(paid!.paid_at);
});

test("confirm marks it paid straight away, and only for the owner", async () => {
  const s = fakeStripe();
  const handle = makeOrdersHandler({ db, stripe: s.api, webhookSecret: WHSEC, testMode: false, allowedOrigins: [] });
  const b = await buyer(), other = await buyer();
  const r = await order(handle, b);
  const { data: m } = await db.from("mosaics").select("payment_intent_id").eq("id", r.body.mosaicId).single();

  const early = await (await call(handle, "confirm", b.jwt, { mosaicId: r.body.mosaicId })).json();
  assert.equal(early.status, "awaiting_payment", "not paid yet");
  s.succeed(m!.payment_intent_id);
  assert.equal((await call(handle, "confirm", other.jwt, { mosaicId: r.body.mosaicId })).status, 404, "someone else can't confirm it");
  const ok = await (await call(handle, "confirm", b.jwt, { mosaicId: r.body.mosaicId })).json();
  assert.equal(ok.status, "collecting");
});

test("a payment for the wrong amount doesn't count", async () => {
  const s = fakeStripe();
  const handle = makeOrdersHandler({ db, stripe: s.api, webhookSecret: WHSEC, testMode: false, allowedOrigins: [] });
  const b = await buyer();
  const r = await order(handle, b);
  const { data: m } = await db.from("mosaics").select("payment_intent_id").eq("id", r.body.mosaicId).single();
  const pi = s.succeed(m!.payment_intent_id);
  pi.amount_received = 100;
  await sendWebhook(handle, { id: `evt_x${Date.now()}`, type: "payment_intent.succeeded", data: { object: pi } });
  const { data: after } = await db.from("mosaics").select("status").eq("id", r.body.mosaicId).single();
  assert.equal(after!.status, "awaiting_payment");
});

test("bad orders are refused with a clear message", async () => {
  const handle = makeOrdersHandler({ db, stripe: fakeStripe().api, webhookSecret: WHSEC, testMode: false, allowedOrigins: [] });
  const b = await buyer(), other = await buyer();
  assert.match((await order(handle, b, { tierId: "huge" })).body.error, /size/);
  assert.match((await order(handle, b, { email: "nope" })).body.error, /email/);
  assert.match((await order(handle, b, { revealAt: new Date(Date.now() + 2 * 86400_000).toISOString() })).body.error, /7 days/);
  assert.match((await order(handle, b, { slotsPacked: "ab12cd" })).body.error, /picture/);
  assert.match((await order(handle, b, { targetPath: `${other.id}/x.jpg` })).body.error, /upload/);
  const anon = await handle(new Request("http://x/orders/create", { method: "POST", body: "{}" }));
  assert.equal(anon.status, 401);
});

test("without Stripe: refused, unless test mode is on", async () => {
  const b = await buyer();
  const off = makeOrdersHandler({ db, stripe: null, webhookSecret: "", testMode: false, allowedOrigins: [] });
  assert.equal((await order(off, b)).status, 503);
  const testMode = makeOrdersHandler({ db, stripe: null, webhookSecret: "", testMode: true, allowedOrigins: [] });
  const r = await order(testMode, b);
  assert.equal(r.body.mock, true);
  const { data: m } = await db.from("mosaics").select("status, payment_mock").eq("id", r.body.mosaicId).single();
  assert.deepEqual(m, { status: "collecting", payment_mock: true });
});
