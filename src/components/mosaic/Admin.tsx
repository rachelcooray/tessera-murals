"use client";
import Link from "next/link";
import { durationLabel } from "@/lib/mosaic/paint/effort";
import { useEffect, useMemo, useState } from "react";
import { artistCap as cap, mosaicConfig, tileCount } from "@/config/mosaic";
import { authConfigured, isAdminEmail, useSession } from "@/lib/auth";
import { balances, formatCents, openRequests, releaseDue } from "@/lib/mosaic/ledger";
import { payoutProvider } from "@/lib/mosaic/payouts";
import { amAdmin, live, loadAdmin, loadFoundingList, type ListEntry, removeTile, review, settlePayout, studioFillNow, useLoad, useTileImage } from "@/lib/mosaic/actions";
import { MarketingTab } from "./MarketingTab";
import { allMosaics, appendLedger, artistTileCount, capFor, progress, resetMosaics, runSplit, slotMap, tilesFor, useMosaicState } from "@/lib/mosaic/store";
import { TILE_REJECTION_REASONS, type MosaicTile } from "@/lib/mosaic/types";
import { Mark, Toast, useToast } from "../ui";
import { Swatch, dateLabel, useHousekeeping } from "./common";

type Tab = "review" | "mosaics" | "payouts" | "list" | "marketing" | "settings";

export function MosaicAdmin() {
  useHousekeeping();
  const { session, ready } = useSession();
  const [tab, setTab] = useState<Tab>("review");
  // Live: the database decides who is an admin, and loads everything only for them.
  const data = useLoad(live && ready && session ? `admin:${session.user.id}` : null, async () => (await amAdmin()) ? loadAdmin() : null);
  const s = useMosaicState();
  const [toast, notify] = useToast();
  const queue = useMemo(() => s.tiles.filter((t) => t.status === "pending").sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)), [s]);
  const requests = openRequests(s.ledger);

  if (live && (!ready || data.loading)) return <div className="flow"><main className="flow__main"><p className="muted" role="status">Loading…</p></main></div>;
  if (authConfigured && ready && (!session || (live ? !data.data : !isAdminEmail(session.user.email)))) return (
    <div className="flow"><main className="flow__main"><h1>Admin sign-in</h1><p className="muted">Sign in on the main admin page, then come back here.</p><Link className="btn btn--primary" href="/admin">Go to sign-in</Link></main></div>
  );

  return (
    <div className="admin">
      <nav className="admin__nav" aria-label="Admin">
        <Link href="/" className="wordmark" style={{ marginBottom: 20 }}><Mark size={18} /><span style={{ fontSize: 19 }}>Tessera</span></Link>
        <span className="eyebrow" style={{ padding: "0 12px 8px" }}>Mosaics admin</span>
        {([["review", `Tile review`, queue.length], ["mosaics", "Mosaics", null], ["payouts", "Payouts", requests.length], ["list", "Founding list", null], ["marketing", "Marketing", null], ["settings", "Settings", null]] as const).map(([id, label, n]) => (
          <button key={id} aria-current={tab === id} onClick={() => setTab(id)}>{label}{n ? <span className="tag">{n}</span> : null}</button>
        ))}
        <Link className="small" style={{ padding: "16px 12px 0" }} href="/admin">Season wall admin</Link>
      </nav>
      <main className="admin__main">
        {!authConfigured && <p className="banner">Sign-in is off until Supabase is connected (see docs/admin-signin.md). Everything here only changes this browser.</p>}
        {data.error && <p className="error" role="alert">{data.error} <button className="btn btn--quiet" onClick={data.reload}>Reload</button></p>}
        {tab === "review" && <Review queue={queue} notify={notify} />}
        {tab === "mosaics" && <Mosaics notify={notify} />}
        {tab === "payouts" && <Payouts notify={notify} artists={data.data?.artists ?? {}} />}
        {tab === "list" && <ListTab />}
        {tab === "marketing" && <MarketingTab notify={notify} />}
        {tab === "settings" && <Settings />}
      </main>
      <Toast msg={toast} />
    </div>
  );
}

function Review({ queue, notify }: { queue: MosaicTile[]; notify: (m: string) => void }) {
  const s = useMosaicState();
  const [reason, setReason] = useState<Record<string, string>>({});
  if (!queue.length) return <><h1 style={{ fontSize: 34 }}>Tile review</h1><p className="muted">Nothing waiting. New tiles appear here before they are placed.</p></>;
  return (
    <>
      <div className="split"><h1 style={{ fontSize: 34 }}>Tile review</h1><span className="small muted">{queue.length} waiting</span></div>
      {queue.map((t) => {
        const m = allMosaics(s).find((x) => x.id === t.mosaicId);
        if (!m) return null;
        const slot = m.slots[t.slot];
        const checks: [boolean, string][] = [
          t.painted
            ? [!t.flags.some((f) => /little painting/i.test(f)), `Painted on Tessera: ${t.painted.strokes} strokes, ${durationLabel(t.painted.activeMs)}, ${t.painted.inputs.join(" and ") || "unknown input"}`]
            : [t.flags.every((f) => !/AI|generation|Credentials/i.test(f)), t.flags.some((f) => /AI|generation|Credentials/i.test(f)) ? `AI check: ${t.flags.filter((f) => /AI|generation|Credentials|Midjourney|DALL|Diffusion|Firefly|OpenAI|Google/i.test(f)).join("; ")}` : "AI check: no AI markers in the file"],
          [t.match >= mosaicConfig.minColourMatch, `Colour match ${Math.round(t.match * 100)}%${t.tint ? `, tinted ${Math.round(t.tint * 100)}%` : ""}`],
          [true, "Duplicate check passed at upload"],
        ];
        const r = reason[t.id] ?? TILE_REJECTION_REASONS[0];
        return (
          <article key={t.id} className={`qrow${t.flags.length ? " qrow--late" : ""}`}>
            <ReviewImage tile={t} />
            <div className="qrow__body">
              <span className="eyebrow">{m.title} · slot {t.slot + 1}</span>
              <span className="serif" style={{ fontSize: 22 }}>{t.name ?? "Anonymous"}</span>
              <span className="small muted row" style={{ gap: 8 }}><Swatch hex={slot.hex} /> Slot colour {slot.hex.toUpperCase()} · {t.source === "artist" ? `Tessera artist, ${artistTileCount(s, m.id, t.contributorId)} of ${capFor(m)} tiles` : "Customer’s circle"} · {t.medium}</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- frames recorded by the paint tool */}
              {t.painted?.strip && <img className="qrow__strip" src={t.painted.strip} alt="Timelapse: eight moments while this tile was painted" />}
              <div className="tags">{checks.map(([ok, label]) => <span key={label} className={`tag${ok ? "" : " tag--warn"}`}>{label}</span>)}{t.flags.filter((f) => !/AI|generation|Credentials|Colour match|little painting/i.test(f)).map((f) => <span key={f} className="tag tag--warn">{f}</span>)}</div>
              <label className="small muted" htmlFor={`r-${t.id}`}>If rejecting, why</label>
              <select id={`r-${t.id}`} className="input" style={{ padding: "8px 10px", fontSize: 14 }} value={r} onChange={(e) => setReason({ ...reason, [t.id]: e.target.value })}>{TILE_REJECTION_REASONS.map((x) => <option key={x}>{x}</option>)}</select>
            </div>
            <div className="qrow__acts">
              <button className="btn btn--primary" onClick={() => void review(t.id, true).then(() => notify("Accepted and placed"), (e: Error) => notify(e.message))}>Accept</button>
              <button className="btn" onClick={() => void review(t.id, false, r).then(() => notify("Rejected. The slot reopens."), (e: Error) => notify(e.message))}>Reject</button>
            </div>
          </article>
        );
      })}
      <p className="small faint">Contributors don’t pay, so there’s nothing to refund. Old $1 season tiles are still refunded from the season wall admin.</p>
    </>
  );
}

function ReviewImage({ tile }: { tile: MosaicTile }) {
  const src = useTileImage(tile);
  // eslint-disable-next-line @next/next/no-img-element -- a signed Storage link; the static site has no image optimiser
  return src ? <img src={src} alt={`Submitted tile for slot ${tile.slot + 1}`} /> : <span aria-hidden="true" style={{ width: 120, height: 120, background: tile.averageHex }} />;
}

function Mosaics({ notify }: { notify: (m: string) => void }) {
  const s = useMosaicState();
  const [removeSlot, setRemoveSlot] = useState<Record<string, string>>({});
  const list = s.mosaics;
  return (
    <>
      <h1 style={{ fontSize: 34 }}>Mosaics</h1>
      {list.length === 0 && <p className="muted">No orders yet. <Link href="/start">Create a test mosaic</Link>.</p>}
      {list.map((m) => {
        const p = progress(s, m);
        const map = slotMap(tilesFor(s, m.id));
        return (
          <article key={m.id} className="qrow" style={{ flexDirection: "column" }}>
            <div className="split"><span className="serif" style={{ fontSize: 24 }}>{m.title}</span><span className="small muted">{m.status === "revealed" ? `Revealed ${dateLabel(m.revealedAt!)}` : `Reveal ${dateLabel(m.revealAt)}`} · {m.visibility}</span></div>
            <span className="small muted">{tileCount(m).toLocaleString()} tiles · circle {p.circle.toLocaleString()} · artists {p.artist.toLocaleString()} · studio {p.studio.toLocaleString()} · review {p.review.toLocaleString()} · open {p.open.toLocaleString()} · pool {formatCents(m.poolCents)} · cap {cap(tileCount(m))}/artist · {formatCents(m.priceCents)}{m.payment.mock ? " (test)" : ""}</span>
            <div className="row">
              <Link className="btn" href={`/mosaic?id=${m.id}`}>Open</Link>
              {m.status === "collecting" && <button className="btn" onClick={() => void studioFillNow(m.id).then((n) => notify(`${n.toLocaleString()} slots got studio fill`), (e: Error) => notify(e.message))}>Studio fill now</button>}
              {!live && m.status === "revealed" && !m.splitAt && <button className="btn" onClick={() => { const r = runSplit(m.id); notify(r ? `Pool shared with ${r.artists} artist${r.artists === 1 ? "" : "s"}, ${formatCents(r.toRevenueCents)} to revenue` : "Nothing to split"); }}>Share the pool now</button>}
              {m.splitAt && <span className="tag">Pool shared {dateLabel(m.splitAt)}</span>}
            </div>
            {m.status === "revealed" && (
              <div className="row">
                <label className="small muted" htmlFor={`rm-${m.id}`}>Remove a tile after a report, by slot number</label>
                <input id={`rm-${m.id}`} className="input" style={{ width: 110, padding: "8px 10px" }} inputMode="numeric" value={removeSlot[m.id] ?? ""} onChange={(e) => setRemoveSlot({ ...removeSlot, [m.id]: e.target.value })} />
                <button className="btn" onClick={() => {
                  const t = map.get(Number(removeSlot[m.id]) - 1);
                  if (!t) { notify("No tile in that slot"); return; }
                  if (!window.confirm(`Remove slot ${t.slot + 1} by ${t.name ?? "Anonymous"}? If the pool was shared, their part is reversed.`)) return;
                  void removeTile(t.id, "Removed after a report").then((err) => notify(err ?? (live ? "Removed. Any pool share is reversed on the next hourly run." : "Removed")), (e: Error) => notify(e.message));
                }}>Remove</button>
              </div>
            )}
          </article>
        );
      })}
      {live ? <p className="small faint" style={{ marginTop: 20 }}>Studio fill, reveals, pool shares and releasing holds run automatically every hour on the server.</p> : (
      <div className="row" style={{ marginTop: 20 }}>
        <button className="btn" onClick={() => { const r = releaseDue(s.ledger, new Date()); appendLedger(r); notify(`${r.length} hold${r.length === 1 ? "" : "s"} released`); }}>Release finished holds</button>
        <button className="btn btn--quiet" onClick={() => { if (window.confirm("Delete every mosaic, tile and ledger entry in this browser?")) { resetMosaics(); notify("Reset"); } }}>Reset mosaics prototype</button>
      </div>)}
      {s.revenue.length > 0 && <p className="small faint">To Tessera revenue from pools: {formatCents(s.revenue.reduce((t, r) => t + r.cents, 0))}</p>}
    </>
  );
}

function Payouts({ notify, artists }: { notify: (m: string) => void; artists: Record<string, string> }) {
  const s = useMosaicState();
  const provider = payoutProvider();
  const reqs = openRequests(s.ledger);
  const done = s.ledger.filter((e) => e.kind === "paid" || e.kind === "returned").slice(-20).reverse();
  async function decide(id: string, ok: boolean) {
    const reference = ok && live ? window.prompt("Pay the artist by hand first (bank transfer, PayPal). Then enter its reference here to record it as paid.") : undefined;
    if (ok && live && !reference) return;
    try { notify(await settlePayout(id, ok, reference ?? undefined)); } catch (e) { notify(e instanceof Error ? e.message : "That didn’t work."); }
  }
  const name = (artistId: string) => artists[artistId] ?? (s.artist?.id === artistId ? s.artist.name : artistId);
  return (
    <>
      <div className="split"><h1 style={{ fontSize: 34 }}>Payout requests</h1><span className="tag tag--warn">{live ? "Paid by hand, then recorded here" : `${provider.name}${provider.live ? "" : " · no money moves"}`}</span></div>
      {reqs.length === 0 ? <p className="muted">No requests waiting.</p> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Artist</th><th>Requested</th><th>Amount</th><th>Available now</th><th>Decision</th></tr></thead>
          <tbody>{reqs.map((r) => <tr key={r.id}><td>{name(r.artistId)}</td><td className="muted">{dateLabel(r.at)}</td><td>{formatCents(r.amountCents)}</td><td className="muted">{formatCents(balances(s.ledger, r.artistId).availableCents)}</td>
            <td><div className="row"><button className="btn btn--primary" style={{ minHeight: 40 }} onClick={() => void decide(r.id, true)}>Approve</button><button className="btn" style={{ minHeight: 40 }} onClick={() => void decide(r.id, false)}>Reject</button></div></td></tr>)}</tbody>
        </table></div>
      )}
      {done.length > 0 && <><h2 style={{ fontSize: 24, marginTop: 20 }}>Recent decisions</h2><ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>{done.map((e) => <li key={e.id}>{dateLabel(e.at)} · {name(e.artistId)} · {formatCents(e.amountCents)} · {e.kind === "paid" ? "paid" : "returned"}{e.note ? ` · ${e.note}` : ""}</li>)}</ul></>}
    </>
  );
}

function ListTab() {
  const [list, setList] = useState<ListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let on = true; loadFoundingList().then((l) => { if (on) setList(l); }, (e: Error) => { if (on) setError(e.message); }); return () => { on = false; }; }, []);
  function csv() {
    const esc = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["email", "name", "wants", "occasion", "source", "joined"], ...(list ?? []).map((x) => [x.email, x.name, x.wants, x.occasion, x.source, x.createdAt])];
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `tessera-founding-list-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  if (error) return <p className="error">{error}</p>;
  if (!list) return <p className="muted" role="status">Loading…</p>;
  const n = (w: string) => list.filter((x) => x.wants === w || x.wants === "both").length;
  return (
    <>
      <div className="split"><h1 style={{ fontSize: 34 }}>Founding list</h1><button className="btn" disabled={!list.length} onClick={csv}>Download CSV</button></div>
      <p className="muted">{list.length.toLocaleString()} people · {n("order")} want to order · {n("paint")} want to paint{live ? "" : " · demo mode: only sign-ups in this browser"}</p>
      {list.length === 0 ? <p className="muted">Nobody yet. Share <Link href="/list">the list page</Link>: it’s the link for your bio.</p> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Email</th><th>Name</th><th>Wants</th><th>For</th><th>From</th><th>Joined</th></tr></thead>
          <tbody>{list.map((x) => <tr key={x.email}><td>{x.email}</td><td className="muted">{x.name ?? ""}</td><td>{x.wants}</td><td className="muted">{x.occasion ?? ""}</td><td className="muted">{x.source ?? ""}</td><td className="muted">{dateLabel(x.createdAt)}</td></tr>)}</tbody>
        </table></div>
      )}
    </>
  );
}

function Settings() {
  const c = mosaicConfig;
  const rows: [string, string][] = [
    ["Sizes", c.tiers.map((t) => `${t.name} ${tileCount(t)} tiles ${formatCents(t.priceCents)}`).join(" · ")],
    ["Artist pool", `${c.pool.shareBps / 100}% of the order price`],
    ["Tiles per artist", `${c.pool.capPercent}% of the mosaic, at least ${c.pool.minCap}`],
    ["Favourites", `Up to ${c.pool.favouritesMax}, each counts as ${c.pool.favouriteMultiplier} tiles, ${c.pool.favouritesWindowDays}-day window`],
    ["Hold after reveal", `${c.pool.holdDays} days`],
    ["Minimum payout", formatCents(c.pool.payoutMinimumCents)],
    ["Tint", `Default ${Math.round(c.tint.default * 100)}%, up to ${Math.round(c.tint.max * 100)}%`],
    ["Studio fill", `${c.studioFillDaysBefore} days before the reveal`],
    ["Duplicate check", `Within ${c.moderation.duplicateHammingMax} of 64 bits, same contributor`],
    ["Rate limit", `${c.moderation.submissionsPerHour} tiles per hour per contributor`],
    ["Human-made only", c.humanMadeOnly ? "Yes" : "No"],
    ["Voice clips", c.features.voiceClips ? "On" : "Off (code kept for private boards)"],
  ];
  return (
    <>
      <h1 style={{ fontSize: 34 }}>Settings</h1>
      <p className="small muted">Read-only here. Change them in src/config/mosaic.ts.</p>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        {rows.map(([k, v]) => <div key={k} className="box" style={{ gap: 4 }}><dt className="eyebrow" style={{ color: "var(--muted)" }}>{k}</dt><dd style={{ margin: 0 }}>{v}</dd></div>)}
      </dl>
    </>
  );
}
