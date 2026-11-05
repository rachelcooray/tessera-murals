/**
 * Everything that moves money or runs on a clock.
 *
 *   POST /tick            (cron secret) hourly housekeeping:
 *                           - studio fill for mosaics close to their date
 *                           - reveal mosaics whose date has come
 *                           - share the artist pool once the favourites window closes
 *                           - reverse the share of tiles removed after a split
 *                           - release earnings whose hold has ended
 *                           - cancel orders never paid
 *   POST /request-payout  (artist) asks to be paid the available balance
 *   POST /settle-payout   (admin) approves or rejects a request
 *
 * The maths is the tested code in _shared (pool.ts, ledger.ts); this file only reads and writes rows.
 */
import { POOL_RULES, artistCapFor } from "../_shared/tiers.ts";
import { splitPool } from "../_shared/pool.ts";
import { balances, releaseDue, requestPayout, reverseTile, settleRequest, entryId, type LedgerEntry } from "../_shared/ledger.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export interface MoneyDeps {
  db: Db;
  cronSecret: string;
  allowedOrigins: string[];
  now?: () => Date;
}

const DAY = 86400_000;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

type Row = Record<string, unknown>;

export function fromRow(r: Row): LedgerEntry {
  return {
    id: r.id as string, artistId: r.artist_id as string, mosaicId: (r.mosaic_id as string) ?? null, kind: r.kind as LedgerEntry["kind"],
    amountCents: r.amount_cents as number, at: new Date(r.at as string).toISOString(),
    releaseAt: r.release_at ? new Date(r.release_at as string).toISOString() : undefined,
    tiles: (r.tiles as number) ?? undefined, favourites: (r.favourites as number) ?? undefined, weight: (r.weight as number) ?? undefined,
    ref: (r.ref as string) ?? undefined, note: (r.note as string) ?? undefined,
  };
}

export function toRow(e: LedgerEntry, tileId: string | null = null): Row {
  return {
    id: e.id, artist_id: e.artistId, mosaic_id: e.mosaicId, kind: e.kind, amount_cents: e.amountCents, at: e.at,
    release_at: e.releaseAt ?? null, tiles: e.tiles ?? null, favourites: e.favourites ?? null, weight: e.weight ?? null,
    ref: e.ref ?? null, note: e.note ?? null, tile_id: tileId,
  };
}

export function makeMoneyHandler(deps: MoneyDeps) {
  const now = deps.now ?? (() => new Date());
  const db = deps.db;

  async function must<T>(p: Promise<{ data: T; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    return data;
  }

  async function ledgerFor(artistId?: string): Promise<LedgerEntry[]> {
    let q = db.from("ledger").select("*").order("at");
    if (artistId) q = q.eq("artist_id", artistId);
    return ((await must(q)) as Row[]).map(fromRow);
  }

  async function user(req: Request): Promise<{ id: string; admin: boolean }> {
    const auth = req.headers.get("authorization") ?? "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const { data } = jwt ? await db.auth.getUser(jwt) : { data: null };
    if (!data?.user) throw new HttpError(401, "Please sign in again.");
    const email = (data.user.email ?? "").toLowerCase();
    const anon = Boolean(data.user.is_anonymous);
    const { data: a } = email && !anon ? await db.from("admins").select("email").eq("email", email).maybeSingle() : { data: null };
    return { id: data.user.id, admin: Boolean(a) };
  }

  /** Shares one mosaic's pool. Claims the mosaic first, so two runs can never pay twice. */
  async function split(m: Row, at: Date) {
    const claimed = await must(db.from("mosaics").update({ split_at: at.toISOString() }).eq("id", m.id).is("split_at", null).select("id"));
    if (!(claimed as Row[]).length) return null;
    const tiles = (await must(db.from("tiles").select("contributor_id, slot").eq("mosaic_id", m.id).eq("source", "artist").eq("status", "approved"))) as Row[];
    const favs = new Set((m.favourites as number[]) ?? []);
    const by = new Map<string, { tiles: number; favourites: number }>();
    for (const t of tiles) {
      const e = by.get(t.contributor_id as string) ?? { tiles: 0, favourites: 0 };
      e.tiles++;
      if (favs.has(t.slot as number)) e.favourites++;
      by.set(t.contributor_id as string, e);
    }
    const total = (m.cols as number) * (m.rows as number);
    const res = splitPool(m.pool_cents as number, [...by].map(([artistId, v]) => ({ artistId, ...v })), { cap: artistCapFor(total), favouriteMultiplier: POOL_RULES.favouriteMultiplier });
    const releaseAt = new Date(Date.parse(m.revealed_at as string) + POOL_RULES.holdDays * DAY).toISOString();
    const entries: LedgerEntry[] = res.allocations.filter((a) => a.amountCents > 0).map((a) => ({
      id: entryId("sh"), artistId: a.artistId, mosaicId: m.id as string, kind: "share", amountCents: a.amountCents, at: at.toISOString(), releaseAt,
      tiles: a.tilesCounted, favourites: a.favouritesCounted, weight: a.weight,
      note: `${a.tilesCounted} tile${a.tilesCounted === 1 ? "" : "s"}${a.favouritesCounted ? ` + ${a.favouritesCounted} favourite${a.favouritesCounted === 1 ? "" : "s"}` : ""}`,
    }));
    if (entries.length) await must(db.from("ledger").insert(entries.map((e) => toRow(e))));
    if (res.toRevenueCents > 0) {
      await must(db.from("revenue").insert({ id: entryId("rv"), mosaic_id: m.id, cents: res.toRevenueCents, at: at.toISOString(),
        reason: res.allocations.length ? "Rounding leftover from the artist pool" : "No public artists: pool returned" }));
    }
    return { artists: entries.length, toRevenueCents: res.toRevenueCents };
  }

  async function tick() {
    const at = now();
    const report = { studioFilled: 0, revealed: 0, split: 0, reversed: 0, released: 0, cancelled: 0 };

    const collecting = (await must(db.from("mosaics").select("id, reveal_at").eq("status", "collecting"))) as Row[];
    for (const m of collecting) {
      const due = Date.parse(m.reveal_at as string);
      if (due - at.getTime() <= POOL_RULES.studioFillDaysBefore * DAY) {
        report.studioFilled += (await must(db.rpc("_studio_fill", { p_id: m.id }))) as number;
      }
      if (at.getTime() >= due && (await must(db.rpc("_reveal", { p_id: m.id }))) === null) report.revealed++;
    }

    const toSplit = (await must(db.from("mosaics").select("*").eq("status", "revealed").is("split_at", null)
      .lte("revealed_at", new Date(at.getTime() - POOL_RULES.favouritesWindowDays * DAY).toISOString()))) as Row[];
    for (const m of toSplit) if (await split(m, at)) report.split++;

    // Tiles removed after a split: take back that tile's part of its artist's share, once.
    const removed = (await must(db.from("tiles").select("id, mosaic_id, contributor_id, slot, mosaics!inner(split_at, favourites)")
      .eq("status", "removed").eq("source", "artist").not("mosaics.split_at", "is", null))) as Row[];
    if (removed.length) {
      const ledger = await ledgerFor();
      const done = new Set(((await must(db.from("ledger").select("tile_id").eq("kind", "reversal").not("tile_id", "is", null))) as Row[]).map((r) => r.tile_id));
      for (const t of removed) {
        if (done.has(t.id)) continue;
        const share = ledger.find((e) => e.kind === "share" && e.mosaicId === t.mosaic_id && e.artistId === t.contributor_id);
        if (!share) continue;
        const favs = ((t.mosaics as Row).favourites as number[]) ?? [];
        const weight = favs.includes(t.slot as number) ? POOL_RULES.favouriteMultiplier : 1;
        const rev = reverseTile(ledger, share.id, weight, at, "Tile removed after a report");
        if (rev) { await must(db.from("ledger").insert(toRow(rev, t.id as string))); ledger.push(rev); report.reversed++; }
      }
    }

    const released = releaseDue(await ledgerFor(), at);
    if (released.length) await must(db.from("ledger").insert(released.map((e) => toRow(e))));
    report.released = released.length;

    const stale = (await must(db.from("mosaics").update({ status: "cancelled" }).eq("status", "awaiting_payment")
      .lt("created_at", new Date(at.getTime() - POOL_RULES.unpaidOrderHours * 3600_000).toISOString()).select("id"))) as Row[];
    report.cancelled = stale.length;
    return report;
  }

  async function requestPayoutRoute(req: Request) {
    const u = await user(req);
    const { data: artist } = await db.from("artists").select("id").eq("id", u.id).maybeSingle();
    if (!artist) throw new HttpError(403, "Set up your artist profile first.");
    const { count, error } = await db.from("tiles").select("id", { count: "exact", head: true }).eq("contributor_id", u.id).eq("source", "artist").eq("status", "approved");
    if (error) throw new Error(error.message);
    const r = requestPayout(await ledgerFor(u.id), u.id, POOL_RULES.payoutMinimumCents, now(), count ?? 0, POOL_RULES.firstPayoutTiles);
    if (typeof r === "string") throw new HttpError(400, r);
    await must(db.from("ledger").insert(toRow(r)));
    return { entry: r };
  }

  async function settlePayoutRoute(req: Request) {
    const u = await user(req);
    if (!u.admin) throw new HttpError(403, "Admins only.");
    const b = await req.json().catch(() => ({}));
    const reqRow = (await must(db.from("ledger").select("*").eq("id", String(b.requestId ?? "")).eq("kind", "request").maybeSingle())) as Row | null;
    if (!reqRow) throw new HttpError(404, "Request not found.");
    const ledger = await ledgerFor(reqRow.artist_id as string);
    // No payout provider is connected yet: approving records the payment you make by hand.
    const e = settleRequest(ledger, reqRow.id as string, b.ok ? "paid" : "returned", now(), b.ok ? `Paid by hand${b.reference ? `: ${String(b.reference).slice(0, 80)}` : ""}` : "Rejected by admin");
    if (!e) throw new HttpError(409, "That request is already settled.");
    await must(db.from("ledger").insert(toRow(e)));
    return { entry: e, balances: balances([...ledger, e], reqRow.artist_id as string) };
  }

  function cors(origin: string | null): Record<string, string> {
    const allow = origin && deps.allowedOrigins.includes(origin) ? origin : deps.allowedOrigins[0] ?? "*";
    return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info", "Vary": "Origin" };
  }

  return async function handle(req: Request): Promise<Response> {
    const origin = req.headers.get("origin");
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors(origin) } });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();
    try {
      if (route === "tick") {
        if (!deps.cronSecret || req.headers.get("x-cron-secret") !== deps.cronSecret) return json({ error: "Forbidden" }, 403);
        return json(await tick());
      }
      if (route === "request-payout") return json(await requestPayoutRoute(req));
      if (route === "settle-payout") return json(await settlePayoutRoute(req));
      return json({ error: "Not found" }, 404);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Something went wrong on our side. Please try again." }, 500);
    }
  };
}
