"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { mosaicConfig } from "@/config/mosaic";
import { formatCents } from "@/lib/mosaic/ledger";
import { daysToReveal, ownsMosaic, progress, reveal, setOpenToArtists, slotMap, studioFill, tilesFor, toggleFavourite, useMosaic, useMosaicState } from "@/lib/mosaic/store";
import { Toast, useToast } from "../ui";
import { MosaicGrid, Page, baseUrl, dateLabel } from "./common";

export function DashboardRoute() {
  const id = useSearchParams().get("id") ?? "";
  return <Dashboard key={id} id={id} />;
}

function Dashboard({ id }: { id: string }) {
  const s = useMosaicState();
  const m = useMosaic(id);
  const [toast, notify] = useToast();
  const [showTarget, setShowTarget] = useState(false);
  const tiles = useMemo(() => (m ? slotMap(tilesFor(s, m.id)) : new Map()), [s, m]);

  if (!m) return <Page narrow><h1>We couldn’t find that mosaic</h1><p className="muted" style={{ marginTop: 16 }}>Check the link, or <Link href="/start">start a new one</Link>.</p></Page>;

  const owner = ownsMosaic(s, m);
  const p = progress(s, m);
  const invite = `${typeof window !== "undefined" ? baseUrl() : ""}/join/?m=${m.id}&i=${m.inviteToken}`;
  const pct = (n: number) => `${(n / p.total) * 100}%`;

  if (!owner) {
    if (m.status === "revealed") return (
      <Page narrow>
        <span className="eyebrow">Revealed {m.revealedAt ? dateLabel(m.revealedAt) : ""}</span>
        <h1 style={{ fontSize: 44, margin: "10px 0 24px" }}>{m.title}</h1>
        <MosaicGrid mosaic={m} tiles={tiles} label={`${m.title}, a finished mosaic of ${p.total.toLocaleString()} tiles`} />
        <div className="row" style={{ marginTop: 20 }}><Link className="btn btn--primary" href={`/reveal?id=${m.id}`}>Watch the reveal</Link></div>
      </Page>
    );
    return <Page narrow><span className="eyebrow">A hidden mosaic</span><h1 style={{ fontSize: 40, margin: "10px 0 16px" }}>{m.title}</h1><p className="muted">This picture is still being made. It will be revealed on {dateLabel(m.revealAt)}.</p></Page>;
  }

  const days = Math.ceil(daysToReveal(m));
  async function copy() {
    try { await navigator.clipboard.writeText(invite); notify("Invite link copied"); } catch { notify("Copy didn’t work. Select the link and copy it."); }
  }

  return (
    <Page narrow>
      <div className="split">
        <span className="eyebrow">Your mosaic · {m.status === "revealed" ? `revealed ${dateLabel(m.revealedAt!)}` : `reveal ${dateLabel(m.revealAt)}`}</span>
        <span className="small faint">{formatCents(m.priceCents)}{m.payment.mock ? " (test)" : ""}</span>
      </div>
      <h1 style={{ fontSize: 44, margin: "10px 0 6px" }}>{m.title}</h1>
      <p className="lede" style={{ marginBottom: 24 }}>{m.status === "revealed" ? "Finished. Every tile is in." : `${(p.circle + p.artist + p.studio).toLocaleString()} of ${p.total.toLocaleString()} tiles in${days > 0 ? `, ${days} day${days === 1 ? "" : "s"} to go` : ""}.`}</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 32 }}>
        <div style={{ flex: "1 1 360px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {m.status === "revealed" && !m.splitAt
            ? <MosaicGrid mosaic={m} tiles={tiles} marks={m.favourites} pick={(slot) => { const err = toggleFavourite(m.id, slot); if (err) notify(err); }} label="Tap tiles to favourite them" />
            : showTarget ? <MosaicGrid mosaic={m} mode="slots" label="Your image as slot colours" />
            : <MosaicGrid mosaic={m} tiles={tiles} label="Your mosaic so far: placed tiles show their art, open slots are dashed" />}
          {m.status === "collecting" && <button className="btn btn--quiet" onClick={() => setShowTarget(!showTarget)}>{showTarget ? "Show the tiles" : "Show my picture as colours"}</button>}
        </div>

        <div style={{ flex: "1 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="stack" aria-hidden="true">
            <i style={{ width: pct(p.circle), background: "var(--gold)" }} /><i style={{ width: pct(p.artist), background: "#6e8fa6" }} />
            <i style={{ width: pct(p.studio), background: "#8a7d6b" }} /><i style={{ width: pct(p.review), background: "#8c7a9a" }} />
          </div>
          <ul className="legend">
            <li><i style={{ width: 10, height: 10, background: "var(--gold)" }} />Your circle · {p.circle.toLocaleString()}</li>
            <li><i style={{ width: 10, height: 10, background: "#6e8fa6" }} />Tessera artists · {p.artist.toLocaleString()}</li>
            <li><i style={{ width: 10, height: 10, background: "#8c7a9a" }} />In review · {p.review.toLocaleString()}</li>
            <li><i style={{ width: 10, height: 10, border: "1px dashed #5a4c3e" }} />Open · {p.open.toLocaleString()}</li>
            {p.studio > 0 && <li><i style={{ width: 10, height: 10, background: "#8a7d6b" }} />Studio fill · {p.studio.toLocaleString()}</li>}
          </ul>

          {m.status === "collecting" ? (
            <>
              <div className="box">
                <span className="eyebrow">Private invite link</span>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <span className="small" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{invite}</span>
                  <button className="btn btn--primary" style={{ minHeight: 40 }} onClick={() => void copy()}>Copy</button>
                </div>
                <p className="small faint">Anyone with this link gets the next free slot: only its colour, never the picture.</p>
                <Link className="small" href={`/join/?m=${m.id}&i=${m.inviteToken}`}>Try it yourself</Link>
              </div>
              <div className="row" style={{ flexWrap: "nowrap", justifyContent: "space-between" }}>
                <span className="small">Open spare slots to Tessera artists</span>
                <button className="switch" role="switch" aria-checked={m.openToArtists} aria-label="Open spare slots to Tessera artists" onClick={() => setOpenToArtists(m.id, !m.openToArtists)} />
              </div>
              <p className="small faint">{mosaicConfig.studioFillDaysBefore} days before {dateLabel(m.revealAt)}, any slot still open gets a clearly marked studio fill. If every tile is in sooner, you can reveal early.</p>
              {p.complete
                ? <button className="btn btn--primary" onClick={() => { const e = reveal(m.id); if (e) notify(e); }}>Reveal it now</button>
                : <button className="btn" onClick={() => { if (window.confirm(`Fill all ${p.open.toLocaleString()} open slots with studio fill now? Tiles in review keep their place.`)) notify(`${studioFill(m.id).toLocaleString()} slots filled`); }}>Finish now with studio fill</button>}
            </>
          ) : (
            <>
              <Link className="btn btn--primary" href={`/reveal?id=${m.id}`}>Watch and download the reveal</Link>
              {!m.splitAt
                ? <p className="small muted">Tap up to {mosaicConfig.pool.favouritesMax} tiles you love on the left. Each favourite counts double for its artist. {m.favourites.length} of {mosaicConfig.pool.favouritesMax} chosen.</p>
                : <p className="small muted">You favourited {m.favourites.length} tile{m.favourites.length === 1 ? "" : "s"}. The artists have been paid their share.</p>}
              <p className="small faint">{m.visibility === "public" ? "This mosaic is in Past mosaics for anyone to see." : "This mosaic is private."}</p>
            </>
          )}
        </div>
      </div>
      <Toast msg={toast} />
    </Page>
  );
}
