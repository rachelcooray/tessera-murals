"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { artistCap, mosaicConfig } from "@/config/mosaic";
import { slotColour } from "@/lib/mosaic/colours";
import { hexToRgb, rgbToHsl } from "@/lib/colour";
import { balances, formatCents, type LedgerEntry } from "@/lib/mosaic/ledger";
import { estimatePerTileCents } from "@/lib/mosaic/pool";
import { askForPayout, claimAt, live, loadChallenge, loadGallery, loadMe, loadMosaic, saveArtistProfile, useLoad, type ChallengeCard } from "@/lib/mosaic/actions";
import { allMosaics, artistTileCount, capFor, isSlotOpen, progress, tilesFor, useMosaicState } from "@/lib/mosaic/store";
import { OCCASIONS, type ArtistProfile } from "@/lib/mosaic/types";
import { Toast, useToast } from "../ui";
import { MosaicGrid, Page, Stat, Todo, dateLabel } from "./common";

type Family = "all" | "warm" | "blue" | "green" | "dark";
function family(hex: string): Exclude<Family, "all"> {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  if (l < 22 || s < 10) return "dark";
  if (h < 70 || h >= 320) return "warm";
  if (h < 170) return "green";
  return "blue";
}

export function Challenge() {
  const s = useMosaicState();
  const router = useRouter();
  const [f, setF] = useState<Family>("all");
  const [toast, notify] = useToast();
  // Live: the server hands out a sample of open slots, one colour each. It never sends a whole mosaic.
  const remote = useLoad<ChallengeCard[]>("challenge", async () => { await loadMe(); return loadChallenge(36); });

  const cards = useMemo(() => {
    const out: { key: string; mosaicId: string; slot: number; hex: string; name: string; occasion: string; due: string; estimate: number; mine: number; cap: number }[] = [];
    if (live) {
      for (const c of remote.data ?? []) {
        const cap = artistCap(c.total), mine = artistTileCount(s, c.mosaicId, s.me);
        out.push({ key: `${c.mosaicId}-${c.slot}`, mosaicId: c.mosaicId, slot: c.slot, hex: c.hex, name: slotColour(hexToRgb(c.hex)).name, occasion: OCCASIONS.find((o) => o.id === c.occasion)?.label ?? "Mosaic", due: dateLabel(c.revealAt), estimate: -1, mine, cap });
      }
      return out;
    }
    for (const m of allMosaics(s)) {
      if (m.status !== "collecting" || !m.openToArtists || m.sample) continue;
      const p = progress(s, m);
      const estimate = estimatePerTileCents(m.poolCents, p.open, p.artist);
      const mine = artistTileCount(s, m.id, s.me), cap = capFor(m);
      // A handful of open slots per mosaic, spread through the picture.
      const open: number[] = [];
      for (let i = 0; i < m.cols * m.rows && open.length < 400; i++) if (isSlotOpen(s, m, i)) open.push(i);
      const step = Math.max(1, Math.floor(open.length / 8));
      for (let k = 0; k < open.length && out.filter((c) => c.mosaicId === m.id).length < 8; k += step) {
        const slot = open[k], c = m.slots[slot];
        out.push({ key: `${m.id}-${slot}`, mosaicId: m.id, slot, hex: c.hex, name: c.name, occasion: OCCASIONS.find((o) => o.id === m.occasion)?.label ?? "Mosaic", due: dateLabel(m.revealAt), estimate, mine, cap });
      }
    }
    return out;
  }, [s, remote.data]);
  const shown = cards.filter((c) => f === "all" || family(c.hex) === f);

  async function take(mosaicId: string, slot: number) {
    if (!s.artist) { router.push("/artist"); return; }
    const r = await claimAt(mosaicId, slot, "artist");
    if (typeof r === "string") { notify(r); remote.reload(); return; }
    router.push(`/join?m=${mosaicId}&slot=${slot}&artist=1`);
  }

  return (
    <Page current="/challenge">
      <div className="split" style={{ alignItems: "flex-end", marginBottom: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 }}>
          <span className="eyebrow">Colour challenge</span>
          <h1 style={{ fontSize: "clamp(36px, 5vw, 52px)", lineHeight: 1.04 }}>Pick a colour. Make anything in it.</h1>
          <p className="muted" style={{ fontSize: 16, lineHeight: 1.6 }}>Each card is one open slot in someone’s hidden mosaic. You won’t know the picture until the reveal. {mosaicConfig.pool.shareBps / 100}% of each mosaic’s price is shared between the public artists whose tiles are accepted. Human-made work only.</p>
        </div>
        <div className="row" role="group" aria-label="Filter by colour family">
          {(["all", "warm", "blue", "green", "dark"] as Family[]).map((x) => <button key={x} className="btn" aria-pressed={f === x} onClick={() => setF(x)} style={{ minHeight: 44, ...(f === x ? { borderColor: "var(--accent)" } : {}) }}>{x === "all" ? "All" : x === "blue" ? "Blues" : x === "green" ? "Greens" : x === "dark" ? "Darks" : "Warm"}</button>)}
        </div>
      </div>
      {!s.artist && <p className="note" style={{ marginBottom: 20 }}>To take a slot, <Link href="/artist">set up your artist profile</Link> first. It takes a minute.</p>}
      {remote.loading ? <p className="muted" role="status">Finding open slots…</p> : remote.error ? <p className="error">{remote.error}</p> : shown.length === 0 ? (
        <p className="muted">No open slots right now. When a customer opens their spare slots to artists, they appear here.</p>
      ) : (
        <ul className="cards">
          {shown.map((c) => (
            <li key={c.key}>
              <div role="img" aria-label={`${c.name} slot colour`} style={{ aspectRatio: "4 / 3", background: c.hex }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 16 }}>
                <span className="serif italic" style={{ fontSize: 20, textTransform: "capitalize" }}>{c.name}</span>
                <span className="small muted">{c.hex.toUpperCase()} · {c.occasion} · due {c.due}</span>
                <div className="split small" style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 4 }}><span>{c.estimate < 0 ? "Shares a 30% artist pool" : `at least ~${formatCents(c.estimate)} a tile`}</span><span className="faint">{c.estimate < 0 ? "" : "Est."}</span></div>
                <span className="small faint">Your tiles here: {c.mine} of {c.cap}</span>
                <button className="btn" disabled={c.mine >= c.cap} onClick={() => void take(c.mosaicId, c.slot)}>{c.mine >= c.cap ? "Limit reached" : "Claim this slot"}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="small faint" style={{ marginTop: 24, maxWidth: 760 }}>Estimates are a floor: the pool divided by every slot still open to artists. If the customer’s circle fills more, each share grows. The final amount is set after the reveal, and a favourited tile counts {mosaicConfig.pool.favouriteMultiplier === 2 ? "twice" : `${mosaicConfig.pool.favouriteMultiplier} times`}. Each artist can place up to {mosaicConfig.pool.capPercent}% of a mosaic’s tiles (at least {mosaicConfig.pool.minCap}). A claimed slot is held for {mosaicConfig.slotHoldHours} hours, and every tile is reviewed by a person before it counts.</p>
      <Toast msg={toast} />
    </Page>
  );
}

export function ArtistPage() {
  const s = useMosaicState();
  const [toast, notify] = useToast();
  const loaded = useLoad("me", loadMe);
  const a = s.artist;
  if (loaded.loading) return <Page current="/artist" narrow><p className="muted" role="status">Loading…</p></Page>;
  if (!a) return <Page current="/artist" narrow><ArtistForm onSaved={() => notify("Profile saved")} /><Toast msg={toast} /></Page>;

  const b = balances(s.ledger, a.id);
  const mine = s.ledger.filter((e) => e.artistId === a.id).sort((x, y) => (x.at < y.at ? 1 : -1));
  const myTiles = s.tiles.filter((t) => t.contributorId === a.id && t.source === "artist");
  const byMosaic = allMosaics(s).filter((m) => myTiles.some((t) => t.mosaicId === m.id)).map((m) => {
    const ts = myTiles.filter((t) => t.mosaicId === m.id);
    const share = s.ledger.find((e) => e.kind === "share" && e.mosaicId === m.id && e.artistId === a.id);
    const p = progress(s, m);
    return {
      m, accepted: ts.filter((t) => t.status === "approved").length, pending: ts.filter((t) => t.status === "pending").length,
      favs: ts.filter((t) => m.favourites.includes(t.slot) && t.status === "approved").length,
      earn: share ? formatCents(share.amountCents) : m.status === "collecting" && live ? "Set after the reveal" : m.status === "collecting" ? `at least ~${formatCents(estimatePerTileCents(m.poolCents, p.open, p.artist) * Math.max(1, ts.length))}` : "Shared after favourites",
      status: m.status === "collecting" ? "Collecting" : share ? (s.ledger.some((e) => e.kind === "release" && e.ref === share.id) ? "Available" : `Held to ${dateLabel(share.releaseAt ?? share.at)}`) : "Revealed",
    };
  });
  const min = mosaicConfig.pool.payoutMinimumCents;
  const firstPayout = mosaicConfig.pool.firstPayoutTiles;
  const acceptedTiles = myTiles.filter((t) => t.status === "approved").length;
  const unlocked = acceptedTiles >= firstPayout;
  const canRequest = unlocked && b.availableCents >= min && b.requestedCents === 0;

  async function request() {
    const err = await askForPayout(acceptedTiles);
    notify(err ?? "Payout requested. An admin will review it.");
  }

  return (
    <Page current="/artist">
      <section className="split" style={{ alignItems: "flex-end", gap: 32, marginBottom: 40 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="eyebrow">Tessera artist since {dateLabel(a.joinedAt)}</span>
          <h1 style={{ fontSize: 56, lineHeight: 1 }}>{a.name}</h1>
          {a.portfolio && <span className="small">{a.portfolio}</span>}
        </div>
        <div className="row" style={{ gap: 32 }}>
          <div><div className="eyebrow" style={{ color: "var(--muted)" }}>Tiles accepted</div><div className="serif" style={{ fontSize: 36 }}>{myTiles.filter((t) => t.status === "approved").length}</div></div>
          <div><div className="eyebrow" style={{ color: "var(--muted)" }}>Mosaics</div><div className="serif" style={{ fontSize: 36 }}>{byMosaic.length}</div></div>
          <div><div className="eyebrow" style={{ color: "var(--muted)" }}>Favourited</div><div className="serif" style={{ fontSize: 36 }}>{byMosaic.reduce((t, x) => t + x.favs, 0)}</div></div>
        </div>
      </section>

      <section className="section">
        <div className="split"><h2 style={{ fontSize: 30 }}>Earnings</h2><span className="small muted">Visible only to you</span></div>
        <div className="stats">
          <Stat k="Pending" v={formatCents(b.pendingCents)} sub={`Held ${mosaicConfig.pool.holdDays} days after each reveal, in case a tile is reported or removed`} />
          <div className="box" style={{ gap: 10, boxShadow: "0 0 0 1px var(--accent)", border: 0 }}>
            <span className="eyebrow">Available</span>
            <span className="serif" style={{ fontSize: 32 }}>{formatCents(b.availableCents)}</span>
            {!unlocked && <>
              <div className="meter" role="progressbar" aria-label={`Accepted tiles toward your first payout`} aria-valuemin={0} aria-valuemax={firstPayout} aria-valuenow={acceptedTiles}><i style={{ width: `${Math.min(100, (acceptedTiles / firstPayout) * 100)}%` }} /></div>
              <span className="small muted">{acceptedTiles} of {firstPayout} accepted tiles. Your first payout unlocks at {firstPayout}; your earnings build up in the meantime.</span>
            </>}
            <div className="meter" role="progressbar" aria-label={`Progress toward the ${formatCents(min)} payout minimum`} aria-valuemin={0} aria-valuemax={min} aria-valuenow={Math.min(min, b.availableCents)}><i style={{ width: `${Math.min(100, (b.availableCents / min) * 100)}%` }} /></div>
            <span className="small muted">{b.requestedCents > 0 ? `${formatCents(b.requestedCents)} requested, waiting for review.` : b.availableCents >= min ? "You can request a payout." : `${formatCents(min - b.availableCents)} to go before you can request a payout. Smaller balances roll over.`}</span>
            <button className="btn" disabled={!canRequest} onClick={() => void request()}>{canRequest ? "Request payout" : !unlocked ? `Unlocks at ${firstPayout} tiles` : `Request payout at ${formatCents(min)}`}</button>
          </div>
          <Stat k="Lifetime" v={formatCents(b.lifetimeCents)} sub={`Paid out ${formatCents(b.paidCents)}`} />
        </div>
        <p className="small muted" style={{ maxWidth: 760 }}>How it works: {mosaicConfig.pool.shareBps / 100}% of every mosaic’s price goes into its artist pool. A week after the reveal, the pool is shared between public artists by accepted tiles. A tile the customer favourites counts {mosaicConfig.pool.favouriteMultiplier === 2 ? "twice" : `${mosaicConfig.pool.favouriteMultiplier} times`}. Tiles from the customer’s own circle and studio fill don’t take a share.</p>
      </section>

      <section className="section">
        <h2 style={{ fontSize: 30 }}>By mosaic</h2>
        {byMosaic.length === 0 ? <p className="muted">No tiles yet. <Link href="/challenge">Find a slot in the colour challenge</Link>.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Mosaic</th><th>Status</th><th>Accepted</th><th>In review</th><th>Favourites</th><th>Earnings</th></tr></thead>
            <tbody>{byMosaic.map((x) => <tr key={x.m.id}><td>{x.m.title}</td><td className="muted">{x.status}</td><td>{x.accepted} <span className="faint">of {capFor(x.m)} max</span></td><td className="muted">{x.pending}</td><td className="muted">{x.favs}</td><td>{x.earn}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>

      <section className="section">
        <div className="split"><h2 style={{ fontSize: 30 }}>Ledger</h2><span className="small muted">Every change is a new line; nothing is ever edited</span></div>
        {mine.length === 0 ? <p className="muted">Nothing yet.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Date</th><th>Entry</th><th>Mosaic</th><th>Detail</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
            <tbody>{mine.map((e) => <tr key={e.id}><td className="muted">{dateLabel(e.at)}</td><td>{LABEL[e.kind]}</td><td>{allMosaics(s).find((m) => m.id === e.mosaicId)?.title ?? "—"}</td><td className="muted">{e.note ?? ""}</td><td style={{ textAlign: "right", color: e.kind === "reversal" ? "var(--oxblood-ink)" : undefined }}>{e.kind === "reversal" ? "−" : ""}{formatCents(e.amountCents)}</td></tr>)}</tbody>
          </table></div>
        )}
        <p className="small faint">Pool shares are rounded down to the cent. Leftover cents go to Tessera.</p>
      </section>

      <section className="section" id="payout-setup">
        <h2 style={{ fontSize: 30 }}>How you get paid</h2>
        <PayoutSetup profile={a} onSaved={() => notify("Saved")} />
      </section>

      <section className="section"><h2 style={{ fontSize: 30 }}>Profile</h2><ArtistForm profile={a} onSaved={() => notify("Profile saved")} /></section>
      <Toast msg={toast} />
    </Page>
  );
}

const LABEL: Record<LedgerEntry["kind"], string> = { share: "Pool share", release: "Release", reversal: "Reversal", request: "Payout requested", paid: "Paid", returned: "Request returned" };

function ArtistForm({ profile, onSaved }: { profile?: ArtistProfile; onSaved: () => void }) {
  const [name, setName] = useState(profile?.name ?? "");
  const [portfolio, setPortfolio] = useState(profile?.portfolio ?? "");
  const [adult, setAdult] = useState(Boolean(profile));
  return (
    <form style={{ display: "grid", gap: 16, maxWidth: 520 }} onSubmit={(e) => { e.preventDefault(); if (!name.trim() || !adult) return; void saveArtistProfile({ name: name.trim(), portfolio: portfolio.trim(), payoutMethod: profile?.payoutMethod ?? "unset", payoutName: profile?.payoutName ?? "", country: profile?.country ?? "" }).then(onSaved, (err: Error) => alert(err.message)); }}>
      {!profile && <><span className="eyebrow">For artists</span><h1 style={{ fontSize: 44 }}>Paint one colour at a time</h1><p className="muted">Take open slots in other people’s hidden mosaics, make something by hand in that colour, and share each mosaic’s artist pool.</p></>}
      <div className="field"><label htmlFor="an">Name shown on your tiles</label><input id="an" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="field"><label htmlFor="ap">Portfolio or handle (optional)</label><input id="ap" className="input" maxLength={80} value={portfolio} onChange={(e) => setPortfolio(e.target.value)} placeholder="yourname.com or @yourname" /><span className="small faint">Shown as text, not a link.</span></div>
      {!profile && <label className="row small" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}><input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} style={{ width: 20, height: 20, accentColor: "var(--gold)", flex: "0 0 auto" }} /><span>I’m 18 or older, and every tile I send will be made by me without AI image tools.<Todo>[TODO: needs lawyer review]</Todo></span></label>}
      <button className="btn btn--primary" type="submit" disabled={!name.trim() || !adult}>{profile ? "Save profile" : "Become a Tessera artist"}</button>
    </form>
  );
}

function PayoutSetup({ profile, onSaved }: { profile: ArtistProfile; onSaved: () => void }) {
  const [method, setMethod] = useState(profile.payoutMethod);
  const [payoutName, setPayoutName] = useState(profile.payoutName);
  const [country, setCountry] = useState(profile.country);
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 520 }}>
      <p className="small muted">You only need this before your first payout, once you reach {formatCents(mosaicConfig.pool.payoutMinimumCents)} available.</p>
      <div className="choices" role="radiogroup" aria-label="Payout method">
        {([["bank", "Bank transfer"], ["paypal", "PayPal"], ["payoneer", "Payoneer"]] as const).map(([id, label]) => (
          <button key={id} className="choice" role="radio" aria-checked={method === id} onClick={() => setMethod(id)} style={{ minHeight: 56 }}><b style={{ fontSize: 17 }}>{label}</b><span className="faint">Details are collected when payouts open</span></button>
        ))}
      </div>
      <div className="field"><label htmlFor="pn">Name payouts should go to</label><input id="pn" className="input" value={payoutName} onChange={(e) => setPayoutName(e.target.value)} /></div>
      <div className="field"><label htmlFor="pc">Country you live in</label><input id="pc" className="input" value={country} onChange={(e) => setCountry(e.target.value)} /></div>
      <div className="box" style={{ borderStyle: "dashed" }}>
        <span className="eyebrow" style={{ color: "var(--ink)" }}>Identity and tax</span>
        <p className="small muted">We’ll ask for identity and tax details here before payouts open. We don’t collect ID or bank numbers yet.</p>
        <Todo>[TODO: needs accountant and legal review]</Todo>
      </div>
      <button className="btn btn--primary" onClick={() => void saveArtistProfile({ ...profile, payoutMethod: method, payoutName: payoutName.trim(), country: country.trim() }).then(onSaved, (err: Error) => alert(err.message))}>Save</button>
      <p className="small faint">Payouts are approved by hand while we test. No money moves yet.</p>
    </div>
  );
}

export function Gallery() {
  const s = useMosaicState();
  const loaded = useLoad("gallery", async () => { const list = await loadGallery(); await Promise.all(list.slice(0, 24).map((g) => loadMosaic(g.id))); return list.length; });
  const done = allMosaics(s).filter((m) => m.status === "revealed" && m.visibility === "public");
  return (
    <Page current="/gallery">
      <span className="eyebrow">The archive</span>
      <h1 style={{ fontSize: "clamp(36px, 5vw, 52px)", margin: "12px 0 10px" }}>Past mosaics</h1>
      <p className="muted" style={{ marginBottom: 32 }}>Finished pieces their owners chose to share. Private mosaics never appear here.</p>
      {loaded.loading && <p className="muted" role="status">Loading…</p>}
      <ul className="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 28 }}>
        {done.map((m) => {
          const tiles = tilesFor(s, m.id);
          const people = new Set(tiles.filter((t) => t.status === "approved" && t.source !== "studio").map((t) => t.contributorId)).size;
          return (
            <li key={m.id} style={{ background: "none", boxShadow: "none", gap: 12 }}>
              <Link href={`/mosaic?id=${m.id}`} aria-label={`Open ${m.title}`}><MosaicGrid mosaic={m} mode="slots" maxWidth={400} label={`${m.title}, as slot colours`} /></Link>
              <div className="split"><h2 style={{ fontSize: 24 }}>{m.title}</h2><span className="eyebrow" style={{ color: "var(--muted)" }}>{m.sample ? "Sample" : OCCASIONS.find((o) => o.id === m.occasion)?.label}</span></div>
              <span className="small muted">{(m.cols * m.rows).toLocaleString()} tiles · {people.toLocaleString()} contributors · revealed {m.revealedAt ? dateLabel(m.revealedAt) : ""}</span>
              <Link className="small" href={`/reveal?id=${m.id}`}>Watch the reveal</Link>
            </li>
          );
        })}
      </ul>
      <p className="small faint" style={{ marginTop: 40 }}>The season wall that came first lives on: <Link href="/seasons">Season archive</Link>.</p>
    </Page>
  );
}
