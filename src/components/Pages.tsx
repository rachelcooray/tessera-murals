"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { site } from "@/config/site";
import { addCredits, approveTile, fillSeasonForDemo, hideTile, rejectTile, resetPrototype, setAutoApprove, setOrigin, setPrices, setReportStatus, useAllTiles, useLocalState, useReports, useSeasons, useTile } from "@/lib/store";
import { REJECTION_REASONS, type Tile } from "@/lib/types";
import { MuralExperience } from "./MuralExperience";
import { VoicePlayer } from "./VoicePlayer";
import { Footer, Header, Icon, Mark, OriginLabel, placeLabel, shareTile, tileAlt, tileImage, Toast, useToast } from "./ui";

export function MiniMural({ tiles, n = 20, mark }: { tiles: Tile[]; n?: number; mark?: { x: number; y: number } }) {
  const grid = new Map(tiles.map((t) => [t.y * n + t.x, t]));
  return (
    <div className="mini" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }} aria-hidden="true">
      {Array.from({ length: n * n }, (_, i) => {
        const t = grid.get(i);
        const marked = mark && mark.y * n + mark.x === i;
        return <i key={i} style={{ background: marked ? "var(--ink)" : t?.status === "approved" ? t.palette[0] : "rgba(239,227,204,.04)", boxShadow: marked ? "0 0 0 1px var(--gold)" : undefined }} />;
      })}
    </div>
  );
}

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

/* ---------- /t/[id] ---------- */
export function TileView({ id, gift }: { id: string; gift: boolean }) {
  const tile = useTile(id);
  const all = useAllTiles();
  const mounted = useMounted();
  const [toast, notify] = useToast();
  if (gift && tile?.status === "approved") return <MuralExperience seasonId={tile.seasonId} flyToId={tile.id} gift />;
  return (
    <div className="page">
      <Header />
      <main className="container" style={{ maxWidth: 980 }}>
        {!tile || tile.status === "rejected" || tile.status === "hidden" ? (
          <div className="box" style={{ maxWidth: 520 }}>
            <h1 style={{ fontSize: 34 }}>{mounted ? "This tile isn’t on the wall" : "Finding this tile…"}</h1>
            {mounted && <p className="muted">It may have been removed, or the link is incomplete.</p>}
            <Link className="btn btn--primary" href="/">See the mural</Link>
          </div>
        ) : tile.status === "pending" ? (
          <div className="box" style={{ maxWidth: 520 }}>
            <span className="eyebrow">In review</span>
            <h1 style={{ fontSize: 34 }}>This tile is waiting for review</h1>
            <p className="muted">It will appear here once a person has approved it. {gift ? "The gift link starts working then too." : ""}</p>
            <Link className="btn" href="/admin">Prototype: approve it in Admin</Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 40 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tileImage(tile)} alt={tileAlt(tile)} style={{ flex: "1 1 320px", maxWidth: 480, width: "100%", aspectRatio: "1", objectFit: "cover", boxShadow: "0 40px 80px rgba(0,0,0,.6), 0 0 0 1px var(--line)" }} />
            <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 16 }}>
              <span className="eyebrow">Season {tile.seasonId} · {placeLabel(tile)}</span>
              <h1 style={{ fontSize: 44, lineHeight: 1.05 }}>{tile.displayName ?? "Anonymous"}</h1>
              <OriginLabel origin={tile.origin} />
              {tile.phrase && <p className="card__phrase">“{tile.phrase}”</p>}
              {tile.voice && <VoicePlayer clip={tile.voice} transcript={tile.transcript} />}
              <div style={{ maxWidth: 200 }}><span className="eyebrow" style={{ display: "block", marginBottom: 8 }}>Where it sits</span><MiniMural tiles={all.filter((t) => t.seasonId === tile.seasonId)} mark={tile} /></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                <Link className="btn btn--primary" href={`/?tile=${tile.id}`}>See it on the mural</Link>
                <button className="btn" onClick={() => shareTile(tile, notify)}><Icon name="share" size={14} />Share</button>
                <Link className="btn" href="/add">Add yours</Link>
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
      <Toast msg={toast} />
    </div>
  );
}

/* ---------- /seasons ---------- */
export function SeasonsView() {
  const seasons = useSeasons();
  const tiles = useAllTiles();
  return (
    <div className="page">
      <Header current="/seasons" />
      <main className="container">
        <span className="eyebrow">The gallery</span>
        <h1 style={{ fontSize: "clamp(38px, 6vw, 56px)", margin: "12px 0", maxWidth: 680 }}>Finished walls, kept for good</h1>
        <p className="lede" style={{ maxWidth: 620 }}>When a season fills its 400 tiles it is frozen and hung here. Every tile still opens; every voice still plays.</p>
        <div className="seasons">
          {[...seasons].sort((a, b) => order(a.status) - order(b.status) || b.number - a.number).map((s) => {
            const st = tiles.filter((t) => t.seasonId === s.id);
            const count = st.filter((t) => t.status === "approved").length;
            const href = s.status === "open" ? "/" : s.status === "frozen" ? `/seasons/${s.id}` : null;
            const body = (<>
              <div style={{ opacity: s.status === "upcoming" ? 0.6 : 1 }}><MiniMural tiles={st} n={s.gridSize} /></div>
              <div className="plaque">
                <span className="eyebrow">Season {s.number} · {s.status === "open" ? "Now open" : s.status === "frozen" ? `Frozen ${new Date(s.frozenAt!).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : "Opens when this season fills"}</span>
                <span className="serif" style={{ fontSize: 28 }}>{s.name}</span>
                <span className="small muted">{s.status === "upcoming" ? `Theme: ${s.theme}. Be one of the first.` : `${count} of ${s.gridSize ** 2} tiles · ${s.theme}`}</span>
              </div>
            </>);
            return href ? <Link key={s.id} href={href} className="season-card">{body}</Link> : <div key={s.id} className="season-card">{body}</div>;
          })}
        </div>
      </main>
      <Footer />
    </div>
  );
}
const order = (s: string) => (s === "open" ? 0 : s === "frozen" ? 1 : 2);

/* ---------- /admin ---------- */
type Tab = "queue" | "reports" | "seasons" | "prices";
export function AdminView() {
  const mounted = useMounted();
  const [tab, setTab] = useState<Tab>("queue");
  const tiles = useAllTiles();
  const reports = useReports();
  const local = useLocalState();
  const pending = tiles.filter((t) => t.status === "pending").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const openReports = reports.filter((r) => r.status === "open");
  if (!mounted) return null;
  return (
    <div className="admin">
      <nav className="admin__nav" aria-label="Admin">
        <Link href="/" className="wordmark" style={{ marginBottom: 20 }}><Mark size={18} /><span style={{ fontSize: 19 }}>TESSERA</span></Link>
        {([["queue", "Queue", pending.length], ["reports", "Reports", openReports.length], ["seasons", "Seasons", null], ["prices", "Prices and credits", null]] as const).map(([k, l, c]) => (
          <button key={k} aria-current={tab === k} onClick={() => setTab(k)}><span>{l}</span>{c !== null && <span className="small" style={{ color: "var(--accent)" }}>{c}</span>}</button>
        ))}
        <div className="box" style={{ marginTop: 24, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span className="small">Auto-approve clean tiles</span>
            <button className="switch" role="switch" aria-checked={local.autoApprove} aria-label="Auto-approve clean tiles" onClick={() => setAutoApprove(!local.autoApprove)} />
          </div>
          <span className="small faint">{local.autoApprove ? "Tiles with no flags go straight onto the wall." : "Off. Every tile waits for you."}</span>
        </div>
      </nav>
      <main className="admin__main">
        <p className="banner">Prototype: this page is not protected yet and all changes live only in this browser. Sign-in and a real database arrive in Phase 2.</p>
        {tab === "queue" && <Queue pending={pending} />}
        {tab === "reports" && <Reports />}
        {tab === "seasons" && <SeasonsAdmin />}
        {tab === "prices" && <PricesAdmin />}
      </main>
    </div>
  );
}

function ageDays(iso: string) { return (Date.now() - Date.parse(iso)) / 86400000; }

function Queue({ pending }: { pending: Tile[] }) {
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState<string>(REJECTION_REASONS[0]);
  const late = pending.filter((t) => ageDays(t.createdAt) > site.holdWarningDays).length;
  return (<>
    <div>
      <h1 style={{ fontSize: 36 }}>Moderation queue</h1>
      <p className="small muted">{pending.length} waiting{late ? ` · ${late} pending more than ${site.holdWarningDays} days, card hold expires soon` : ""}</p>
    </div>
    {!pending.length && <p className="muted">Nothing waiting. The wall is quiet.</p>}
    {pending.map((t) => {
      const age = ageDays(t.createdAt), isLate = age > site.holdWarningDays;
      return (
        <article key={t.id} className={`qrow${isLate ? " qrow--late" : t.flags.length ? "" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tileImage(t)} alt={tileAlt(t)} />
          <div className="qrow__body">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <span className="serif" style={{ fontSize: 22 }}>{t.displayName ?? "Anonymous"}{t.gift ? ` · gift for ${t.gift.recipient}` : ""}</span>
              <OriginLabel origin={t.origin} />
            </div>
            <span className="small faint">Season {t.seasonId} · {placeLabel(t)} · {age < 1 ? `${Math.max(1, Math.round(age * 24))} hours ago` : `${Math.floor(age)} days ago`} · {t.payment?.kind === "credit" ? "1 credit" : `$${t.payment?.amount ?? 1} held`}{t.email ? ` · ${t.email}` : ""}</span>
            {t.phrase && <span className="serif italic" style={{ fontSize: 17 }}>“{t.phrase}”</span>}
            {t.prompt && <span className="small muted">Prompt: {t.prompt}</span>}
            {t.transcript && <span className="small muted">Transcript: “{t.transcript}”</span>}
            {t.voice && <VoicePlayer clip={t.voice} />}
            {t.gift?.note && <><span className="small muted">Gift note for {t.gift.recipient}:</span><VoicePlayer clip={t.gift.note} transcript={t.gift.noteTranscript} gift /></>}
            <div className="tags">
              {isLate && <span className="tag tag--bad">Pending {Math.floor(age)} days, hold expires soon</span>}
              {t.flags.map((f) => <span key={f} className="tag tag--warn">{f}</span>)}
              {!t.flags.length && <span className="tag">No flags</span>}
              <span className={`tag${t.contentCredentials ? "" : " tag--warn"}`}>{t.contentCredentials ? `Content Credentials: ${t.contentCredentials}` : "No Content Credentials in file"}</span>
            </div>
            {rejecting === t.id && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                <select className="input" style={{ flex: "1 1 240px" }} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for rejection">
                  {REJECTION_REASONS.map((r) => <option key={r}>{r}</option>)}
                </select>
                <button className="btn" onClick={() => { rejectTile(t.id, reason); setRejecting(null); }}>Reject and release hold</button>
              </div>
            )}
          </div>
          <div className="qrow__acts">
            <button className="btn btn--primary" onClick={() => approveTile(t.id)}>Approve</button>
            <button className="btn" onClick={() => setRejecting(rejecting === t.id ? null : t.id)}>Reject…</button>
            <button className="btn btn--quiet" onClick={() => setOrigin(t.id, t.origin === "hand" ? "ai" : "hand")}>Fix label</button>
          </div>
        </article>
      );
    })}
    <p className="small faint">Approve captures the card hold and lights the tile with a soft glow. Reject releases the hold, frees the spot and emails the reason. Prototype: no money moves and no email is sent yet.</p>
  </>);
}

function Reports() {
  const reports = useReports();
  const tiles = useAllTiles();
  return (<>
    <h1 style={{ fontSize: 36 }}>Reports</h1>
    {reports.map((r) => {
      const t = tiles.find((x) => x.id === r.tileId);
      if (!t) return null;
      return (
        <article key={r.id} className="qrow" style={{ opacity: r.status === "open" ? 1 : 0.55 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tileImage(t)} alt={tileAlt(t)} style={{ width: 88, height: 88 }} />
          <div className="qrow__body">
            <span className="serif" style={{ fontSize: 20 }}>{r.reason}</span>
            {r.note && <span className="small muted">“{r.note}”</span>}
            <span className="small faint">On {t.displayName ?? "Anonymous"} · {placeLabel(t)} · labelled {t.origin === "hand" ? "by hand" : "with AI"} · {r.status}</span>
          </div>
          {r.status === "open" && (
            <div className="qrow__acts">
              <button className="btn" onClick={() => { hideTile(t.id); setReportStatus(r.id, "hidden"); }}>Hide tile</button>
              <button className="btn" onClick={() => { setOrigin(t.id, t.origin === "hand" ? "ai" : "hand"); setReportStatus(r.id, "relabelled"); }}>Switch label</button>
              <button className="btn btn--quiet" onClick={() => setReportStatus(r.id, "dismissed")}>Leave it</button>
            </div>
          )}
        </article>
      );
    })}
  </>);
}

function SeasonsAdmin() {
  const seasons = useSeasons();
  const tiles = useAllTiles();
  return (<>
    <h1 style={{ fontSize: 36 }}>Seasons</h1>
    {seasons.map((s) => {
      const c = tiles.filter((t) => t.seasonId === s.id && t.status === "approved").length;
      return (
        <div key={s.id} className="qrow" style={{ alignItems: "center" }}>
          <div className="qrow__body"><span className="serif" style={{ fontSize: 22 }}>Season {s.number} · {s.name}</span><span className="small muted">{s.status} · {c} of {s.gridSize ** 2} approved · theme: {s.theme}</span></div>
          {s.status === "open" && <button className="btn" onClick={() => { if (confirm(`Fill Season ${s.number} with sample tiles and freeze it? This is a demo of the season ending.`)) fillSeasonForDemo(s.id); }}>Demo: fill and freeze</button>}
        </div>
      );
    })}
    <p className="small faint">A season freezes by itself when its last tile is approved. The next one opens automatically, and visitors see the season-end moment on the mural.</p>
    <div><button className="btn" onClick={() => { if (confirm("Clear every local change: submissions, decisions, reports, prices?")) resetPrototype(); }}>Reset prototype data</button></div>
  </>);
}

function PricesAdmin() {
  const local = useLocalState();
  const [p, setP] = useState(local.prices);
  const [toast, notify] = useToast();
  return (<>
    <h1 style={{ fontSize: 36 }}>Prices and credits</h1>
    <form style={{ display: "grid", gap: 16, maxWidth: 420 }} onSubmit={(e) => { e.preventDefault(); setPrices(p); notify("Prices saved"); }}>
      <div className="field"><label htmlFor="ps">Price per tile ($)</label><input id="ps" className="input" type="number" min={0.5} step={0.5} value={p.single} onChange={(e) => setP({ ...p, single: Number(e.target.value) })} /></div>
      <div className="field"><label htmlFor="bc">Tiles in a bundle</label><input id="bc" className="input" type="number" min={2} value={p.bundleCount} onChange={(e) => setP({ ...p, bundleCount: Number(e.target.value) })} /></div>
      <div className="field"><label htmlFor="bp">Bundle price ($)</label><input id="bp" className="input" type="number" min={1} value={p.bundlePrice} onChange={(e) => setP({ ...p, bundlePrice: Number(e.target.value) })} /></div>
      <button className="btn btn--primary" type="submit">Save prices</button>
    </form>
    <p className="small muted">This browser holds {local.credits} credits. <button className="btn btn--quiet" style={{ minHeight: 32, padding: 0 }} onClick={() => addCredits(-local.credits)}>Clear</button></p>
    <Toast msg={toast} />
  </>);
}
