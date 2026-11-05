/**
 * The money function against the local database, with the clock moved forward by hand.
 * Run with: npm run test:db (needs `supabase start`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { makeMoneyHandler } from "../../supabase/functions/money/handler.ts";
import { POOL_RULES } from "../../supabase/functions/_shared/tiers.ts";

const URL_ = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const db = createClient(URL_, SERVICE, opts);
const DAY = 86400_000;
const CRON = "cron-secret-for-tests";
const POOL = 5850; // 30% of a $195 Grand order

async function anon(): Promise<{ sb: SupabaseClient; id: string; jwt: string }> {
  const sb = createClient(URL_, ANON, opts);
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  return { sb, id: data.user!.id, jwt: data.session!.access_token };
}

let clock = Date.now();
const handle = makeMoneyHandler({ db, cronSecret: CRON, allowedOrigins: [], now: () => new Date(clock) });
const post = async (route: string, body: unknown = {}, headers: Record<string, string> = {}) => {
  const r = await handle(new Request(`http://x/money/${route}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const tick = () => post("tick", {}, { "x-cron-secret": CRON });

function tileRow(mosaicId: string, slot: number, who: string, source: "circle" | "artist") {
  return { mosaic_id: mosaicId, slot, contributor_id: who, source, thumb: "data:image/jpeg;base64,xx", image_path: `${who}/${slot}.jpg`, average_hex: "#aabbcc", match: 1, tint: 0, status: "approved" };
}

test("the whole life of a mosaic's money", async () => {
  clock = Date.now();
  const owner = await anon(), a = await anon(), b = await anon(), guest = await anon();
  await db.from("artists").insert([{ id: a.id, name: "Ana" }, { id: b.id, name: "Bo" }]);
  const cols = 50, rows = 50;
  const { data: m, error } = await db.from("mosaics").insert({
    owner_id: owner.id, email: "o@example.com", title: "Money test", occasion: "birthday", tier_id: "small", cols, rows, price_cents: 4500,
    pool_cents: POOL, reveal_at: new Date(clock + 1.5 * DAY).toISOString(), visibility: "public", target_path: "x", slots_packed: "aabbcc".repeat(cols * rows), status: "collecting",
  }).select().single();
  assert.equal(error, null);

  // Ana places 20 tiles, Bo 5, a guest 3. All approved.
  const rowsIn = [
    ...Array.from({ length: 20 }, (_, i) => tileRow(m.id, i, a.id, "artist")),
    ...Array.from({ length: 5 }, (_, i) => tileRow(m.id, 100 + i, b.id, "artist")),
    ...Array.from({ length: 3 }, (_, i) => tileRow(m.id, 200 + i, guest.id, "circle")),
  ];
  assert.equal((await db.from("tiles").insert(rowsIn)).error, null);

  assert.equal((await post("tick")).status, 403, "the hourly job needs its secret");

  // Within 2 days of the date: everything still open gets studio fill.
  let r = await tick();
  assert.equal(r.body.studioFilled, cols * rows - 28);
  assert.equal(r.body.revealed, 0);

  // On the date: revealed.
  clock += 2 * DAY;
  r = await tick();
  assert.equal(r.body.revealed, 1);
  const { data: revealed } = await db.from("mosaics").select("status, revealed_at").eq("id", m.id).single();
  assert.equal(revealed!.status, "revealed");

  // The owner favourites one of Bo's tiles.
  assert.equal((await owner.sb.rpc("toggle_favourite", { p_id: m.id, p_slot: 100 })).data, null);

  // Before the favourites window closes: no split.
  r = await tick();
  assert.equal(r.body.split, 0);
  // Real time has to pass the window too, because revealed_at was set by the database clock.
  await db.from("mosaics").update({ revealed_at: new Date(Date.now() - 8 * DAY).toISOString() }).eq("id", m.id);
  clock = Date.now();
  r = await tick();
  assert.equal(r.body.split, 1);
  assert.equal((await tick()).body.split, 0, "never split twice");

  const { data: shares } = await db.from("ledger").select("*").eq("mosaic_id", m.id).eq("kind", "share").order("artist_id");
  const byArtist = Object.fromEntries(shares!.map((s) => [s.artist_id, s]));
  // Weights: Ana 20, Bo 5 + 1 favourite bonus = 6.
  assert.equal(byArtist[a.id].amount_cents, Math.floor((POOL * 20) / 26));
  assert.equal(byArtist[b.id].amount_cents, Math.floor((POOL * 6) / 26));
  const { data: rev } = await db.from("revenue").select("cents").eq("mosaic_id", m.id);
  assert.equal(rev!.reduce((t, x) => t + x.cents, 0), POOL - byArtist[a.id].amount_cents - byArtist[b.id].amount_cents, "rounding goes to revenue");

  // An admin removes one of Ana's tiles after a report: her share drops once.
  const { data: anaTile } = await db.from("tiles").select("id").eq("mosaic_id", m.id).eq("slot", 0).single();
  await db.from("tiles").update({ status: "removed" }).eq("id", anaTile!.id);
  assert.equal((await tick()).body.reversed, 1);
  assert.equal((await tick()).body.reversed, 0, "reversed only once");

  // Bo has only 5 accepted tiles: his first payout is locked.
  assert.match((await post("request-payout", {}, { authorization: `Bearer ${b.jwt}` })).body.error, /unlocks after 20/);
  // Ana paints one more, back to 20 accepted. Still too early: her earnings are on hold.
  await db.from("tiles").insert(tileRow(m.id, 300, a.id, "artist"));
  const early = await post("request-payout", {}, { authorization: `Bearer ${a.jwt}` });
  assert.equal(early.status, 400);
  assert.match(early.body.error, /payout from/);

  // After the hold, earnings are released and Ana asks.
  clock = Date.now() + POOL_RULES.holdDays * DAY;
  assert.ok((await tick()).body.released >= 2);
  const ok = await post("request-payout", {}, { authorization: `Bearer ${a.jwt}` });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.entry.amountCents, byArtist[a.id].amount_cents - Math.floor(byArtist[a.id].amount_cents / 20));
  assert.match((await post("request-payout", {}, { authorization: `Bearer ${a.jwt}` })).body.error, /already have/);

  // Only an admin can settle it.
  assert.equal((await post("settle-payout", { requestId: ok.body.entry.id, ok: true }, { authorization: `Bearer ${b.jwt}` })).status, 403);
  const email = `money-admin-${Date.now()}@example.com`;
  await db.from("admins").insert({ email });
  await db.auth.admin.createUser({ email, password: "pw-12345678", email_confirm: true });
  const adminSb = createClient(URL_, ANON, opts);
  const { data: s } = await adminSb.auth.signInWithPassword({ email, password: "pw-12345678" });
  const paid = await post("settle-payout", { requestId: ok.body.entry.id, ok: true, reference: "Bank transfer 123" }, { authorization: `Bearer ${s.session!.access_token}` });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.balances.paidCents, ok.body.entry.amountCents);
  assert.equal((await post("settle-payout", { requestId: ok.body.entry.id, ok: true }, { authorization: `Bearer ${s.session!.access_token}` })).status, 409, "can't pay twice");

  // Artists see only their own ledger.
  const own = await a.sb.from("ledger").select("artist_id");
  assert.ok(own.data!.length > 0 && own.data!.every((x) => x.artist_id === a.id));
});

test("unpaid orders are cancelled after two days", async () => {
  clock = Date.now();
  const owner = await anon();
  const { data: m } = await db.from("mosaics").insert({
    owner_id: owner.id, email: "o@example.com", title: "Never paid", occasion: "other", tier_id: "small", cols: 10, rows: 10, price_cents: 4500,
    reveal_at: new Date(clock + 30 * DAY).toISOString(), visibility: "public", target_path: "x", slots_packed: "aabbcc".repeat(100),
    status: "awaiting_payment", created_at: new Date(clock - 3 * DAY).toISOString(),
  }).select().single();
  await tick();
  const { data } = await db.from("mosaics").select("status").eq("id", m!.id).single();
  assert.equal(data!.status, "cancelled");
});
