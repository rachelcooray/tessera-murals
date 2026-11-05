/**
 * Database tests against a local Supabase (`supabase start`, then `supabase db reset`).
 * Run with: npm run test:db
 * Each test acts as a real user (anonymous guest, owner, admin, outsider) through the public API,
 * so the security rules are tested exactly as the website meets them.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE, opts);
const fresh = () => createClient(URL, ANON, opts);

async function anonUser(): Promise<{ sb: SupabaseClient; id: string }> {
  const sb = fresh();
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  return { sb, id: data.user!.id };
}

async function emailUser(email: string): Promise<{ sb: SupabaseClient; id: string }> {
  await admin.auth.admin.createUser({ email, password: "pw-12345678", email_confirm: true });
  const sb = fresh();
  const { data, error } = await sb.auth.signInWithPassword({ email, password: "pw-12345678" });
  if (error) throw error;
  return { sb, id: data.user!.id };
}

const COLS = 10, ROWS = 10, N = COLS * ROWS;
// A recognisable "picture": slot i has colour #iiiiii-ish, so leaks are easy to spot.
const SLOTS = Array.from({ length: N }, (_, i) => (i * 2).toString(16).padStart(2, "0").repeat(3)).join("");
const THUMB = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);

async function makeMosaic(ownerId: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await admin.from("mosaics").insert({
    owner_id: ownerId, email: "buyer@example.com", title: "Test mosaic", occasion: "wedding", tier_id: "small",
    cols: COLS, rows: ROWS, price_cents: 4500, reveal_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
    visibility: "public", target_path: `${ownerId}/target.jpg`, slots_packed: SLOTS, status: "collecting", ...extra,
  }).select().single();
  if (error) throw error;
  return data as { id: string; invite_token: string };
}

/** Random 64-bit hashes: two of them land within 6 bits of each other about once in 10 billion. */
function uniqueHash(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function paint(sb: SupabaseClient, uid: string, mosaicId: string, token: string | null, slot: number, source = "circle", hash = uniqueHash()) {
  const path = `${uid}/${crypto.randomUUID()}.jpg`;
  const up = await sb.storage.from("tiles").upload(path, JPEG, { contentType: "image/jpeg" });
  if (up.error) throw up.error;
  return sb.rpc("submit_tile", {
    p_mosaic: mosaicId, p_token: token, p_source: source, p_slot: slot, p_name: "Ana", p_medium: "Painting", p_thumb: THUMB,
    p_image_path: path, p_average_hex: "#aabbcc", p_match: 0.9, p_tint: 0.3, p_hash: hash, p_flags: [], p_painted: null,
  });
}

let owner: { sb: SupabaseClient; id: string };
let adminUser: { sb: SupabaseClient; id: string };

before(async () => {
  owner = await anonUser();
  const email = `admin-${Date.now()}@example.com`;
  await admin.from("admins").insert({ email });
  adminUser = await emailUser(email);
});

test("guests cannot read the picture, only their own slot colour", async () => {
  const m = await makeMosaic(owner.id);
  const guest = await anonUser();

  const direct = await guest.sb.from("mosaics").select("slots_packed").eq("id", m.id);
  assert.deepEqual(direct.data, [], "guest must not read the mosaics table");

  const locked = await guest.sb.rpc("join_info", { p_mosaic: m.id, p_token: "wrong" });
  assert.equal(locked.data.status, "locked");
  assert.equal(locked.data.title, undefined);

  const info = await guest.sb.rpc("join_info", { p_mosaic: m.id, p_token: m.invite_token });
  assert.equal(info.data.title, "Test mosaic");
  assert.equal(JSON.stringify(info.data).includes(SLOTS.slice(0, 30)), false, "join_info must not include the slot grid");

  const claim = await guest.sb.rpc("claim_slot", { p_mosaic: m.id, p_token: m.invite_token });
  assert.equal(claim.error, null);
  const slot = claim.data.slot as number;
  assert.equal(claim.data.hex, "#" + SLOTS.slice(slot * 6, slot * 6 + 6));

  const up = await owner.sb.storage.from("targets").upload(`${owner.id}/target.jpg`, JPEG, { contentType: "image/jpeg", upsert: true });
  assert.equal(up.error, null, "owner uploads their target");
  assert.equal((await owner.sb.storage.from("targets").download(`${owner.id}/target.jpg`)).error, null, "owner reads it back");
  const target = await guest.sb.storage.from("targets").download(`${owner.id}/target.jpg`);
  assert.ok(target.error, "guest must not read the target photo");
  for (const fn of ["_reveal", "_studio_fill"]) {
    const r = await guest.sb.rpc(fn, { p_id: m.id });
    assert.ok(r.error, `${fn} is internal`);
  }

  const ownerView = await owner.sb.from("mosaics").select("slots_packed").eq("id", m.id).single();
  assert.equal(ownerView.data?.slots_packed, SLOTS, "owner reads their own mosaic");
});

test("two guests never get the same slot, and a claimed slot can't be taken", async () => {
  const m = await makeMosaic(owner.id);
  const a = await anonUser(), b = await anonUser();
  const ca = await a.sb.rpc("claim_slot", { p_mosaic: m.id, p_token: m.invite_token, p_slot: 5 });
  assert.equal(ca.data.slot, 5);
  const cb = await b.sb.rpc("claim_slot", { p_mosaic: m.id, p_token: m.invite_token, p_slot: 5 });
  assert.match(cb.error?.message ?? "", /just taken/);
  const many = await Promise.all(Array.from({ length: 12 }, async () => {
    const g = await anonUser();
    return (await g.sb.rpc("claim_slot", { p_mosaic: m.id, p_token: m.invite_token })).data.slot as number;
  }));
  assert.equal(new Set([...many, 5]).size, 13, "every claim got its own slot");
});

test("submitting a tile: needs the claim, own upload folder, and the right slot", async () => {
  const m = await makeMosaic(owner.id);
  const g = await anonUser();
  const { data: c } = await g.sb.rpc("claim_slot", { p_mosaic: m.id, p_token: m.invite_token });

  const wrongSlot = await paint(g.sb, g.id, m.id, m.invite_token, (c.slot + 1) % N);
  assert.match(wrongSlot.error?.message ?? "", /hold/);

  const other = await anonUser();
  const sneaky = await g.sb.storage.from("tiles").upload(`${other.id}/x.jpg`, JPEG, { contentType: "image/jpeg" });
  assert.ok(sneaky.error, "can't upload into someone else's folder");

  const ok = await paint(g.sb, g.id, m.id, m.invite_token, c.slot);
  assert.equal(ok.error, null);
  assert.equal(ok.data.status, "pending");

  const again = await g.sb.rpc("claim_slot", { p_mosaic: m.id, p_token: m.invite_token, p_slot: c.slot });
  assert.match(again.error?.message ?? "", /just taken/, "a slot with a pending tile isn't free");

  const mine = await g.sb.from("tiles").select("id").eq("mosaic_id", m.id);
  assert.equal(mine.data?.length, 1);
  const ownerTiles = await owner.sb.from("tiles").select("id").eq("mosaic_id", m.id);
  assert.equal(ownerTiles.data?.length, 1, "owner sees tiles in their mosaic");
  const outsider = await anonUser();
  const peek = await outsider.sb.from("tiles").select("id").eq("mosaic_id", m.id);
  assert.deepEqual(peek.data, [], "outsiders see nothing");
});

test("near-duplicate tiles from the same person are refused", async () => {
  const m = await makeMosaic(owner.id);
  const g = await anonUser();
  const h = uniqueHash();
  let c = (await g.sb.rpc("claim_slot", { p_mosaic: m.id, p_token: m.invite_token })).data;
  assert.equal((await paint(g.sb, g.id, m.id, m.invite_token, c.slot, "circle", h)).error, null);
  c = (await g.sb.rpc("claim_slot", { p_mosaic: m.id, p_token: m.invite_token })).data;
  const nearly = h.slice(0, 15) + (h[15] === "0" ? "1" : "0");
  const dup = await paint(g.sb, g.id, m.id, m.invite_token, c.slot, "circle", nearly);
  assert.match(dup.error?.message ?? "", /almost the same/);
});

test("only admins review; owners fill and reveal; anyone can see a revealed mosaic", async () => {
  const m = await makeMosaic(owner.id);
  const g = await anonUser();
  const { data: c } = await g.sb.rpc("claim_slot", { p_mosaic: m.id, p_token: m.invite_token });
  const { data: tile } = await paint(g.sb, g.id, m.id, m.invite_token, c.slot);

  assert.equal((await g.sb.rpc("am_admin")).data, false);
  assert.match((await g.sb.rpc("review_tile", { p_tile: tile.id, p_ok: true })).error?.message ?? "", /Admins only/);
  assert.equal((await adminUser.sb.rpc("am_admin")).data, true);
  assert.equal((await adminUser.sb.rpc("review_tile", { p_tile: tile.id, p_ok: true })).error, null);

  assert.match((await g.sb.rpc("studio_fill", { p_id: m.id })).error?.message ?? "", /Not found/, "guests can't studio fill");
  assert.equal((await owner.sb.rpc("reveal_now", { p_id: m.id })).data, "Some slots are still empty or in review.");
  const filled = await owner.sb.rpc("studio_fill", { p_id: m.id });
  assert.equal(filled.data, N - 1);
  assert.equal((await owner.sb.rpc("reveal_now", { p_id: m.id })).data, null);

  const viewer = fresh();
  const r = await viewer.rpc("revealed_mosaic", { p_id: m.id });
  assert.equal(r.data.status, "revealed");
  assert.equal(r.data.tiles.length, 1);
  assert.equal(r.data.tiles[0].hash, undefined, "no private fields in public data");
  assert.notEqual(r.data.tiles[0].contributorId, g.id, "contributors stay anonymous");
  const img = await viewer.storage.from("tiles").createSignedUrl(r.data.tiles[0].imagePath, 60);
  assert.equal(img.error, null, "revealed tiles are viewable by anyone with the link");
});

test("before the reveal the teaser shows only title and date", async () => {
  const m = await makeMosaic(owner.id);
  const t = await fresh().rpc("mosaic_teaser", { p_id: m.id });
  assert.deepEqual(Object.keys(t.data).sort(), ["cols", "id", "revealAt", "rows", "status", "title"]);
  assert.equal((await fresh().rpc("revealed_mosaic", { p_id: m.id })).data, null);
});

test("artists: need a profile, open mosaic, and stay under the cap", async () => {
  const m = await makeMosaic(owner.id);
  const a = await anonUser();
  const noProfile = await a.sb.rpc("claim_slot", { p_mosaic: m.id, p_source: "artist" });
  assert.match(noProfile.error?.message ?? "", /artist profile/);
  assert.equal((await a.sb.from("artists").insert({ id: a.id, name: "Sam" })).error, null);
  const forged = await a.sb.from("artists").insert({ id: owner.id, name: "Not me" });
  assert.ok(forged.error, "can't create a profile for someone else");

  for (let i = 0; i < 10; i++) {
    const { data: c, error } = await a.sb.rpc("claim_slot", { p_mosaic: m.id, p_source: "artist" });
    assert.equal(error, null);
    assert.equal((await paint(a.sb, a.id, m.id, null, c.slot, "artist")).error, null);
  }
  const over = await a.sb.rpc("claim_slot", { p_mosaic: m.id, p_source: "artist" });
  assert.match(over.error?.message ?? "", /limit/);

  await owner.sb.rpc("set_open_to_artists", { p_id: m.id, p_on: false });
  const b = await anonUser();
  await b.sb.from("artists").insert({ id: b.id, name: "Bo" });
  assert.match((await b.sb.rpc("claim_slot", { p_mosaic: m.id, p_source: "artist" })).error?.message ?? "", /isn't open/);

  const ch = await b.sb.rpc("challenge_slots", { p_limit: 50 });
  assert.equal(ch.data.some((x: { mosaicId: string }) => x.mosaicId === m.id), false, "closed mosaics leave the challenge");
});

test("unpaid mosaics take no tiles", async () => {
  const m = await makeMosaic(owner.id, { status: "awaiting_payment" });
  const g = await anonUser();
  const r = await g.sb.rpc("claim_slot", { p_mosaic: m.id, p_token: m.invite_token });
  assert.match(r.error?.message ?? "", /isn't collecting/);
});

test("the hourly limit stops floods", async () => {
  const m = await makeMosaic(owner.id, { cols: 10, rows: 10 });
  const g = await anonUser();
  let last: { error: { message: string } | null } = { error: null };
  for (let i = 0; i < 21; i++) {
    const { data: c } = await g.sb.rpc("claim_slot", { p_mosaic: m.id, p_token: m.invite_token });
    last = await paint(g.sb, g.id, m.id, m.invite_token, c.slot);
    if (last.error) break;
  }
  assert.match(last.error?.message ?? "", /last hour/);
});
