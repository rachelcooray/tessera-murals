"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { site } from "@/config/site";
import { addCredits, approveTile, fillSeasonForDemo, hideTile, rejectTile, resetPrototype, setAutoApprove, setOrigin, setPrices, setReportStatus, useAllTiles, useLocalState, useReports, useSeasons, useTile } from "@/lib/store";
import { authConfigured, isAdminEmail, sendPasswordReset, signIn, signOut, updatePassword, useSession } from "@/lib/auth";
import { paymentsLive, settlePayment } from "@/lib/payments";
import { DEFAULT_TIERS, money, quote, SUGGESTED_TIERS, type Prices } from "@/lib/pricing";
import { seasonNumber } from "@/lib/seasonLabel";
import { REJECTION_REASONS, type Tile } from "@/lib/types";
import { MuralExperience } from "./MuralExperience";
import { VoicePlayer } from "./VoicePlayer";
import { AboutPiece, Footer, Header, Icon, Mark, OriginLabel, placeLabel, shareTile, tileAlt, tileImage, TileTitle, Toast, useToast } from "./ui";

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
              <span className="eyebrow">Season {seasonNumber(tile.seasonId)}</span>
              <h1 style={{ fontSize: 44, lineHeight: 1.05 }}>{tile.displayName ?? "Anonymous"}</h1>
              <TileTitle t={tile} />
              <OriginLabel origin={tile.origin} />
              {tile.phrase && <p className="card__phrase">“{tile.phrase}”</p>}
              {tile.voice && <VoicePlayer clip={tile.voice} transcript={tile.transcript} />}
              <AboutPiece t={tile} open />
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
        <p className="lede" style={{ maxWidth: 620 }}>When a season closes it is frozen and hung here. Every tile still opens; every voice still plays.</p>
        {!seasons.some((s) => s.status === "frozen") && (
          <div className="box" style={{ marginTop: 32, maxWidth: 620 }}>
            <span className="eyebrow">Nothing hanging yet</span>
            <p className="serif" style={{ fontSize: 24, lineHeight: 1.35 }}>Season 0 is the very first wall. When it closes{seasons.find((s) => s.status === "open")?.closesAt ? ` on ${new Date(seasons.find((s) => s.status === "open")!.closesAt!).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}` : ""}, it hangs here for good, with your tile on it if you add one in time.</p>
            <Link className="btn btn--primary" href="/add" style={{ alignSelf: "flex-start" }}>Add your tile</Link>
          </div>
        )}
        <div className="seasons">
          {[...seasons].sort((a, b) => order(a.status) - order(b.status) || b.number - a.number).map((s) => {
            const st = tiles.filter((t) => t.seasonId === s.id);
            const count = st.filter((t) => t.status === "approved").length;
            const href = s.status === "open" ? "/" : s.status === "frozen" ? `/seasons/${s.id}` : null;
            const body = (<>
              <div style={{ opacity: s.status === "upcoming" ? 0.6 : 1 }}><MiniMural tiles={st} n={s.gridSize} /></div>
              <div className="plaque">
                <span className="eyebrow">Season {s.number} · {s.status === "open" ? "Now open" : s.status === "frozen" ? `Frozen ${new Date(s.frozenAt!).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : "Opens when this season closes"}</span>
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
  const { session, ready, recovery, endRecovery } = useSession();
  const [tab, setTab] = useState<Tab>("queue");
  const tiles = useAllTiles();
  const reports = useReports();
  const local = useLocalState();
  const pending = tiles.filter((t) => t.status === "pending").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const openReports = reports.filter((r) => r.status === "open");
  if (!mounted || !ready) return null;
  if (authConfigured) {
    if (!session) return <SignIn />;
    if (recovery) return <SignIn recovery onDone={endRecovery} />;
    if (!isAdminEmail(session.user.email)) return (
      <main className="page" style={{ alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div className="box" style={{ width: "min(420px, 100%)", background: "var(--card)" }}>
          <h1 style={{ fontSize: 30 }}>This account isn’t an admin</h1>
          <p className="small muted">Signed in as {session.user.email}.</p>
          <button className="btn" onClick={() => signOut()}>Sign out</button>
        </div>
      </main>
    );
  }
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
        {session && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="small faint" style={{ overflowWrap: "anywhere" }}>{session.user.email}</span>
            <button className="btn btn--quiet" style={{ minHeight: 36, padding: 0, justifyContent: "flex-start" }} onClick={() => signOut()}>Sign out</button>
          </div>
        )}
      </nav>
      <main className="admin__main">
        <p className="banner">{authConfigured ? "Signed in. Tiles, reports and prices still live only in this browser until the Phase 2 database." : "Sign-in is off until Supabase is connected (see docs/admin-signin.md), so anyone with this link can open this page. Changes only affect this browser."}{paymentsLive ? "" : " Payments are in test mode: no card is charged."}</p>
        {tab === "queue" && <Queue pending={pending} />}
        {tab === "reports" && <Reports />}
        {tab === "seasons" && <SeasonsAdmin />}
        {tab === "prices" && <PricesAdmin />}
      </main>
    </div>
  );
}

function ageDays(iso: string) { return (Date.now() - Date.parse(iso)) / 86400000; }

function payLabel(t: Tile): string {
  const p = t.payment;
  if (!p) return "no payment";
  const test = p.mock ? " (test)" : "";
  if (p.kind === "credit") return "1 credit";
  if (p.kind === "charge") return `${money(p.amount)} paid for ${p.quantity ?? 1} squares${test}`;
  return `${money(p.amount)} held${test}`;
}

function SignIn({ recovery = false, onDone }: { recovery?: boolean; onDone?: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      if (recovery) { await updatePassword(password); onDone?.(); }
      else await signIn(email.trim(), password);
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Sign-in failed." }); }
    setBusy(false);
  };
  const reset = async () => {
    if (!email.trim()) { setMsg({ ok: false, text: "Type your email first." }); return; }
    try { await sendPasswordReset(email.trim()); setMsg({ ok: true, text: "If that email is an admin, a reset link is on its way." }); }
    catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn’t send the email." }); }
  };
  return (
    <main className="page" style={{ alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form onSubmit={submit} className="box" style={{ width: "min(420px, 100%)", background: "var(--card)", gap: 18 }}>
        <Link href="/" className="wordmark"><Mark size={18} /><span style={{ fontSize: 19 }}>TESSERA</span></Link>
        <h1 style={{ fontSize: 32 }}>{recovery ? "Choose a new password" : "Admin sign in"}</h1>
        {!recovery && <div className="field"><label htmlFor="em">Email</label><input id="em" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>}
        <div className="field"><label htmlFor="pw">{recovery ? "New password" : "Password"}</label><input id="pw" className="input" type="password" autoComplete={recovery ? "new-password" : "current-password"} required minLength={recovery ? 10 : 1} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {msg && <p className={msg.ok ? "small muted" : "error"} role="alert">{msg.text}</p>}
        <button className="btn btn--primary btn--block" type="submit" disabled={busy}>{busy ? "Working…" : recovery ? "Save password" : "Sign in"}</button>
        {!recovery && <button type="button" className="btn btn--quiet" onClick={reset}>Forgot password</button>}
      </form>
    </main>
  );
}

function Queue({ pending }: { pending: Tile[] }) {
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** A single-square hold is captured on approval and released on rejection. Multi-square orders were already charged. */
  const settle = async (t: Tile, action: "capture" | "cancel") => {
    const p = t.payment;
    if (!p || p.kind !== "hold" || !p.intentId || p.mock) return true;
    setBusy(t.id); setErr(null);
    try { await settlePayment(action, p.intentId); return true; }
    catch (e) { setErr(`${t.displayName ?? "Anonymous"}: ${e instanceof Error ? e.message : "payment error"}`); return false; }
    finally { setBusy(null); }
  };
  const [reason, setReason] = useState<string>(REJECTION_REASONS[0]);
  const late = pending.filter((t) => ageDays(t.createdAt) > site.holdWarningDays).length;
  return (<>
    <div>
      <h1 style={{ fontSize: 36 }}>Moderation queue</h1>
      <p className="small muted">{pending.length} waiting{late ? ` · ${late} pending more than ${site.holdWarningDays} days, card hold expires soon` : ""}</p>
    </div>
    {err && <p className="error" role="alert">{err}</p>}
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
            <span className="small faint">Season {seasonNumber(t.seasonId)} · {placeLabel(t)} · {age < 1 ? `${Math.max(1, Math.round(age * 24))} hours ago` : `${Math.floor(age)} days ago`} · {payLabel(t)}{t.email ? ` · ${t.email}` : ""}</span>
            {t.phrase && <span className="serif italic" style={{ fontSize: 17 }}>“{t.phrase}”</span>}
            {t.prompt && <span className="small muted">Prompt: {t.prompt}</span>}
            {t.details && <span className="small muted">{[t.details.title && `Title: ${t.details.title}`, t.details.medium && `Made with: ${t.details.medium}`, t.details.credit && `Credit: ${t.details.credit}`].filter(Boolean).join(" · ")}</span>}
            {t.details?.note && <span className="small muted">Note: “{t.details.note}”</span>}
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
                <button className="btn" disabled={busy === t.id} onClick={async () => { if (await settle(t, "cancel")) { rejectTile(t.id, reason); setRejecting(null); } }}>Reject and release hold</button>
              </div>
            )}
          </div>
          <div className="qrow__acts">
            <button className="btn btn--primary" disabled={busy === t.id} onClick={async () => { if (await settle(t, "capture")) approveTile(t.id); }}>{busy === t.id ? "Working…" : "Approve"}</button>
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
    <p className="small faint">A season freezes by itself on its closing date, or sooner if its last square is approved. The next one opens automatically, and visitors see the season-end moment on the mural.</p>
    <div><button className="btn" onClick={() => { if (confirm("Clear every local change: submissions, decisions, reports, prices?")) resetPrototype(); }}>Reset prototype data</button></div>
  </>);
}

function PricesAdmin() {
  const local = useLocalState();
  const [p, setP] = useState<Prices>(local.prices);
  const [toast, notify] = useToast();
  const rows = [...p.tiers].sort((a, b) => a.n - b.n);
  const setRow = (i: number, key: "n" | "price", v: number) => setP({ ...p, tiers: rows.map((r, k) => (k === i ? { ...r, [key]: v } : r)) });
  return (<>
    <h1 style={{ fontSize: 36 }}>Prices and credits</h1>
    <p className="small muted" style={{ maxWidth: 680 }}>Buyers pick how many squares they want. Counts between rows pay the per-square rate of the row below. One square is held on the card until approval; more than one is charged now and the extras become credits. Net is after Stripe’s standard card fee of 2.9% plus 30 cents, so check your own Stripe pricing.</p>
    <div style={{ overflowX: "auto" }}>
      <table className="small" style={{ borderCollapse: "collapse", minWidth: 680 }}>
        <thead><tr style={{ textAlign: "left", color: "var(--muted)" }}>{["Squares", "Price ($)", "Each", "Saving", "Stripe fee", "You keep", "Keep per square", ""].map((h) => <th key={h} style={{ padding: "8px 12px", fontWeight: 500 }}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => { const q = quote(r.n, p); return (
            <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
              <td style={{ padding: "6px 12px" }}><input aria-label="Squares" className="input" style={{ width: 80, padding: 8 }} type="number" min={1} value={r.n} onChange={(e) => setRow(i, "n", Math.max(1, Math.floor(Number(e.target.value) || 1)))} /></td>
              <td style={{ padding: "6px 12px" }}><input aria-label="Price" className="input" style={{ width: 100, padding: 8 }} type="number" min={0.5} step={0.05} value={r.price} onChange={(e) => setRow(i, "price", Number(e.target.value) || 0)} /></td>
              <td style={{ padding: "6px 12px" }}>{money(q.perSquare)}</td>
              <td style={{ padding: "6px 12px" }}>{q.savingPct}%</td>
              <td style={{ padding: "6px 12px" }}>{money(q.fee)}</td>
              <td style={{ padding: "6px 12px" }}>{money(q.net)}</td>
              <td style={{ padding: "6px 12px", color: q.netPerSquare < quote(1, p).netPerSquare ? "var(--oxblood-ink)" : "var(--ink)" }}>{money(q.netPerSquare)}</td>
              <td style={{ padding: "6px 12px" }}>{rows.length > 1 && <button className="btn btn--quiet" style={{ minHeight: 32, padding: 0 }} onClick={() => setP({ ...p, tiers: rows.filter((_, k) => k !== i) })}>Remove</button>}</td>
            </tr>); })}
        </tbody>
      </table>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      <button className="btn" onClick={() => setP({ ...p, tiers: [...rows, { n: (rows[rows.length - 1]?.n ?? 0) + 5, price: 1 }] })}>Add a row</button>
      <button className="btn" onClick={() => setP({ ...p, tiers: DEFAULT_TIERS })}>Your prices</button>
      <button className="btn" onClick={() => setP({ ...p, tiers: SUGGESTED_TIERS })}>Suggested ladder</button>
    </div>
    <div className="field" style={{ maxWidth: 240 }}><label htmlFor="max">Most squares per order</label><input id="max" className="input" type="number" min={1} max={100} value={p.maxPerOrder} onChange={(e) => setP({ ...p, maxPerOrder: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></div>
    <div><button className="btn btn--primary" onClick={() => { setPrices(p); notify("Prices saved"); }}>Save prices</button></div>
    {paymentsLive && <p className="banner">These prices change what visitors see. The amount charged comes from the PRICE_TIERS setting on the payments server, so update it to match.</p>}
    <p className="small muted">This browser holds {local.credits} credits. <button className="btn btn--quiet" style={{ minHeight: 32, padding: 0 }} onClick={() => addCredits(-local.credits)}>Clear</button></p>
    <Toast msg={toast} />
  </>);
}
