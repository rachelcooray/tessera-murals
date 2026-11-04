"use client";
/**
 * Mock backend for commissioned mosaics. Everything lives in this browser's localStorage,
 * like the season wall's store. Phase 2 swaps these functions for Supabase calls behind the
 * same names. The money logic (pool.ts, ledger.ts) is already server-ready and tested.
 */
import { useMemo, useSyncExternalStore } from "react";
import { artistCap, mosaicConfig } from "@/config/mosaic";
import { hexToRgb, rgbToHsl } from "../colour";
import type { LedgerEntry } from "./ledger.ts";
import { entryId, releaseDue, reverseTile } from "./ledger.ts";
import { poolFor, splitPool } from "./pool.ts";
import { sampleMosaic } from "./sample.ts";
import { decodeSlots, encodeSlots, packHex, unpackHex } from "./bits.ts";
import { slotColour, type SlotColour } from "./colours.ts";
import type { ArtistProfile, Claim, Mosaic, MosaicTile, RevenueEntry } from "./types.ts";

export interface MosaicState {
  v: 1;
  mosaics: Mosaic[];
  tiles: MosaicTile[];
  claims: Claim[];
  ledger: LedgerEntry[];
  revenue: RevenueEntry[];
  artist: ArtistProfile | null;
  /** This browser's contributor id. */
  me: string;
  /** Owner keys this browser holds, by mosaic id. */
  owned: Record<string, string>;
  /** Submission times per contributor, for the hourly limit. */
  submissions: Record<string, number[]>;
}

const KEY = "tessera:mosaic:v1";
const DAY = 86400_000;
const SERVER: MosaicState = { v: 1, mosaics: [], tiles: [], claims: [], ledger: [], revenue: [], artist: null, me: "", owned: {}, submissions: {} };

let state: MosaicState | null = null;
const listeners = new Set<() => void>();

export function rid(prefix: string): string {
  const r = typeof crypto !== "undefined" && "getRandomValues" in crypto ? Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("") : Math.random().toString(16).slice(2, 14);
  return `${prefix}${Date.now().toString(36)}${r}`;
}

type StoredMosaic = Omit<Mosaic, "slots"> & { slots?: SlotColour[]; slotsPacked?: string };

/** Big mosaics keep their slot colours as one packed string in storage, and full objects in memory. */
function toStorage(s: MosaicState) {
  return { ...s, mosaics: s.mosaics.map(({ slots, ...m }) => ({ ...m, slotsPacked: packHex(slots.map((x) => x.hex)) })) };
}

function fromStorage(raw: Omit<Partial<MosaicState>, "mosaics"> & { mosaics?: StoredMosaic[] }): MosaicState {
  const mosaics = (raw.mosaics ?? []).map(({ slotsPacked, slots, ...m }) => ({ ...m, slots: slots ?? unpackHex(slotsPacked ?? "").map((h) => slotColour(hexToRgb(h))) }) as Mosaic);
  return { ...SERVER, ...raw, mosaics } as MosaicState;
}

function load(): MosaicState {
  if (state) return state;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    state = raw ? fromStorage(JSON.parse(raw)) : { ...SERVER };
  } catch {
    state = { ...SERVER };
  }
  if (!state.me) state = { ...state, me: rid("c") };
  return state;
}

function save(next: MosaicState) {
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(toStorage(next)));
  } catch {
    // Storage full: keep working in memory and tell the caller through lastSaveFailed.
    lastSaveFailed = true;
  }
  listeners.forEach((l) => l());
}

export let lastSaveFailed = false;

function update(fn: (s: MosaicState) => MosaicState) {
  save(fn(load()));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { state = null; cb(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage); };
}

export function useMosaicState(): MosaicState {
  return useSyncExternalStore(subscribe, load, () => SERVER);
}

/* ---------- reads ---------- */

const sample = (() => { let c: ReturnType<typeof sampleMosaic> | null = null; return () => (c ??= sampleMosaic()); })();

export function allMosaics(s: MosaicState): Mosaic[] {
  return [...s.mosaics, sample().mosaic];
}

const studioCache = new Map<string, MosaicTile[]>();

/** Studio-filled tiles, generated from the mosaic's bitmap so they never take up storage. */
function studioTiles(m: Mosaic): MosaicTile[] {
  if (!m.studioSlots) return [];
  const key = `${m.id}:${m.studioSlots}`;
  const hit = studioCache.get(key);
  if (hit) return hit;
  const kinds = ["abstract", "waves", "hills", "bloom", "horizon"] as const;
  let salt = 0;
  for (let i = 0; i < m.id.length; i++) salt = (salt * 31 + m.id.charCodeAt(i)) >>> 0;
  const at = m.studioAt ?? m.createdAt;
  const tiles = decodeSlots(m.studioSlots, m.cols * m.rows).map((i): MosaicTile => {
    const slot = m.slots[i];
    const [h, sat, l] = rgbToHsl(hexToRgb(slot.hex));
    const seed = (i * 2246822519 + salt) >>> 0;
    return {
      id: `f-${m.id}-${i}`, mosaicId: m.id, slot: i, contributorId: "studio", source: "studio", name: null, medium: "Studio fill",
      imageUrl: null, art: { kind: kinds[seed % kinds.length], seed, h, s: Math.max(18, sat), l: Math.max(14, Math.min(80, l)) },
      averageHex: slot.hex, match: 1, tint: 0, hash: null, flags: [], status: "approved", rejectionReason: null, createdAt: at, reviewedAt: at,
    };
  });
  studioCache.set(key, tiles);
  return tiles;
}

const tilesCache = new WeakMap<MosaicState, MosaicTile[]>();

export function allTiles(s: MosaicState): MosaicTile[] {
  let t = tilesCache.get(s);
  if (!t) { t = [...s.tiles, ...s.mosaics.flatMap(studioTiles), ...sample().tiles]; tilesCache.set(s, t); }
  return t;
}

export function useMosaic(id: string): Mosaic | undefined {
  const s = useMosaicState();
  return useMemo(() => allMosaics(s).find((m) => m.id === id), [s, id]);
}

const byMosaicCache = new WeakMap<MosaicState, Map<string, MosaicTile[]>>();

export function tilesFor(s: MosaicState, mosaicId: string): MosaicTile[] {
  let per = byMosaicCache.get(s);
  if (!per) {
    per = new Map();
    for (const t of allTiles(s)) { const list = per.get(t.mosaicId); if (list) list.push(t); else per.set(t.mosaicId, [t]); }
    byMosaicCache.set(s, per);
  }
  return per.get(mosaicId) ?? [];
}

const slotMapCache = new WeakMap<MosaicState, Map<string, Map<number, MosaicTile>>>();

/** slotMap for one mosaic, computed once per state. */
export function slotMapFor(s: MosaicState, mosaicId: string): Map<number, MosaicTile> {
  let per = slotMapCache.get(s);
  if (!per) { per = new Map(); slotMapCache.set(s, per); }
  let m = per.get(mosaicId);
  if (!m) { m = slotMap(tilesFor(s, mosaicId)); per.set(mosaicId, m); }
  return m;
}

/** The tile currently filling each slot (approved first, then pending), by slot number. */
export function slotMap(tiles: MosaicTile[]): Map<number, MosaicTile> {
  const m = new Map<number, MosaicTile>();
  for (const t of tiles) {
    if (t.status !== "approved" && t.status !== "pending") continue;
    const prev = m.get(t.slot);
    if (!prev || (prev.status === "pending" && t.status === "approved")) m.set(t.slot, t);
  }
  return m;
}

function activeClaims(s: MosaicState, mosaicId: string, now = Date.now()): Claim[] {
  return s.claims.filter((c) => c.mosaicId === mosaicId && now - Date.parse(c.at) < mosaicConfig.slotHoldHours * 3600_000);
}

export function isSlotOpen(s: MosaicState, m: Mosaic, slot: number, forContributor?: string): boolean {
  if (slotMapFor(s, m.id).has(slot)) return false;
  return !activeClaims(s, m.id).some((c) => c.slot === slot && c.contributorId !== forContributor);
}

export function progress(s: MosaicState, m: Mosaic) {
  const map = slotMapFor(s, m.id);
  const total = m.cols * m.rows;
  let circle = 0, artist = 0, studio = 0, review = 0, sampleN = 0;
  for (const t of map.values()) {
    if (t.status === "pending") { review++; continue; }
    if (t.source === "circle") circle++;
    else if (t.source === "artist") artist++;
    else if (t.source === "studio") studio++;
    else sampleN++;
  }
  const approved = circle + artist + studio + sampleN;
  return { total, circle, artist, studio, review, sample: sampleN, approved, open: total - approved - review, complete: approved === total };
}

export function ownsMosaic(s: MosaicState, m: Mosaic): boolean {
  return s.owned[m.id] === m.ownerKey;
}

export function artistTileCount(s: MosaicState, mosaicId: string, contributorId: string): number {
  return tilesFor(s, mosaicId).filter((t) => t.contributorId === contributorId && t.source === "artist" && (t.status === "approved" || t.status === "pending")).length;
}

export function capFor(m: Mosaic): number {
  return artistCap(m.cols * m.rows);
}

/* ---------- writes: customer ---------- */

export function createMosaic(input: Omit<Mosaic, "id" | "createdAt" | "ownerKey" | "inviteToken" | "status" | "revealedAt" | "favourites" | "splitAt" | "poolCents">): Mosaic {
  const m: Mosaic = {
    ...input, id: rid("m"), createdAt: new Date().toISOString(), ownerKey: rid("k"), inviteToken: rid("i").slice(-10),
    status: "collecting", revealedAt: null, favourites: [], splitAt: null, poolCents: poolFor(input.priceCents, mosaicConfig.pool.shareBps),
  };
  update((s) => ({ ...s, mosaics: [...s.mosaics, m], owned: { ...s.owned, [m.id]: m.ownerKey } }));
  return m;
}

function patchMosaic(id: string, patch: Partial<Mosaic>) {
  update((s) => ({ ...s, mosaics: s.mosaics.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
}

export function setOpenToArtists(id: string, on: boolean) { patchMosaic(id, { openToArtists: on }); }

export function toggleFavourite(id: string, slot: number): string | null {
  const m = load().mosaics.find((x) => x.id === id);
  if (!m || m.status !== "revealed") return "Favourites open after the reveal.";
  if (m.splitAt) return "The artist pool has already been shared out.";
  const has = m.favourites.includes(slot);
  if (!has && m.favourites.length >= mosaicConfig.pool.favouritesMax) return `You can favourite up to ${mosaicConfig.pool.favouritesMax} tiles.`;
  patchMosaic(id, { favourites: has ? m.favourites.filter((x) => x !== slot) : [...m.favourites, slot] });
  return null;
}

/** Reveals when every slot is approved. */
export function reveal(id: string): string | null {
  const s = load();
  const m = s.mosaics.find((x) => x.id === id);
  if (!m) return "Not found";
  if (!progress(s, m).complete) return "Some slots are still empty or in review.";
  patchMosaic(id, { status: "revealed", revealedAt: new Date().toISOString() });
  return null;
}

/* ---------- writes: contributors ---------- */

export function claimSlot(mosaicId: string, slot: number, source: Claim["source"]): boolean {
  const s = load();
  const m = allMosaics(s).find((x) => x.id === mosaicId);
  if (!m || m.status !== "collecting" || !isSlotOpen(s, m, slot, s.me)) return false;
  update((x) => ({ ...x, claims: [...x.claims.filter((c) => !(c.mosaicId === mosaicId && c.contributorId === x.me)), { mosaicId, slot, contributorId: x.me, source, at: new Date().toISOString() }] }));
  return true;
}

/** A free slot for a new contributor, picked at random so the picture fills evenly. */
export function nextOpenSlot(mosaicId: string): number {
  const s = load();
  const m = allMosaics(s).find((x) => x.id === mosaicId);
  if (!m) return -1;
  const open: number[] = [];
  for (let i = 0; i < m.cols * m.rows; i++) if (isSlotOpen(s, m, i, s.me)) open.push(i);
  return open.length ? open[Math.floor(Math.random() * open.length)] : -1;
}

export function myClaim(s: MosaicState, mosaicId: string): Claim | undefined {
  return activeClaims(s, mosaicId).find((c) => c.contributorId === s.me);
}

export function releaseClaim(mosaicId: string) {
  update((x) => ({ ...x, claims: x.claims.filter((c) => !(c.mosaicId === mosaicId && c.contributorId === x.me)) }));
}

export function submitMosaicTile(tile: Omit<MosaicTile, "id" | "contributorId" | "status" | "rejectionReason" | "createdAt" | "reviewedAt">): MosaicTile {
  const s = load();
  const t: MosaicTile = { ...tile, id: rid("t"), contributorId: s.me, status: "pending", rejectionReason: null, createdAt: new Date().toISOString(), reviewedAt: null };
  update((x) => ({
    ...x,
    tiles: [...x.tiles, t],
    claims: x.claims.filter((c) => !(c.mosaicId === t.mosaicId && c.contributorId === x.me)),
    submissions: { ...x.submissions, [x.me]: [...(x.submissions[x.me] ?? []).filter((ts) => Date.now() - ts < 3600_000), Date.now()] },
  }));
  return t;
}

export function saveArtist(p: Omit<ArtistProfile, "id" | "joinedAt"> & Partial<Pick<ArtistProfile, "joinedAt">>) {
  update((x) => ({ ...x, artist: { ...p, id: x.me, joinedAt: p.joinedAt ?? x.artist?.joinedAt ?? new Date().toISOString() } }));
}

/* ---------- writes: admin ---------- */

export function reviewTile(id: string, ok: boolean, reason: string | null = null) {
  update((x) => ({ ...x, tiles: x.tiles.map((t) => (t.id === id ? { ...t, status: ok ? "approved" : "rejected", rejectionReason: ok ? null : reason, reviewedAt: new Date().toISOString() } : t)) }));
}

/**
 * Fills every empty slot with generated art, clearly labelled "Studio fill".
 * Pending tiles keep their slot. Returns how many slots were filled.
 */
export function studioFill(mosaicId: string): number {
  const s = load();
  const m = s.mosaics.find((x) => x.id === mosaicId);
  if (!m || m.status !== "collecting") return 0;
  const map = slotMapFor(s, m.id);
  const already = m.studioSlots ? decodeSlots(m.studioSlots, m.cols * m.rows) : [];
  const fill: number[] = [];
  for (let i = 0; i < m.cols * m.rows; i++) if (!map.has(i)) fill.push(i);
  if (!fill.length) return 0;
  const studioSlots = encodeSlots([...already, ...fill], m.cols * m.rows);
  update((x) => ({ ...x, mosaics: x.mosaics.map((y) => (y.id === mosaicId ? { ...y, studioSlots, studioAt: new Date().toISOString() } : y)), claims: x.claims.filter((c) => c.mosaicId !== mosaicId) }));
  return fill.length;
}

/** Days until the reveal (negative once it has passed). */
export function daysToReveal(m: Mosaic, now = Date.now()): number {
  return (Date.parse(m.revealAt) - now) / DAY;
}

/**
 * Shares the artist pool once the favourites window has closed. Creates one pending "share"
 * entry per artist and logs anything left to Tessera revenue. Runs once per mosaic.
 */
export function runSplit(mosaicId: string, now = new Date()): { artists: number; toRevenueCents: number } | null {
  const s = load();
  const m = s.mosaics.find((x) => x.id === mosaicId);
  if (!m || m.status !== "revealed" || m.splitAt || !m.revealedAt) return null;
  const approved = tilesFor(s, m.id).filter((t) => t.status === "approved" && t.source === "artist");
  const byArtist = new Map<string, { tiles: number; favourites: number }>();
  for (const t of approved) {
    const e = byArtist.get(t.contributorId) ?? { tiles: 0, favourites: 0 };
    e.tiles++;
    if (m.favourites.includes(t.slot)) e.favourites++;
    byArtist.set(t.contributorId, e);
  }
  const split = splitPool(m.poolCents, [...byArtist].map(([artistId, v]) => ({ artistId, ...v })), { cap: capFor(m), favouriteMultiplier: mosaicConfig.pool.favouriteMultiplier });
  const releaseAt = new Date(Date.parse(m.revealedAt) + mosaicConfig.pool.holdDays * DAY).toISOString();
  const entries: LedgerEntry[] = split.allocations.filter((a) => a.amountCents > 0).map((a) => ({
    id: entryId("sh"), artistId: a.artistId, mosaicId: m.id, kind: "share", amountCents: a.amountCents, at: now.toISOString(), releaseAt,
    tiles: a.tilesCounted, favourites: a.favouritesCounted, weight: a.weight, note: `${a.tilesCounted} tile${a.tilesCounted === 1 ? "" : "s"}${a.favouritesCounted ? ` + ${a.favouritesCounted} favourite${a.favouritesCounted === 1 ? "" : "s"}` : ""}`,
  }));
  const rev: RevenueEntry[] = split.toRevenueCents > 0 ? [{ id: rid("rv"), mosaicId: m.id, cents: split.toRevenueCents, reason: split.allocations.length ? "Rounding leftover from the artist pool" : "No public artists: pool returned", at: now.toISOString() }] : [];
  update((x) => ({ ...x, ledger: [...x.ledger, ...entries], revenue: [...x.revenue, ...rev], mosaics: x.mosaics.map((mm) => (mm.id === m.id ? { ...mm, splitAt: now.toISOString() } : mm)) }));
  return { artists: entries.length, toRevenueCents: split.toRevenueCents };
}

/** Removes an approved tile (after a report). If the pool was already shared, that tile's part is reversed. */
export function removeTile(tileId: string, note: string): string | null {
  const s = load();
  const t = s.tiles.find((x) => x.id === tileId);
  if (!t) return "Tile not found";
  let reversal: LedgerEntry | null = null;
  const m = s.mosaics.find((x) => x.id === t.mosaicId);
  if (m?.splitAt && t.source === "artist") {
    const share = s.ledger.find((e) => e.kind === "share" && e.mosaicId === m.id && e.artistId === t.contributorId);
    const weight = m.favourites.includes(t.slot) ? mosaicConfig.pool.favouriteMultiplier : 1;
    if (share) reversal = reverseTile(s.ledger, share.id, weight, new Date(), note);
  }
  update((x) => ({ ...x, tiles: x.tiles.map((y) => (y.id === tileId ? { ...y, status: "removed", rejectionReason: note } : y)), ledger: reversal ? [...x.ledger, reversal] : x.ledger }));
  return null;
}

export function appendLedger(entries: LedgerEntry[]) {
  if (entries.length) update((x) => ({ ...x, ledger: [...x.ledger, ...entries] }));
}

/** Housekeeping on every visit: share pools whose favourites window closed, release finished holds. */
export function tick(now = new Date()) {
  for (const m of load().mosaics) {
    if (m.status !== "collecting") continue;
    // Close to the date: finish the empty slots so the reveal never slips.
    if (daysToReveal(m, now.getTime()) <= mosaicConfig.studioFillDaysBefore) studioFill(m.id);
    // On the date, reveal if every tile has been reviewed.
    if (now.getTime() >= Date.parse(m.revealAt)) reveal(m.id);
  }
  const s = load();
  for (const m of s.mosaics) {
    if (m.status === "revealed" && !m.splitAt && m.revealedAt && now.getTime() - Date.parse(m.revealedAt) >= mosaicConfig.pool.favouritesWindowDays * DAY) runSplit(m.id, now);
  }
  appendLedger(releaseDue(load().ledger, now));
}

export function resetMosaics() {
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
  state = null;
  save(load());
}
