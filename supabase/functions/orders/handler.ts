/**
 * Mosaic orders: create an order, take payment with Stripe, and mark it paid.
 *
 *   POST /create   (signed in) validates the order, saves it unpaid, returns a Stripe client secret
 *   POST /confirm  (signed in, owner) asks Stripe whether the payment went through, marks it paid
 *   POST /webhook  (Stripe) the same, driven by Stripe, so an order is paid even if the buyer closes the tab
 *
 * Prices come from _shared/tiers.ts on the server, never from the browser. The handler takes its
 * database and Stripe client as arguments so it runs the same in the Edge Function and in Node tests.
 */
import { ORDER_RULES, findTier } from "../_shared/tiers.ts";
import { poolFor } from "../_shared/pool.ts";
import { verifyWebhook, type StripeApi } from "../_shared/stripe.ts";

// The Supabase client, typed loosely so the same code works with the Deno and Node builds of supabase-js.
// deno-lint-ignore no-explicit-any
type Db = any;

export interface OrdersDeps {
  /** Supabase client with the service role key. */
  db: Db;
  /** null when Stripe isn't set up. */
  stripe: StripeApi | null;
  webhookSecret: string;
  /** Lets orders through without payment. Only for setting up before Stripe exists; never in production. */
  testMode: boolean;
  allowedOrigins: string[];
  now?: () => number;
}

const DAY = 86400_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export function makeOrdersHandler(deps: OrdersDeps) {
  const now = deps.now ?? (() => Date.now());

  function cors(origin: string | null): Record<string, string> {
    const allow = origin && deps.allowedOrigins.includes(origin) ? origin : deps.allowedOrigins[0] ?? "*";
    return {
      "Access-Control-Allow-Origin": allow,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
      "Vary": "Origin",
    };
  }
  const json = (body: unknown, status: number, origin: string | null) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors(origin) } });

  async function userFrom(req: Request): Promise<{ id: string; email: string | null }> {
    const auth = req.headers.get("authorization") ?? "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!jwt) throw new HttpError(401, "Please reload the page and try again.");
    const { data, error } = await deps.db.auth.getUser(jwt);
    if (error || !data?.user) throw new HttpError(401, "Please reload the page and try again.");
    return { id: data.user.id, email: data.user.email ?? null };
  }

  /** Marks an order paid once Stripe says so. Safe to call any number of times. */
  async function markPaid(pi: Record<string, unknown>): Promise<"paid" | "ignored"> {
    const meta = (pi.metadata ?? {}) as Record<string, string>;
    const mosaicId = meta.mosaic_id;
    if (!mosaicId || pi.status !== "succeeded") return "ignored";
    const { data: m } = await deps.db.from("mosaics").select("id, status, price_cents, currency, payment_intent_id").eq("id", mosaicId).maybeSingle();
    if (!m || m.payment_intent_id !== pi.id) return "ignored";
    // Never trust a payment for a different amount than the order.
    if (Number(pi.amount_received ?? pi.amount) !== m.price_cents || String(pi.currency) !== m.currency) {
      console.error("Payment amount mismatch", pi.id, pi.amount, m.price_cents);
      return "ignored";
    }
    if (m.status !== "awaiting_payment") return "paid";
    const { error } = await deps.db.from("mosaics").update({ status: "collecting", paid_at: new Date(now()).toISOString() })
      .eq("id", mosaicId).eq("status", "awaiting_payment");
    if (error) throw new Error(error.message);
    return "paid";
  }

  async function create(req: Request) {
    const user = await userFrom(req);
    const b = await req.json().catch(() => ({}));
    const tier = findTier(String(b.tierId ?? ""));
    if (!tier) throw new HttpError(400, "Please choose a size.");
    const title = String(b.title ?? "").trim().slice(0, 60) || "Untitled mosaic";
    const email = String(b.email ?? "").trim();
    if (!EMAIL.test(email) || email.length > 200) throw new HttpError(400, "Please add an email so we can send your links.");
    const occasion = String(b.occasion ?? "other");
    if (!["wedding", "birthday", "portrait", "company", "memorial", "other"].includes(occasion)) throw new HttpError(400, "Please choose what it's for.");
    const visibility = b.visibility === "private" ? "private" : "public";
    const revealAt = Date.parse(String(b.revealAt ?? ""));
    // A day's grace either side for time zones.
    if (!Number.isFinite(revealAt) || revealAt < now() + (ORDER_RULES.minRevealDays - 1) * DAY || revealAt > now() + ORDER_RULES.maxRevealDays * DAY) {
      throw new HttpError(400, `Please pick a reveal date at least ${ORDER_RULES.minRevealDays} days away.`);
    }
    const slots = String(b.slotsPacked ?? "").toLowerCase();
    if (slots.length !== tier.cols * tier.rows * 6 || !/^[0-9a-f]*$/.test(slots)) throw new HttpError(400, "Your picture didn't come through. Please choose it again.");
    const targetPath = String(b.targetPath ?? "");
    if (targetPath.split("/")[0] !== user.id) throw new HttpError(400, "Your picture didn't upload. Please try again.");
    const folder = targetPath.split("/").slice(0, -1).join("/"), file = targetPath.split("/").pop();
    const { data: found } = await deps.db.storage.from("targets").list(folder, { search: file });
    if (!found?.some((o: { name: string }) => o.name === file)) throw new HttpError(400, "Your picture didn't upload. Please try again.");

    const live = Boolean(deps.stripe);
    if (!live && !deps.testMode) throw new HttpError(503, "Payments aren't switched on yet.");

    const { data: m, error } = await deps.db.from("mosaics").insert({
      owner_id: user.id, email, title, occasion, tier_id: tier.id, cols: tier.cols, rows: tier.rows,
      price_cents: tier.priceCents, currency: ORDER_RULES.currency, pool_cents: poolFor(tier.priceCents, ORDER_RULES.poolShareBps),
      reveal_at: new Date(revealAt).toISOString(), visibility, open_to_artists: b.openToArtists !== false,
      target_path: targetPath, slots_packed: slots,
      status: live ? "awaiting_payment" : "collecting", payment_mock: !live, paid_at: live ? null : new Date(now()).toISOString(),
    }).select("id, invite_token").single();
    if (error) throw new Error(error.message);

    if (!live) return { mosaicId: m.id, mock: true };

    const pi = await deps.stripe!.post("payment_intents", {
      amount: String(tier.priceCents),
      currency: ORDER_RULES.currency,
      "automatic_payment_methods[enabled]": "true",
      receipt_email: email,
      description: `Tessera mosaic: ${tier.name}, ${(tier.cols * tier.rows).toLocaleString("en")} tiles`,
      "metadata[mosaic_id]": m.id,
      "metadata[tier]": tier.id,
    }, `mosaic-${m.id}`);
    await deps.db.from("mosaics").update({ payment_intent_id: pi.id }).eq("id", m.id);
    return { mosaicId: m.id, clientSecret: pi.client_secret, amount: tier.priceCents, currency: ORDER_RULES.currency };
  }

  async function confirm(req: Request) {
    const user = await userFrom(req);
    const b = await req.json().catch(() => ({}));
    const { data: m } = await deps.db.from("mosaics").select("id, owner_id, status, payment_intent_id").eq("id", String(b.mosaicId ?? "")).maybeSingle();
    if (!m || m.owner_id !== user.id) throw new HttpError(404, "We couldn't find that order.");
    if (m.status !== "awaiting_payment") return { status: m.status };
    if (!deps.stripe || !m.payment_intent_id) throw new HttpError(409, "This order has no payment yet.");
    const pi = await deps.stripe.get(`payment_intents/${m.payment_intent_id}`);
    const r = await markPaid(pi);
    return { status: r === "paid" ? "collecting" : "awaiting_payment", payment: pi.status };
  }

  async function webhook(req: Request) {
    const payload = await req.text();
    if (!(await verifyWebhook(payload, req.headers.get("stripe-signature"), deps.webhookSecret, now()))) {
      return new Response("Bad signature", { status: 400 });
    }
    const event = JSON.parse(payload);
    // Stripe retries; record each event once.
    const { error: dup } = await deps.db.from("stripe_events").insert({ id: event.id, type: event.type });
    if (dup) return new Response("Already handled", { status: 200 });
    try {
      if (event.type === "payment_intent.succeeded") await markPaid(event.data.object);
      if (event.type === "payment_intent.payment_failed") console.log("Payment failed", event.data.object?.id, event.data.object?.metadata?.mosaic_id);
    } catch (e) {
      // Let Stripe retry: forget we saw it.
      await deps.db.from("stripe_events").delete().eq("id", event.id);
      throw e;
    }
    return new Response("ok", { status: 200 });
  }

  return async function handle(req: Request): Promise<Response> {
    const origin = req.headers.get("origin");
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
    const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();
    try {
      if (route === "create") return json(await create(req), 200, origin);
      if (route === "confirm") return json(await confirm(req), 200, origin);
      if (route === "webhook") return await webhook(req);
      return json({ error: "Not found" }, 404, origin);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, origin);
      console.error(e);
      return json({ error: "Something went wrong on our side. Please try again." }, 500, origin);
    }
  };
}
