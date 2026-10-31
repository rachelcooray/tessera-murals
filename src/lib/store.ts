"use client";
/**
 * Phase 1 mock backend. Everything a visitor or the admin changes lives in this
 * browser's localStorage, layered over the seed data. Phase 2 replaces this file
 * with Supabase calls behind the same functions.
 */
import { useMemo, useSyncExternalStore } from "react";
import { DEFAULT_PRICES } from "./pricing";
import { N, SEASONS, sampleTile, seedData } from "./seed";
import type { Origin, Prices, Report, Season, Tile, TileStatus } from "./types";

interface Decision { status?: TileStatus; reason?: string | null; origin?: Origin; approvedAt?: string | null }

export interface LocalState {
  v: 1;
  submissions: Tile[];
  decisions: Record<string, Decision>;
  reports: Report[];
  reportStatus: Record<string, Report["status"]>;
  prices: Prices;
  credits: number;
  autoApprove: boolean;
  frozen: Record<string, string>;
  celebrated: string[];
  ambientMuted: boolean;
}

const KEY = "tessera:v1";
const DEFAULT: LocalState = {
  v: 1, submissions: [], decisions: {}, reports: [], reportStatus: {},
  prices: DEFAULT_PRICES,
  credits: 0, autoApprove: false, frozen: {}, celebrated: [], ambientMuted: false,
};

let state: LocalState | null = null;
const listeners = new Set<() => void>();

function load(): LocalState {
  if (state) return state;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    state = raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<LocalState>) } : DEFAULT;
    // Older saved prices used a different shape.
    if (!Array.isArray((state.prices as { tiers?: unknown }).tiers)) state = { ...state, prices: DEFAULT_PRICES };
    // Drop any voice clip that isn't a real recording (older sample data).
    const real = (v: unknown) => (v && (v as { kind?: string }).kind === "data" ? (v as Tile["voice"]) : null);
    state = { ...state, submissions: state.submissions.map((t) => ({ ...t, voice: real(t.voice), gift: t.gift ? { ...t.gift, note: real(t.gift.note) } : null })) };
  } catch {
    state = DEFAULT;
  }
  return state;
}

function save(next: LocalState) {
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: keep working in memory for this visit.
  }
  listeners.forEach((l) => l());
}

function update(fn: (s: LocalState) => LocalState) {
  save(fn(load()));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) { state = null; cb(); }
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage); };
}

export function useLocalState(): LocalState {
  return useSyncExternalStore(subscribe, load, () => DEFAULT);
}

/* ---------- derived reads ---------- */

export function allTiles(s: LocalState): Tile[] {
  const seed = seedData().tiles.map((t) => {
    const d = s.decisions[t.id];
    return d ? { ...t, ...("status" in d ? { status: d.status! } : {}), ...(d.origin ? { origin: d.origin } : {}), rejectionReason: d.reason ?? t.rejectionReason, approvedAt: d.approvedAt ?? t.approvedAt } : t;
  });
  return [...seed, ...s.submissions];
}

export function seasonsWithState(s: LocalState): Season[] {
  const out = SEASONS.map((season) => (s.frozen[season.id] ? { ...season, status: "frozen" as const, frozenAt: s.frozen[season.id] } : season));
  // The first upcoming season after the last frozen one opens automatically.
  if (!out.some((x) => x.status === "open")) {
    const next = out.find((x) => x.status === "upcoming");
    if (next) next.status = "open";
  }
  return out;
}

export function useSeasons(): Season[] {
  const s = useLocalState();
  return useMemo(() => seasonsWithState(s), [s]);
}

export function useCurrentSeason(): Season {
  const seasons = useSeasons();
  return seasons.find((x) => x.status === "open") ?? seasons[seasons.length - 1];
}

/** Tiles on the wall for a season: approved and pending (pending show as reserved). */
export function useSeasonTiles(seasonId: string): Tile[] {
  const s = useLocalState();
  return useMemo(() => allTiles(s).filter((t) => t.seasonId === seasonId && (t.status === "approved" || t.status === "pending")), [s, seasonId]);
}

export function useAllTiles(): Tile[] {
  const s = useLocalState();
  return useMemo(() => allTiles(s), [s]);
}

export function useTile(id: string): Tile | undefined {
  const tiles = useAllTiles();
  return tiles.find((t) => t.id === id);
}

export function useReports(): Report[] {
  const s = useLocalState();
  return useMemo(() => [...seedData().reports, ...s.reports].map((r) => ({ ...r, status: s.reportStatus[r.id] ?? r.status })), [s]);
}

/* ---------- writes ---------- */

function setTile(id: string, patch: Partial<Tile>) {
  update((s) => {
    if (s.submissions.some((t) => t.id === id)) {
      return { ...s, submissions: s.submissions.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
    }
    const prev = s.decisions[id] ?? {};
    const d: Decision = { ...prev };
    if (patch.status) d.status = patch.status;
    if (patch.origin) d.origin = patch.origin;
    if ("rejectionReason" in patch) d.reason = patch.rejectionReason ?? null;
    if ("approvedAt" in patch) d.approvedAt = patch.approvedAt ?? null;
    return { ...s, decisions: { ...s.decisions, [id]: d } };
  });
  maybeFreeze();
}

function maybeFreeze() {
  const s = load();
  const tiles = allTiles(s);
  for (const season of seasonsWithState(s)) {
    if (season.status !== "open") continue;
    const approved = tiles.filter((t) => t.seasonId === season.id && t.status === "approved").length;
    if (approved >= season.gridSize * season.gridSize) {
      update((x) => ({ ...x, frozen: { ...x.frozen, [season.id]: new Date().toISOString() } }));
    }
  }
}

export function submitTile(tile: Tile) {
  const s = load();
  const clean = tile.flags.length === 0;
  const status: TileStatus = s.autoApprove && clean ? "approved" : "pending";
  update((x) => ({ ...x, submissions: [...x.submissions, { ...tile, status, approvedAt: status === "approved" ? new Date().toISOString() : null }] }));
  if (status === "approved") maybeFreeze();
  return status;
}

export function approveTile(id: string) {
  setTile(id, { status: "approved", approvedAt: new Date().toISOString(), rejectionReason: null });
}

export function rejectTile(id: string, reason: string) {
  setTile(id, { status: "rejected", rejectionReason: reason });
}

export function hideTile(id: string) {
  setTile(id, { status: "hidden" });
}

export function setOrigin(id: string, origin: Origin) {
  setTile(id, { origin });
}

export function addReport(tileId: string, reason: string, note: string) {
  const r: Report = { id: `r-${Date.now().toString(36)}`, tileId, reason, note, status: "open", createdAt: new Date().toISOString() };
  update((s) => ({ ...s, reports: [...s.reports, r] }));
}

export function setReportStatus(id: string, status: Report["status"]) {
  update((s) => ({ ...s, reportStatus: { ...s.reportStatus, [id]: status } }));
}

export function setPrices(prices: Prices) {
  update((s) => ({ ...s, prices }));
}

export function setAutoApprove(on: boolean) {
  update((s) => ({ ...s, autoApprove: on }));
}

export function addCredits(n: number) {
  update((s) => ({ ...s, credits: Math.max(0, s.credits + n) }));
}

export function setAmbientMuted(m: boolean) {
  update((s) => ({ ...s, ambientMuted: m }));
}

export function markCelebrated(seasonId: string) {
  update((s) => ({ ...s, celebrated: [...new Set([...s.celebrated, seasonId])] }));
}

/** Demo only: approve everything pending and fill empty cells with sample tiles, which freezes the season. */
export function fillSeasonForDemo(seasonId: string) {
  const s = load();
  const tiles = allTiles(s).filter((t) => t.seasonId === seasonId);
  const now = new Date().toISOString();
  // Demo tiles are backdated so only genuinely new approvals glow on the wall.
  const earlier = new Date(Date.now() - 3600000).toISOString();
  const taken = new Set(tiles.filter((t) => t.status === "approved" || t.status === "pending").map((t) => t.y * N + t.x));
  const extra: Tile[] = [];
  for (let i = 0; i < N * N; i++) {
    if (taken.has(i)) continue;
    const t = sampleTile(seasonId, i % N, Math.floor(i / N), 9, seasonId === "2" ? 190 : 0);
    extra.push({ ...t, id: `${seasonId}-demo-${i}`, createdAt: earlier, approvedAt: earlier });
  }
  update((x) => {
    const decisions = { ...x.decisions };
    for (const t of tiles) if (t.status === "pending" && !x.submissions.some((sub) => sub.id === t.id)) decisions[t.id] = { ...decisions[t.id], status: "approved", approvedAt: now };
    const submissions = x.submissions.map((t) => (t.seasonId === seasonId && t.status === "pending" ? { ...t, status: "approved" as const, approvedAt: now } : t));
    return { ...x, decisions, submissions: [...submissions, ...extra] };
  });
  maybeFreeze();
}

export function resetPrototype() {
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
  state = null;
  save({ ...DEFAULT });
}

export function newTileId(seasonId: string): string {
  return `${seasonId}-u${Date.now().toString(36)}`;
}
