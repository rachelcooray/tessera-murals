"use client";
/**
 * Every change a page can make, in one place. Each function works in both modes:
 * demo (this browser is the backend, store.ts) and live (Supabase, remote.ts).
 * Pages read with the store's hooks and write only through here.
 */
import { useCallback, useEffect, useState } from "react";
import { mosaicConfig } from "@/config/mosaic";
import { hexToRgb } from "../colour";
import { requestPayout as ledgerRequest, settleRequest } from "./ledger.ts";
import { payoutProvider } from "./payouts.ts";
import { bestOpenSlot } from "./colours.ts";
import * as R from "./remote";
import * as S from "./store";
import type { ArtistProfile, Mosaic, MosaicTile } from "./types.ts";

export const live = S.remoteMode;

/* ---------- loading (live mode) ---------- */

export interface Loaded<T> { loading: boolean; data: T | null; error: string | null; reload: () => void }

/** Runs a loader once per key in live mode. In demo mode everything is already in the browser, so it does nothing. */
export function useLoad<T>(key: string | null, fn: () => Promise<T>): Loaded<T> {
  const [st, setSt] = useState<{ key: string | null; data: T | null; error: string | null; n: number }>({ key: null, data: null, error: null, n: 0 });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!live || key === null) return;
    let on = true;
    fn().then((data) => { if (on) setSt({ key, data, error: null, n }); }, (e) => { if (on) setSt({ key, data: null, error: R.friendly(e), n }); });
    return () => { on = false; };
    // fn is recreated each render; the key says when to load again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  const loading = live && key !== null && (st.key !== key || st.n !== n);
  return { loading, data: loading ? null : st.data, error: loading ? null : st.error, reload };
}

export const loadMosaic = R.loadMosaic;
export const loadJoin = R.loadJoin;
export const loadMe = R.loadMe;
export const loadMine = R.loadMine;
export const loadAdmin = R.loadAdmin;
export const loadChallenge = R.loadChallenge;
export type { ChallengeCard } from "./remote";
export const loadGallery = R.loadGallery;
export const amAdmin = R.amAdmin;
export const tileImageUrl = R.tileImageUrl;
export const tileImageUrls = R.tileImageUrls;
export const rememberEmail = R.rememberEmail;
export const signInByEmail = R.signInByEmail;

/** A full-size image for a tile: the stored image in live mode, or what's already in the browser. */
export function useTileImage(t: MosaicTile | null | undefined): string | null {
  const path = live ? t?.imagePath ?? null : null;
  const { data } = useLoad(path, () => R.tileImageUrl(path!));
  return path ? data : t?.imageUrl ?? null;
}

/* ---------- orders ---------- */

export interface OrderInput extends Omit<R.OrderInput, "target"> { target: HTMLCanvasElement; targetUrl: string; priceCents: number; cols: number; rows: number; slots: Mosaic["slots"] }

/** Saves the order. Live: unpaid until Stripe confirms, unless the server is in test mode. Demo: created straight away. */
export async function placeOrder(o: OrderInput): Promise<{ mosaicId: string; clientSecret?: string; mock?: boolean }> {
  if (live) return R.createOrder(o);
  const m = S.createMosaic({
    title: o.title, occasion: o.occasion as Mosaic["occasion"], tierId: o.tierId, cols: o.cols, rows: o.rows, priceCents: o.priceCents,
    email: o.email, revealAt: o.revealAt, visibility: o.visibility as Mosaic["visibility"], openToArtists: o.openToArtists,
    target: o.targetUrl, slots: o.slots, payment: { intentId: null, mock: true },
  });
  if (S.lastSaveFailed) throw new Error("This browser’s storage is full, so the mosaic may not be kept. Clear some site data and try again.");
  return { mosaicId: m.id, mock: true };
}

export async function confirmOrder(mosaicId: string): Promise<string> {
  return live ? (await R.confirmOrder(mosaicId)).status : "collecting";
}

/* ---------- guests and artists ---------- */

/** Holds a slot: a given one, the closest colour to hex, or any free one. Returns the slot or a message. */
export async function claim(m: Mosaic, opts: { token: string | null; source: "circle" | "artist"; slot?: number; hex?: string }): Promise<number | string> {
  if (live) return R.claim(m.id, opts);
  let slot = opts.slot ?? -1;
  if (opts.slot === undefined) {
    const s = S.currentState();
    slot = opts.hex ? bestOpenSlot(hexToRgb(opts.hex), m.slots, (i) => S.isSlotOpen(s, m, i, s.me)) : S.nextOpenSlot(m.id);
  }
  if (slot < 0 || !S.claimSlot(m.id, slot, opts.source)) return opts.slot !== undefined ? "That slot was just taken." : "Every slot is taken or in review right now. Try again later.";
  return slot;
}

/** Holds one particular slot (artists, from the colour challenge). Returns the slot or a message. */
export async function claimAt(mosaicId: string, slot: number, source: "circle" | "artist"): Promise<number | string> {
  if (live) return R.claim(mosaicId, { token: null, source, slot });
  return S.claimSlot(mosaicId, slot, source) ? slot : "Someone has just taken that slot.";
}

export async function release(mosaicId: string): Promise<void> {
  if (live) return R.releaseClaim(mosaicId);
  S.releaseClaim(mosaicId);
}

export async function sendTile(tile: Parameters<typeof S.submitMosaicTile>[0], token: string | null): Promise<MosaicTile> {
  if (live) return R.submitTile(tile, token);
  const t = S.submitMosaicTile(tile);
  if (S.lastSaveFailed) throw new Error("This browser’s storage is full, so your tile may not be kept.");
  return t;
}

export async function saveArtistProfile(p: Omit<ArtistProfile, "id" | "joinedAt">): Promise<void> {
  if (live) return R.saveArtist(p);
  S.saveArtist(p);
}

/** Asks for the available balance. Returns null when it worked, or a message. */
export async function askForPayout(acceptedTiles: number): Promise<string | null> {
  if (live) {
    try { await R.requestPayout(); return null; } catch (e) { return R.friendly(e); }
  }
  const s = S.currentState();
  if (!s.artist) return "Set up your artist profile first.";
  const r = ledgerRequest(s.ledger, s.artist.id, mosaicConfig.pool.payoutMinimumCents, new Date(), acceptedTiles, mosaicConfig.pool.firstPayoutTiles);
  if (typeof r === "string") return r;
  S.appendLedger([r]);
  return null;
}

/* ---------- owners ---------- */

export async function setOpenToArtists(id: string, on: boolean): Promise<void> {
  if (live) { await R.ownerAction("set_open_to_artists", { p_id: id, p_on: on }); return; }
  S.setOpenToArtists(id, on);
}

export async function toggleFavourite(id: string, slot: number): Promise<string | null> {
  if (live) return (await R.ownerAction("toggle_favourite", { p_id: id, p_slot: slot })) as string | null;
  return S.toggleFavourite(id, slot);
}

export async function revealNow(id: string): Promise<string | null> {
  if (live) return (await R.ownerAction("reveal_now", { p_id: id })) as string | null;
  return S.reveal(id);
}

export async function studioFillNow(id: string): Promise<number> {
  if (live) return (await R.ownerAction("studio_fill", { p_id: id })) as number;
  return S.studioFill(id);
}

/* ---------- admins ---------- */

export async function review(id: string, ok: boolean, reason: string | null = null): Promise<void> {
  if (live) return R.reviewTile(id, ok, reason);
  S.reviewTile(id, ok, reason);
}

export async function removeTile(id: string, note: string): Promise<string | null> {
  if (live) { await R.removeTile(id, note); return null; }
  return S.removeTile(id, note);
}

/** Approves (records the payment you made) or rejects a payout request. Returns a message to show. */
export async function settlePayout(requestId: string, ok: boolean, reference?: string): Promise<string> {
  if (live) {
    await R.settlePayout(requestId, ok, reference);
    return ok ? "Recorded as paid." : "Rejected. The balance is back in the artist’s available funds.";
  }
  const s = S.currentState();
  const req = s.ledger.find((e) => e.id === requestId);
  if (!req) return "Request not found";
  if (ok) {
    const provider = payoutProvider();
    const res = await provider.send({ requestId, artistId: req.artistId, amountCents: req.amountCents, currency: "usd", method: s.artist?.id === req.artistId ? s.artist.payoutMethod : "unset" });
    if (!res.ok) return res.message;
    const e = settleRequest(s.ledger, requestId, "paid", new Date(), `${provider.name}: ${res.reference}`);
    if (e) S.appendLedger([e]);
    return res.message;
  }
  const e = settleRequest(s.ledger, requestId, "returned", new Date(), "Rejected by admin");
  if (e) S.appendLedger([e]);
  return "Rejected. The balance is back in the artist’s available funds.";
}
