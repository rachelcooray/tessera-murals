"use client";
/**
 * Live mode: talks to Supabase (database, Storage and the orders and money functions) and
 * merges what comes back into the store's cache. Used only through actions.ts.
 *
 * Everyone is signed in: guests and buyers anonymously (a quiet sign-in made on their first visit),
 * admins and returning buyers by email. The database decides what each of them may see.
 */
import { hexToRgb } from "../colour";
import { supabase } from "../auth";
import { slotColour, type SlotColour } from "./colours.ts";
import type { LedgerEntry } from "./ledger.ts";
import { currentState, mutate } from "./store";
import type { ArtistProfile, Claim, Mosaic, MosaicTile, RevenueEntry } from "./types.ts";

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

type Row = Record<string, unknown>;

function sb() {
  const c = supabase();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

/** Makes sure this browser has a session, signing in anonymously if needed. Returns the user id. */
export async function ensureSession(): Promise<string> {
  const c = sb();
  const { data } = await c.auth.getSession();
  if (data.session) {
    if (currentState().me !== data.session.user.id) mutate((s) => ({ ...s, me: data.session!.user.id }));
    return data.session.user.id;
  }
  const { data: d, error } = await c.auth.signInAnonymously();
  if (error || !d.user) throw new Error("We couldn’t start a session. Check your connection and reload the page.");
  mutate((s) => ({ ...s, me: d.user!.id }));
  return d.user.id;
}

export function friendly(e: unknown): string {
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e ?? "");
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "We couldn’t reach Tessera. Check your connection and try again.";
  return msg || "Something went wrong. Please try again.";
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw new Error(friendly(error));
  return data as T;
}

/** Reads every row of a query, 1,000 at a time (the API's page size). */
async function allRows(build: () => { range: (a: number, b: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }> }): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(friendly(error));
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export async function callFunction<T>(fn: "orders" | "money", route: string, body: unknown): Promise<T> {
  const { data } = await sb().auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}/${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY, authorization: `Bearer ${data.session?.access_token ?? ANON_KEY}` },
    body: JSON.stringify(body),
  }).catch(() => { throw new Error("We couldn’t reach Tessera. Check your connection and try again."); });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `Server error ${res.status}`);
  return out as T;
}

/* ---------- shapes ---------- */

const PLACEHOLDER: SlotColour = { hex: "#2b231c", light: "#2b231c", dark: "#2b231c", name: "hidden" };

function unpackSlots(packed: string): SlotColour[] {
  const out: SlotColour[] = new Array(packed.length / 6);
  for (let i = 0; i < out.length; i++) out[i] = slotColour(hexToRgb("#" + packed.slice(i * 6, i * 6 + 6)));
  return out;
}

function hiddenSlots(n: number): SlotColour[] {
  return new Array(n).fill(PLACEHOLDER);
}

export function rowToMosaic(r: Row): Mosaic {
  const n = (r.cols as number) * (r.rows as number);
  return {
    id: r.id as string, title: r.title as string, occasion: r.occasion as Mosaic["occasion"], tierId: r.tier_id as string,
    cols: r.cols as number, rows: r.rows as number, priceCents: r.price_cents as number, poolCents: r.pool_cents as number,
    email: r.email as string, createdAt: r.created_at as string, revealAt: r.reveal_at as string,
    visibility: r.visibility as Mosaic["visibility"], openToArtists: r.open_to_artists as boolean,
    ownerKey: r.owner_id as string, inviteToken: r.invite_token as string, target: (r.target_path as string) ?? "",
    slots: r.slots_packed ? unpackSlots(r.slots_packed as string) : hiddenSlots(n),
    status: r.status as Mosaic["status"], revealedAt: (r.revealed_at as string) ?? null, favourites: (r.favourites as number[]) ?? [],
    splitAt: (r.split_at as string) ?? null, payment: { intentId: (r.payment_intent_id as string) ?? null, mock: Boolean(r.payment_mock) },
    studioSlots: (r.studio_slots as string) ?? null, studioAt: (r.studio_at as string) ?? null,
  };
}

export function rowToTile(r: Row): MosaicTile {
  return {
    id: r.id as string, mosaicId: r.mosaic_id as string, slot: r.slot as number, contributorId: r.contributor_id as string,
    source: r.source as MosaicTile["source"], name: (r.name as string) ?? null, medium: (r.medium as string) ?? null,
    imageUrl: (r.thumb as string) ?? null, imagePath: (r.image_path as string) ?? null, art: null,
    averageHex: (r.average_hex as string) ?? "#000000", match: (r.match as number) ?? 1, tint: (r.tint as number) ?? 0, hash: (r.hash as string) ?? null,
    flags: (r.flags as string[]) ?? [], painted: (r.painted as MosaicTile["painted"]) ?? null, status: r.status as MosaicTile["status"],
    rejectionReason: (r.rejection_reason as string) ?? null, createdAt: r.created_at as string, reviewedAt: (r.reviewed_at as string) ?? null,
  };
}

function rowToLedger(r: Row): LedgerEntry {
  return {
    id: r.id as string, artistId: r.artist_id as string, mosaicId: (r.mosaic_id as string) ?? null, kind: r.kind as LedgerEntry["kind"],
    amountCents: r.amount_cents as number, at: r.at as string, releaseAt: (r.release_at as string) ?? undefined,
    tiles: (r.tiles as number) ?? undefined, favourites: (r.favourites as number) ?? undefined, weight: (r.weight as number) ?? undefined,
    ref: (r.ref as string) ?? undefined, note: (r.note as string) ?? undefined,
  };
}

function rowToArtist(r: Row): ArtistProfile {
  return {
    id: r.id as string, name: r.name as string, portfolio: (r.portfolio as string) ?? "", joinedAt: r.joined_at as string,
    payoutMethod: r.payout_method as ArtistProfile["payoutMethod"], payoutName: (r.payout_name as string) ?? "", country: (r.country as string) ?? "",
  };
}

/** Puts a mosaic (and optionally its tiles) into the cache, replacing what was there. */
function putMosaic(m: Mosaic, tiles?: MosaicTile[], owned?: boolean) {
  mutate((s) => ({
    ...s,
    mosaics: [...s.mosaics.filter((x) => x.id !== m.id), m],
    tiles: tiles ? [...s.tiles.filter((t) => t.mosaicId !== m.id), ...tiles] : s.tiles,
    owned: owned ? { ...s.owned, [m.id]: m.ownerKey } : s.owned,
  }));
}

function putTiles(tiles: MosaicTile[]) {
  const ids = new Set(tiles.map((t) => t.id));
  mutate((s) => ({ ...s, tiles: [...s.tiles.filter((t) => !ids.has(t.id)), ...tiles] }));
}

/* ---------- loaders ---------- */

export type LoadResult = "owner" | "revealed" | "teaser" | "missing";

/** Loads a mosaic for its dashboard, reveal or tile page: the full mosaic for its owner or an admin,
 *  the finished piece once revealed, and only the title and date for anyone else before then. */
export async function loadMosaic(id: string): Promise<LoadResult> {
  const me = await ensureSession();
  if (!/^[0-9a-f-]{36}$/.test(id)) return "missing";
  const { data: row } = await sb().from("mosaics").select("*").eq("id", id).maybeSingle();
  if (row) {
    const tiles = await allRows(() => sb().from("tiles").select("*").eq("mosaic_id", id).in("status", ["pending", "approved"]).order("created_at"));
    putMosaic(rowToMosaic(row), tiles.map(rowToTile), row.owner_id === me);
    return "owner";
  }
  const rev = await rpc<Row | null>("revealed_mosaic", { p_id: id });
  if (rev) {
    const m = rowToMosaic({ ...rev, tier_id: rev.tierId, reveal_at: rev.revealAt, revealed_at: rev.revealedAt, created_at: rev.createdAt, slots_packed: rev.slotsPacked, studio_slots: rev.studioSlots, studio_at: rev.studioAt, split_at: rev.splitAt, open_to_artists: false, owner_id: "", invite_token: "", price_cents: 0, pool_cents: 0, email: "" });
    const tiles = ((rev.tiles as Row[]) ?? []).map((t) => rowToTile({ ...t, mosaic_id: t.mosaicId, contributor_id: t.contributorId, thumb: t.imageUrl, image_path: t.imagePath, average_hex: t.averageHex, created_at: t.createdAt, reviewed_at: t.reviewedAt }));
    putMosaic(m, tiles);
    return "revealed";
  }
  const teaser = await rpc<Row | null>("mosaic_teaser", { p_id: id });
  if (teaser) {
    putMosaic(rowToMosaic({ id, title: teaser.title, cols: teaser.cols, rows: teaser.rows, reveal_at: teaser.revealAt, status: teaser.status, occasion: "other", visibility: "private", favourites: [], owner_id: "", invite_token: "" }));
    return "teaser";
  }
  return "missing";
}

export interface JoinInfo { status: string; artistTiles: number; artistCap: number; isArtist: boolean }

/** What a guest may know: the title, size and date, plus their own held slot. Never the picture. */
export async function loadJoin(id: string, token: string | null, source: "circle" | "artist"): Promise<JoinInfo | null> {
  const me = await ensureSession();
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const info = await rpc<Row | null>("join_info", { p_mosaic: id, p_token: token, p_source: source });
  if (!info) return null;
  if (info.status === "locked") {
    putMosaic(rowToMosaic({ id, title: "", cols: 10, rows: 10, status: "collecting", occasion: "other", visibility: "private", favourites: [], owner_id: "", invite_token: "\u0000" }));
    return { status: "locked", artistTiles: 0, artistCap: 0, isArtist: false };
  }
  const m = rowToMosaic({
    id, title: info.title, occasion: info.occasion, cols: info.cols, rows: info.rows, reveal_at: info.revealAt, status: info.status,
    open_to_artists: info.openToArtists, visibility: "private", favourites: [], owner_id: "", invite_token: token ?? "",
  });
  const claim = info.claim as Row | null;
  if (claim) m.slots[claim.slot as number] = slotColour(hexToRgb(claim.hex as string));
  putMosaic(m);
  mutate((s) => ({
    ...s,
    claims: [...s.claims.filter((c) => c.mosaicId !== id || c.contributorId !== me),
      ...(claim ? [{ mosaicId: id, slot: claim.slot as number, contributorId: me, source: claim.source as Claim["source"], at: claim.at as string }] : [])],
  }));
  return { status: info.status as string, artistTiles: info.artistTiles as number, artistCap: info.artistCap as number, isArtist: Boolean(info.isArtist) };
}

/** The signed-in person's artist profile, tiles and earnings, plus the titles of mosaics they're in. */
export async function loadMe(): Promise<void> {
  const me = await ensureSession();
  const [{ data: artist }, tiles, ledger] = await Promise.all([
    sb().from("artists").select("*").eq("id", me).maybeSingle(),
    allRows(() => sb().from("tiles").select("*").eq("contributor_id", me).order("created_at")),
    allRows(() => sb().from("ledger").select("*").eq("artist_id", me).order("at")),
  ]);
  const ids = [...new Set(tiles.map((t) => t.mosaic_id as string))].filter((id) => !currentState().mosaics.some((m) => m.id === id));
  const teasers = await Promise.all(ids.map((id) => rpc<Row | null>("mosaic_teaser", { p_id: id }).then((t) => [id, t] as const)));
  mutate((s) => ({
    ...s,
    artist: artist ? rowToArtist(artist) : null,
    ledger: [...s.ledger.filter((e) => e.artistId !== me), ...ledger.map(rowToLedger)],
    mosaics: [...s.mosaics, ...teasers.filter(([, t]) => t).map(([id, t]) => rowToMosaic({ id, title: t!.title, cols: t!.cols, rows: t!.rows, reveal_at: t!.revealAt, status: t!.status, occasion: "other", visibility: "private", favourites: [], owner_id: "", invite_token: "" }))],
  }));
  putTiles(tiles.map(rowToTile));
}

/** The buyer's own mosaics, for "My mosaics". */
export async function loadMine(): Promise<Mosaic[]> {
  const me = await ensureSession();
  const rows = await allRows(() => sb().from("mosaics").select("id, title, occasion, tier_id, cols, rows, price_cents, pool_cents, email, created_at, reveal_at, visibility, open_to_artists, owner_id, invite_token, status, revealed_at, favourites, split_at, payment_intent_id, payment_mock, studio_slots, studio_at").eq("owner_id", me).order("created_at", { ascending: false }));
  return rows.map((r) => rowToMosaic(r));
}

export interface AdminData { artists: Record<string, string> }

/** Everything the admin pages show. Only works for admins: the database returns nothing to anyone else. */
export async function loadAdmin(): Promise<AdminData> {
  await ensureSession();
  const [mosaics, tiles, pending, ledger, revenue, artists] = await Promise.all([
    allRows(() => sb().from("mosaics").select("*").in("status", ["collecting", "revealed"]).order("created_at", { ascending: false })),
    allRows(() => sb().from("tiles").select("id, mosaic_id, slot, contributor_id, source, name, medium, average_hex, match, tint, status, created_at, reviewed_at, image_path").in("status", ["approved"]).order("created_at")),
    allRows(() => sb().from("tiles").select("*").eq("status", "pending").order("created_at")),
    allRows(() => sb().from("ledger").select("*").order("at")),
    allRows(() => sb().from("revenue").select("*").order("at")),
    allRows(() => sb().from("artists").select("id, name")),
  ]);
  mutate((s) => ({
    ...s,
    mosaics: mosaics.map(rowToMosaic),
    tiles: [...tiles, ...pending].map(rowToTile),
    ledger: ledger.map(rowToLedger),
    revenue: revenue.map((r): RevenueEntry => ({ id: r.id as string, mosaicId: r.mosaic_id as string, cents: r.cents as number, reason: r.reason as string, at: r.at as string })),
  }));
  return { artists: Object.fromEntries(artists.map((a) => [a.id as string, a.name as string])) };
}

export async function amAdmin(): Promise<boolean> {
  try { return await rpc<boolean>("am_admin"); } catch { return false; }
}

export interface ChallengeCard { mosaicId: string; title: string; occasion: string; revealAt: string; slot: number; hex: string; total: number }

export async function loadChallenge(limit = 24): Promise<ChallengeCard[]> {
  await ensureSession();
  return rpc<ChallengeCard[]>("challenge_slots", { p_limit: limit });
}

export interface GalleryItem { id: string; title: string; occasion: string; cols: number; rows: number; revealedAt: string }

export async function loadGallery(): Promise<GalleryItem[]> {
  return rpc<GalleryItem[]>("public_mosaics");
}

/* ---------- writes ---------- */

function dataUrlToBlob(url: string): Blob {
  const [head, body] = url.split(",");
  const type = /data:([^;]+)/.exec(head)?.[1] ?? "image/jpeg";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

function canvasToBlob(c: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Couldn’t prepare the image."))), "image/jpeg", quality));
}

/** A tiny copy for drawing the whole grid: 24 px is plenty when a 40,000-tile mosaic is a few pixels a tile. */
async function thumbOf(dataUrl: string, size = 24): Promise<string> {
  const img = new Image();
  await new Promise<void>((ok, no) => { img.onload = () => ok(); img.onerror = () => no(new Error("Couldn’t read the tile.")); img.src = dataUrl; });
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, size, size);
  return c.toDataURL("image/jpeg", 0.7);
}

async function upload(bucket: "targets" | "tiles", blob: Blob): Promise<string> {
  const me = await ensureSession();
  const path = `${me}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb().storage.from(bucket).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("Your picture didn’t upload. Check your connection and try again.");
  return path;
}

export interface OrderInput {
  tierId: string; title: string; occasion: string; email: string; revealAt: string; visibility: string; openToArtists: boolean;
  slotsPacked: string; target: HTMLCanvasElement;
}

export async function createOrder(o: OrderInput): Promise<{ mosaicId: string; clientSecret?: string; mock?: boolean }> {
  const targetPath = await upload("targets", await canvasToBlob(o.target));
  const { target: _t, ...rest } = o;
  void _t;
  return callFunction("orders", "create", { ...rest, targetPath });
}

export async function confirmOrder(mosaicId: string): Promise<{ status: string }> {
  return callFunction("orders", "confirm", { mosaicId });
}

/** Asks the server for a slot. Returns the slot, or a message to show. */
export async function claim(mosaicId: string, opts: { token: string | null; source: "circle" | "artist"; slot?: number; hex?: string }): Promise<number | string> {
  const me = await ensureSession();
  try {
    const r = await rpc<{ slot: number; hex: string; at: string }>("claim_slot", { p_mosaic: mosaicId, p_token: opts.token, p_source: opts.source, p_slot: opts.slot ?? null, p_hex: opts.hex ?? null });
    mutate((s) => ({
      ...s,
      mosaics: s.mosaics.map((m) => { if (m.id !== mosaicId) return m; const slots = m.slots.slice(); slots[r.slot] = slotColour(hexToRgb(r.hex)); return { ...m, slots }; }),
      claims: [...s.claims.filter((c) => !(c.mosaicId === mosaicId && c.contributorId === me)), { mosaicId, slot: r.slot, contributorId: me, source: opts.source, at: r.at }],
    }));
    return r.slot;
  } catch (e) {
    return friendly(e);
  }
}

export async function releaseClaim(mosaicId: string): Promise<void> {
  const me = await ensureSession();
  await rpc("release_claim", { p_mosaic: mosaicId });
  mutate((s) => ({ ...s, claims: s.claims.filter((c) => !(c.mosaicId === mosaicId && c.contributorId === me)) }));
}

export async function submitTile(tile: Omit<MosaicTile, "id" | "contributorId" | "status" | "rejectionReason" | "createdAt" | "reviewedAt">, token: string | null): Promise<MosaicTile> {
  const me = await ensureSession();
  const imagePath = await upload("tiles", dataUrlToBlob(tile.imageUrl!));
  const thumb = await thumbOf(tile.imageUrl!);
  const r = await rpc<Row>("submit_tile", {
    p_mosaic: tile.mosaicId, p_token: token, p_source: tile.source, p_slot: tile.slot, p_name: tile.name, p_medium: tile.medium,
    p_thumb: thumb, p_image_path: imagePath, p_average_hex: tile.averageHex.toLowerCase(), p_match: tile.match, p_tint: tile.tint,
    p_hash: tile.hash, p_flags: tile.flags, p_painted: tile.painted ?? null,
  });
  const t: MosaicTile = { ...rowToTile({ ...r, mosaic_id: r.mosaicId, contributor_id: me, thumb: r.imageUrl, image_path: r.imagePath, average_hex: r.averageHex, rejection_reason: null, created_at: r.createdAt, reviewed_at: null }), imageUrl: tile.imageUrl };
  putTiles([t]);
  mutate((s) => ({ ...s, claims: s.claims.filter((c) => !(c.mosaicId === tile.mosaicId && c.contributorId === me)) }));
  return t;
}

export async function ownerAction(fn: "set_open_to_artists" | "toggle_favourite" | "reveal_now" | "studio_fill", args: Record<string, unknown>): Promise<unknown> {
  const r = await rpc(fn, args);
  await loadMosaic(String(args.p_id));
  return r;
}

export async function reviewTile(id: string, ok: boolean, reason: string | null): Promise<void> {
  await rpc("review_tile", { p_tile: id, p_ok: ok, p_reason: reason });
  mutate((s) => ({ ...s, tiles: s.tiles.map((t) => (t.id === id ? { ...t, status: ok ? "approved" : "rejected", rejectionReason: ok ? null : reason, reviewedAt: new Date().toISOString() } : t)) }));
}

export async function removeTile(id: string, note: string): Promise<void> {
  await rpc("remove_tile", { p_tile: id, p_note: note });
  mutate((s) => ({ ...s, tiles: s.tiles.map((t) => (t.id === id ? { ...t, status: "removed", rejectionReason: note } : t)) }));
}

export async function saveArtist(p: Omit<ArtistProfile, "id" | "joinedAt">): Promise<void> {
  const me = await ensureSession();
  const { data, error } = await sb().from("artists").upsert({ id: me, name: p.name, portfolio: p.portfolio, payout_method: p.payoutMethod, payout_name: p.payoutName, country: p.country }).select().single();
  if (error) throw new Error(friendly(error));
  mutate((s) => ({ ...s, artist: rowToArtist(data) }));
}

export async function requestPayout(): Promise<LedgerEntry> {
  const r = await callFunction<{ entry: LedgerEntry }>("money", "request-payout", {});
  mutate((s) => ({ ...s, ledger: [...s.ledger, r.entry] }));
  return r.entry;
}

export async function settlePayout(requestId: string, ok: boolean, reference?: string): Promise<LedgerEntry> {
  const r = await callFunction<{ entry: LedgerEntry }>("money", "settle-payout", { requestId, ok, reference });
  mutate((s) => ({ ...s, ledger: [...s.ledger, r.entry] }));
  return r.entry;
}

/** Short-lived links to many full-size tiles at once, by path. */
export async function tileImageUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 500) {
    const { data } = await sb().storage.from("tiles").createSignedUrls(paths.slice(i, i + 500), 3600);
    for (const d of data ?? []) if (d.signedUrl && d.path) out.set(d.path, d.signedUrl);
  }
  return out;
}

/** A short-lived link to a full-size tile image. */
export async function tileImageUrl(path: string): Promise<string | null> {
  const { data } = await sb().storage.from("tiles").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Live mode: a confirmed email lets a buyer reach their mosaics from any device. */
export async function rememberEmail(email: string): Promise<string | null> {
  const { data } = await sb().auth.getUser();
  if (!data.user || data.user.email) return null;
  const { error } = await sb().auth.updateUser({ email }, { emailRedirectTo: `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, "")}/mine/` });
  return error ? friendly(error) : null;
}

export async function signInByEmail(email: string): Promise<string | null> {
  const { error } = await sb().auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}${window.location.pathname}` } });
  return error ? friendly(error) : null;
}

