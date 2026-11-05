// Mosaic orders and payments. Supabase Edge Function (Deno).
// Deploy:  supabase functions deploy orders --no-verify-jwt
// (The function checks the buyer's sign-in itself, and Stripe's webhook calls arrive without one.)
//
// Secrets (supabase secrets set NAME=value):
//   STRIPE_SECRET_KEY       sk_test_… or sk_live_…   (leave unset until Stripe is ready)
//   STRIPE_WEBHOOK_SECRET   whsec_…                   (from the webhook endpoint in Stripe)
//   ALLOWED_ORIGINS         comma-separated sites allowed to call this
//   PAYMENTS_TEST_MODE      "true" lets orders through without paying. Only while setting up.
import { createClient } from "@supabase/supabase-js";
import { stripeClient } from "../_shared/stripe.ts";
import { makeOrdersHandler } from "./handler.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

const handle = makeOrdersHandler({
  db: createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } }),
  stripe: stripeKey ? stripeClient(stripeKey, Deno.env.get("STRIPE_API_BASE") ?? undefined) : null,
  webhookSecret: Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "",
  testMode: Deno.env.get("PAYMENTS_TEST_MODE") === "true",
  allowedOrigins: (Deno.env.get("ALLOWED_ORIGINS") ?? "https://rachelcooray.github.io,http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean),
});

Deno.serve(handle);
