"use client";
import Link from "next/link";
import { durationLabel } from "@/lib/mosaic/paint/effort";
import { useMemo, useState } from "react";
import { artistCap as cap, mosaicConfig, tileCount } from "@/config/mosaic";
import { authConfigured, isAdminEmail, useSession } from "@/lib/auth";
import { balances, formatCents, openRequests, releaseDue, settleRequest } from "@/lib/mosaic/ledger";
import { payoutProvider } from "@/lib/mosaic/payouts";
import { allMosaics, appendLedger, artistTileCount, capFor, progress, removeTile, resetMosaics, reviewTile, runSplit, slotMap, studioFill, tilesFor, useMosaicState } from "@/lib/mosaic/store";
import { TILE_REJECTION_REASONS, type MosaicTile } from "@/lib/mosaic/types";
import { Mark, Toast, useToast } from "../ui";
import { Swatch, dateLabel, useHousekeeping } from "./common";

type Tab = "review" | "mosaics" | "payouts" | "settings";

export function MosaicAdmin() {
  useHousekeeping();
  const { session, ready } = useSession();
  const [tab, setTab] = useState<Tab>("review");
  const s = useMosaicState();
  const [toast, notify] = useToast();
  const queue = useMemo(() => s.tiles.filter((t) => t.status === "pending").sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)), [s]);
  const requests = openRequests(s.ledger);

  if (authConfigured && ready && (!session || !isAdminEmail(session.user.email))) return (
    <div className="flow"><main className="flow__main"><h1>Admin sign-in</h1><p className="muted">Sign in on the main admin page, then come back here.</p><Link className="btn btn--primary" href="/admin">Go to sign-in</Link></main></div>
  );

  return (
    <div className="admin">
      <nav className="admin__nav" aria-label="Admin">
        <Link href="/" className="wordmark" style={{ marginBottom: 20 }}><Mark size={18} /><span style={{ fontSize: 19 }}>TESSERA</span></Link>
        <span className="eyebrow" style={{ padding: "0 12px 8px" }}>Mosaics admin</span>
        {([["review", `Tile review`, queue.length], ["mosaics", "Mosaics", null], ["payouts", "Payouts", requests.length], ["settings", "Settings", null]] as const).map(([id, label, n]) => (
          <button key={id} aria-current={tab === id} onClick={() => setTab(id)}>{label}{n ? <span className="tag">{n}</span> : null}</button>
        ))}
        <Link className="small" style={{ padding: "16px 12px 0" }} href="/admin">Season wall admin</Link>
      </nav>
      <main className="admin__main">
        {!authConfigured && <p className="banner">Sign-in is off until Supabase is connected (see docs/admin-signin.md). Everything here only changes this browser.</p>}
        {tab === "review" && <Review queue={queue} notify={notify} />}
        {tab === "mosaics" && <Mosaics notify={notify} />}
        {tab === "payouts" && <Payouts notify={notify} />}
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
            {t.imageUrl && <img src={t.imageUrl} alt={`Submitted tile for slot ${t.slot + 1}`} />}
            <div className="qrow__body">
              <span className="eyebrow">{m.title} · slot {t.slot + 1}</span>
              <span className="serif" style={{ fontSize: 22 }}>{t.name ?? "Anonymous"}</span>
              <span className="small muted row" style={{ gap: 8 }}><Swatch hex={slot.hex} /> Slot colour {slot.hex.toUpperCase()} · {t.source === "artist" ? `Tessera artist, ${artistTileCount(s, m.id, t.contributorId)} of ${capFor(m)} tiles` : "Customer’s circle"} · {t.medium}</span>
              <div className="tags">{checks.map(([ok, label]) => <span key={label} className={`tag${ok ? "" : " tag--warn"}`}>{label}</span>)}{t.flags.filter((f) => !/AI|generation|Credentials|Colour match|little painting/i.test(f)).map((f) => <span key={f} className="tag tag--warn">{f}</span>)}</div>
              <label className="small muted" htmlFor={`r-${t.id}`}>If rejecting, why</label>
              <select id={`r-${t.id}`} className="input" style={{ padding: "8px 10px", fontSize: 14 }} value={r} onChange={(e) => setReason({ ...reason, [t.id]: e.target.value })}>{TILE_REJECTION_REASONS.map((x) => <option key={x}>{x}</option>)}</select>
            </div>
            <div className="qrow__acts">
              <button className="btn btn--primary" onClick={() => { reviewTile(t.id, true); notify("Accepted and placed"); }}>Accept</button>
              <button className="btn" onClick={() => { reviewTile(t.id, false, r); notify("Rejected. The slot reopens."); }}>Reject</button>
            </div>
          </article>
        );
      })}
      <p className="small faint">Contributors don’t pay, so there’s nothing to refund. Old $1 season tiles are still refunded from the season wall admin.</p>
    </>
  );
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
            <span className="small muted">{tileCount(m)} tiles · circle {p.circle} · artists {p.artist} · studio {p.studio} · review {p.review} · open {p.open} · pool {formatCents(m.poolCents)} · cap {cap(tileCount(m))}/artist · {formatCents(m.priceCents)}{m.payment.mock ? " (test)" : ""}</span>
            <div className="row">
              <Link className="btn" href={`/mosaic?id=${m.id}`}>Open</Link>
              {m.status === "collecting" && <button className="btn" onClick={() => notify(`${studioFill(m.id)} slots got studio fill`)}>Studio fill now</button>}
              {m.status === "revealed" && !m.splitAt && <button className="btn" onClick={() => { const r = runSplit(m.id); notify(r ? `Pool shared with ${r.artists} artist${r.artists === 1 ? "" : "s"}, ${formatCents(r.toRevenueCents)} to revenue` : "Nothing to split"); }}>Share the pool now</button>}
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
                  notify(removeTile(t.id, "Removed after a report") ?? "Removed");
                }}>Remove</button>
              </div>
            )}
          </article>
        );
      })}
      <div className="row" style={{ marginTop: 20 }}>
        <button className="btn" onClick={() => { const r = releaseDue(s.ledger, new Date()); appendLedger(r); notify(`${r.length} hold${r.length === 1 ? "" : "s"} released`); }}>Release finished holds</button>
        <button className="btn btn--quiet" onClick={() => { if (window.confirm("Delete every mosaic, tile and ledger entry in this browser?")) { resetMosaics(); notify("Reset"); } }}>Reset mosaics prototype</button>
      </div>
      {s.revenue.length > 0 && <p className="small faint">To Tessera revenue from pools: {formatCents(s.revenue.reduce((t, r) => t + r.cents, 0))}</p>}
    </>
  );
}

function Payouts({ notify }: { notify: (m: string) => void }) {
  const s = useMosaicState();
  const provider = payoutProvider();
  const reqs = openRequests(s.ledger);
  const done = s.ledger.filter((e) => e.kind === "paid" || e.kind === "returned").slice(-20).reverse();
  async function decide(id: string, ok: boolean) {
    const req = s.ledger.find((e) => e.id === id);
    if (!req) return;
    if (ok) {
      const res = await provider.send({ requestId: id, artistId: req.artistId, amountCents: req.amountCents, currency: "usd", method: s.artist?.id === req.artistId ? s.artist.payoutMethod : "unset" });
      if (!res.ok) { notify(res.message); return; }
      const e = settleRequest(s.ledger, id, "paid", new Date(), `${provider.name}: ${res.reference}`);
      if (e) appendLedger([e]);
      notify(res.message);
    } else {
      const e = settleRequest(s.ledger, id, "returned", new Date(), "Rejected by admin");
      if (e) appendLedger([e]);
      notify("Rejected. The balance is back in the artist’s available funds.");
    }
  }
  const name = (artistId: string) => (s.artist?.id === artistId ? s.artist.name : artistId);
  return (
    <>
      <div className="split"><h1 style={{ fontSize: 34 }}>Payout requests</h1><span className="tag tag--warn">{provider.name}{provider.live ? "" : " · no money moves"}</span></div>
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
