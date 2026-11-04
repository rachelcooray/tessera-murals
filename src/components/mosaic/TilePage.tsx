"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { slotMap, tilesFor, useMosaic, useMosaicState } from "@/lib/mosaic/store";
import { MosaicGrid, Page, SourceLabel, TileArt, dateLabel } from "./common";

export function TileRouteMosaic() {
  const q = useSearchParams();
  const m = q.get("m") ?? "", slot = Number(q.get("s") ?? -1);
  return <TilePage key={`${m}-${slot}`} mosaicId={m} slot={slot} />;
}

function TilePage({ mosaicId, slot }: { mosaicId: string; slot: number }) {
  const s = useMosaicState();
  const m = useMosaic(mosaicId);
  const tiles = useMemo(() => (m ? slotMap(tilesFor(s, m.id)) : new Map()), [s, m]);
  const [zoom, setZoom] = useState(false);
  if (!m || slot < 0 || slot >= m.cols * m.rows) return <Page narrow><h1>Tile not found</h1></Page>;
  if (m.status !== "revealed") return <Page narrow><span className="eyebrow">Slot {slot + 1}</span><h1 style={{ fontSize: 40, margin: "10px 0 16px" }}>Not revealed yet</h1><p className="muted">{m.title} is revealed on {dateLabel(m.revealAt)}. Come back then to see your tile in the finished piece.</p></Page>;
  const t = tiles.get(slot);
  const row = Math.floor(slot / m.cols) + 1, col = (slot % m.cols) + 1;
  return (
    <Page narrow>
      <span className="eyebrow">Revealed {m.revealedAt ? dateLabel(m.revealedAt) : ""}</span>
      <h1 style={{ fontSize: 40, margin: "10px 0 6px" }}>{m.title}, in {(m.cols * m.rows).toLocaleString()} tiles</h1>
      <p className="muted" style={{ marginBottom: 20 }}>This one is slot {slot + 1}, row {row}, column {col}.</p>
      <div className="zoomwrap" style={{ maxWidth: 560 }}>
        <MosaicGrid mosaic={m} tiles={tiles} highlight={slot} focus={zoom ? { slot, span: 15 } : undefined} label={zoom ? "Close up on this tile and its neighbours" : `The finished mosaic with slot ${slot + 1} highlighted`} />
      </div>
      <div className="row" style={{ margin: "14px 0 24px" }}>
        <button className="btn" aria-pressed={!zoom} onClick={() => setZoom(false)}>Whole picture</button>
        <button className="btn" aria-pressed={zoom} onClick={() => setZoom(true)}>Find this tile</button>
      </div>
      {t && (
        <div className="row" style={{ gap: 18, alignItems: "flex-start" }}>
          <TileArt tile={t} slotHex={m.slots[slot].hex} size={120} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="serif" style={{ fontSize: 24 }}>{t.source === "studio" ? "Studio fill" : t.name ?? "Anonymous"}</span>
            <SourceLabel tile={t} />
          </div>
        </div>
      )}
      <div className="row" style={{ marginTop: 28 }}>
        <Link className="btn btn--primary" href={`/reveal?id=${m.id}&s=${slot}`}>This tile’s reveal video</Link>
        <Link className="btn btn--quiet" href="/challenge">Make a tile for another mosaic</Link>
      </div>
    </Page>
  );
}
