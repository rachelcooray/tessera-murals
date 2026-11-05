// Money and scheduled jobs. Supabase Edge Function (Deno).
// Deploy:  supabase functions deploy money --no-verify-jwt
// Secrets: CRON_SECRET (a long random string; the hourly job sends it), ALLOWED_ORIGINS.
// Schedule: see docs/backend-setup.md ("Hourly job") for the pg_cron line that calls /tick.
import { createClient } from "@supabase/supabase-js";
import { makeMoneyHandler } from "./handler.ts";

Deno.serve(makeMoneyHandler({
  db: createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } }),
  cronSecret: Deno.env.get("CRON_SECRET") ?? "",
  allowedOrigins: (Deno.env.get("ALLOWED_ORIGINS") ?? "https://rachelcooray.github.io,http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean),
}));
