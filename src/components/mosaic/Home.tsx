"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { mosaicConfig, tileCount } from "@/config/mosaic";
import { formatCents } from "@/lib/mosaic/ledger";
import { SAMPLE_HIGHLIGHT } from "@/lib/mosaic/sample";
import { allTiles, slotMap, useMosaic, useMosaicState } from "@/lib/mosaic/store";
import { Icon } from "../ui";
import { MosaicGrid, Page } from "./common";

const HIGHLIGHT = SAMPLE_HIGHLIGHT;

export function MosaicHome() {
  const sample = useMosaic("sample-dusk");
  const s = useMosaicState();
  const tiles = useMemo(() => slotMap(allTiles(s).filter((t) => t.mosaicId === "sample-dusk")), [s]);
  const [view, setView] = useState<"finished" | "contributor">("finished");
  const poolPct = mosaicConfig.pool.shareBps / 100;

  return (
    <Page current="/">
      <section className="hero">
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <span className="eyebrow">Hidden mosaics, made by people</span>
          <h1 style={{ fontSize: "clamp(40px, 6.4vw, 64px)", lineHeight: 1.02 }}>Your photo, made from other people’s art.</h1>
          <p className="muted" style={{ fontSize: 17, lineHeight: 1.65, maxWidth: 520 }}>Upload a picture you love. We cut it into slots and send each person one colour, never the picture. Your friends paint some, our artists paint more, and nobody sees what they made until the last tile lands.</p>
          <div className="row">
            <Link className="btn btn--primary" href="/start">Start a mosaic, from {formatCents(mosaicConfig.tiers[0].priceCents).replace(".00", "")}</Link>
            <Link className="btn" href="/reveal?id=sample-dusk"><Icon name="play" size={14} />Watch a reveal</Link>
            <Link className="btn btn--quiet" href="/list">Join the founding list</Link>
          </div>
        </div>
        {sample && (
          <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            <MosaicGrid mosaic={sample} tiles={tiles} mode={view === "finished" ? "tiles" : "hidden"} highlight={view === "contributor" ? HIGHLIGHT : undefined}
              label={view === "finished" ? "A finished mosaic: two people silhouetted against a low sun over the sea, made of 10,000 small artworks" : "What one contributor sees: a single lit slot and its colour, the rest hidden"} />
            <div className="row" role="group" aria-label="Switch view">
              <button className="btn" aria-pressed={view === "finished"} onClick={() => setView("finished")} style={view === "finished" ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}>The finished piece</button>
              <button className="btn" aria-pressed={view === "contributor"} onClick={() => setView("contributor")} style={view === "contributor" ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}>What a contributor sees</button>
            </div>
            <figcaption className="small muted">{view === "finished" ? "A 10,000 tile wedding mosaic (a sample). Up close, every tile is a small painting, drawing or photo made by a person." : "What a guest sees when they open their link: one slot, one colour. The picture stays hidden until the reveal."}</figcaption>
          </figure>
        )}
      </section>

      <section className="section">
        <h2 style={{ fontSize: 40 }}>How a mosaic gets made</h2>
        <ol className="steps">
          <li><span className="serif" style={{ fontSize: 22, color: "var(--accent)" }}>I</span><h3 style={{ fontFamily: "var(--sans)", fontSize: 17, fontWeight: 600 }}>You upload one image</h3><p className="small muted">A wedding photo, a portrait, your logo. Only you and Tessera’s reviewers see it whole before the reveal.</p></li>
          <li><span className="serif" style={{ fontSize: 22, color: "var(--accent)" }}>II</span><h3 style={{ fontFamily: "var(--sans)", fontSize: 17, fontWeight: 600 }}>Your circle paints first</h3><p className="small muted">Share a private link. Each guest gets a slot and its colour, and makes anything they like in it, by hand.</p></li>
          <li><span className="serif" style={{ fontSize: 22, color: "var(--accent)" }}>III</span><h3 style={{ fontFamily: "var(--sans)", fontSize: 17, fontWeight: 600 }}>Artists fill the rest</h3><p className="small muted">Open slots go to the colour challenge, where Tessera artists pick them up and share {poolPct}% of the price between them. Anything still empty near your date gets a clearly marked studio fill, so it always finishes on time.</p></li>
          <li><span className="serif" style={{ fontSize: 22, color: "var(--accent)" }}>IV</span><h3 style={{ fontFamily: "var(--sans)", fontSize: 17, fontWeight: 600 }}>Everyone sees it at once</h3><p className="small muted">The reveal zooms out from one tile to the whole picture. You get a vertical video for TikTok and Reels, and every contributor gets a link to their own tile.</p></li>
        </ol>
      </section>

      <section className="section">
        <div className="split"><h2 style={{ fontSize: 40 }}>Sizes</h2><p className="small muted">Contributors never pay. Every tile is reviewed by a person before it goes up.</p></div>
        <div className="tiers">
          {mosaicConfig.tiers.map((t, i) => (
            <article key={t.id} className={`tier${i === 1 ? " tier--on" : ""}`}>
              <div className="split"><h3 style={{ fontSize: 28 }}>{t.name}</h3>{i === 1 && <span className="eyebrow">Weddings</span>}</div>
              <div className="serif" style={{ fontSize: 44 }}>{formatCents(t.priceCents).replace(".00", "")}</div>
              <div className="small muted">{tileCount(t).toLocaleString()} tiles · {t.fits}</div>
              <Link className="btn" href={`/start?tier=${t.id}`} style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>Choose {t.name}</Link>
            </article>
          ))}
        </div>
        <p className="small faint">Every size includes a private invite link, an optional public colour challenge, studio fill before your date, and the reveal video. Every contributed tile is human-made.</p>
      </section>
    </Page>
  );
}
