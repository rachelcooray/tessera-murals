/**
 * Append-only earnings ledger. Nothing is ever edited: every change is a new entry that moves cents
 * between an artist's buckets. Balances are the sum of the entries.
 *
 *   share     pool share at the split            pending   +x
 *   release   hold period ended                  pending   −x, available +x
 *   reversal  tile removed after the split       pending or available −x
 *   request   artist asked for a payout          available −x, requested +x
 *   paid      admin approved, provider sent it   requested −x, paid +x
 *   returned  admin rejected the request         requested −x, available +x
 */

export type EntryKind = "share" | "release" | "reversal" | "request" | "paid" | "returned";

export interface LedgerEntry {
  id: string;
  artistId: string;
  mosaicId: string | null;
  kind: EntryKind;
  /** Always a positive number of cents; the kind decides the direction. */
  amountCents: number;
  at: string;
  /** share: when it becomes available. */
  releaseAt?: string;
  /** share: tiles and favourites counted, and the weight used, so a single tile can be reversed later. */
  tiles?: number;
  favourites?: number;
  weight?: number;
  /** release, reversal: the share entry. paid, returned: the request entry. */
  ref?: string;
  note?: string;
}

export interface Balances { pendingCents: number; availableCents: number; requestedCents: number; paidCents: number; lifetimeCents: number }

export function balances(entries: LedgerEntry[], artistId: string): Balances {
  const b: Balances = { pendingCents: 0, availableCents: 0, requestedCents: 0, paidCents: 0, lifetimeCents: 0 };
  const released = releasedShares(entries);
  for (const e of entries) {
    if (e.artistId !== artistId) continue;
    const x = e.amountCents;
    switch (e.kind) {
      case "share": b.pendingCents += x; b.lifetimeCents += x; break;
      case "release": b.pendingCents -= x; b.availableCents += x; break;
      case "reversal":
        if (e.ref && released.has(e.ref) && Date.parse(released.get(e.ref)!) <= Date.parse(e.at)) b.availableCents -= x;
        else b.pendingCents -= x;
        b.lifetimeCents -= x;
        break;
      case "request": b.availableCents -= x; b.requestedCents += x; break;
      case "paid": b.requestedCents -= x; b.paidCents += x; break;
      case "returned": b.requestedCents -= x; b.availableCents += x; break;
    }
  }
  return b;
}

function releasedShares(entries: LedgerEntry[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of entries) if (e.kind === "release" && e.ref) m.set(e.ref, e.at);
  return m;
}

let counter = 0;
export function entryId(prefix = "le"): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

/** New "release" entries for every share whose hold has ended and that has not been released yet. */
export function releaseDue(entries: LedgerEntry[], now: Date): LedgerEntry[] {
  const released = releasedShares(entries);
  const out: LedgerEntry[] = [];
  for (const s of entries) {
    if (s.kind !== "share" || released.has(s.id) || !s.releaseAt || Date.parse(s.releaseAt) > now.getTime()) continue;
    const reversed = entries.filter((e) => e.kind === "reversal" && e.ref === s.id).reduce((t, e) => t + e.amountCents, 0);
    const amount = Math.max(0, s.amountCents - reversed);
    out.push({ id: entryId(), artistId: s.artistId, mosaicId: s.mosaicId, kind: "release", amountCents: amount, at: now.toISOString(), ref: s.id, note: "Hold ended" });
  }
  return out;
}

/**
 * Reverses one removed tile's part of a share: share × tileWeight ÷ share weight, rounded down,
 * and never more than is left of the share.
 */
export function reverseTile(entries: LedgerEntry[], shareId: string, tileWeight: number, now: Date, note: string): LedgerEntry | null {
  const share = entries.find((e) => e.id === shareId && e.kind === "share");
  if (!share || !share.weight) return null;
  const already = entries.filter((e) => e.kind === "reversal" && e.ref === shareId).reduce((t, e) => t + e.amountCents, 0);
  const amount = Math.min(share.amountCents - already, Math.floor((share.amountCents * tileWeight) / share.weight));
  if (amount <= 0) return null;
  return { id: entryId(), artistId: share.artistId, mosaicId: share.mosaicId, kind: "reversal", amountCents: amount, at: now.toISOString(), ref: shareId, note };
}

/** A payout request for the whole available balance, or an error message. */
export function requestPayout(entries: LedgerEntry[], artistId: string, minimumCents: number, now: Date): LedgerEntry | string {
  const { availableCents, requestedCents } = balances(entries, artistId);
  if (requestedCents > 0) return "You already have a payout request waiting.";
  if (availableCents < minimumCents) return `You can request a payout from ${formatCents(minimumCents)}.`;
  return { id: entryId("pr"), artistId, mosaicId: null, kind: "request", amountCents: availableCents, at: now.toISOString() };
}

/** Settles a request: "paid" after the provider sends it, or "returned" to the available balance. */
export function settleRequest(entries: LedgerEntry[], requestId: string, outcome: "paid" | "returned", now: Date, note?: string): LedgerEntry | null {
  const req = entries.find((e) => e.id === requestId && e.kind === "request");
  if (!req || entries.some((e) => (e.kind === "paid" || e.kind === "returned") && e.ref === requestId)) return null;
  return { id: entryId(), artistId: req.artistId, mosaicId: null, kind: outcome, amountCents: req.amountCents, at: now.toISOString(), ref: requestId, note };
}

export function openRequests(entries: LedgerEntry[]): LedgerEntry[] {
  const settled = new Set(entries.filter((e) => e.kind === "paid" || e.kind === "returned").map((e) => e.ref));
  return entries.filter((e) => e.kind === "request" && !settled.has(e.id));
}

export function formatCents(c: number): string {
  const sign = c < 0 ? "−" : "";
  return `${sign}$${(Math.abs(c) / 100).toFixed(2)}`;
}
