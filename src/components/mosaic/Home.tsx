"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { mosaicConfig, tileCount } from "@/config/mosaic";
import { formatCents } from "@/lib/mosaic/ledger";
import { SAMPLE_HIGHLIGHT } from "@/lib/mosaic/sample";
import { allTiles, slotMap, useMosaic, useMosaicState } from "@/lib/mosaic/store";
import { Icon } from "../ui";
import { MosaicGrid, Page } from "./common";
import { CampaignBanner, OccasionCards, WhyDigital } from "./Campaign";

const HIGHLIGHT = SAMPLE_HIGHLIGHT;

export function MosaicHome() {
  const sample = useMosaic("sample-dusk");
  const s = useMosaicState();
  const tiles = useMemo(() => slotMap(allTiles(s).filter((t) => t.mosaicId === "sample-dusk")), [s]);
  const [view, setView] = useState<"finished" | "contributor">("finished");

  return (
    <Page current="/">
      <CampaignBanner />
      <section className="hero">
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <span className="eyebrow">Digital mosaics, painted by your people</span>
          <h1 style={{ fontSize: "clamp(40px, 6.4vw, 64px)", lineHeight: 1.02 }}>Your photo, painted square by square by everyone who loves you.</h1>
          <p className="muted" style={{ fontSize: 17, lineHeight: 1.65, maxWidth: 520 }}>A Tessera is a digital mosaic. You upload a photo, we cut it into thousands of squares, and everyone you invite gets one colour, never the picture. They paint their square on their phone, our studio finishes the rest, and on the day you choose everyone sees it at once.</p>
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
          <li><span className="serif" style={{ fontSize: 22, color: "var(--accent)" }}>III</span><h3 style={{ fontFamily: "var(--sans)", fontSize: 17, fontWeight: 600 }}>Our studio finishes it</h3><p className="small muted">Squares nobody paints are finished by the Tessera studio before your date, and marked as studio squares, so it is always ready on time.</p></li>
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
        <p className="small faint">Every size is a digital mosaic: a private invite link, the paint tool, studio finishing before your date, the reveal video and a link to keep. Nothing is posted, so it arrives on the day wherever they live.</p>
      </section>
      <WhyDigital />
      <OccasionCards />
    </Page>
  );
}
