"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { artPalette } from "@/lib/art";
import { loadImage } from "@/lib/mosaic/image";
import { live, loadMosaic, tileImageUrls, useLoad } from "@/lib/mosaic/actions";
import { ownsMosaic, slotMap, tilesFor, useMosaic, useMosaicState } from "@/lib/mosaic/store";
import type { Mosaic, MosaicTile } from "@/lib/mosaic/types";
import { rnd } from "@/lib/rng";
import { Icon } from "../ui";
import { Page, dateLabel } from "./common";

const W = 1080, H = 1920, BOX = 1000, BOX_Y = 460, DURATION = 7000;

export function RevealRoute() {
  const q = useSearchParams();
  const id = q.get("id") ?? "";
  const s = q.get("s");
  return <Reveal key={`${id}-${s}`} id={id} focus={s === null ? null : Number(s)} />;
}

/** The mosaic drawn twice: whole (capped at about 4,000 px, the limit phones allow) and a sharp close-up around the first tile. */
interface MosaicImage { full: HTMLCanvasElement; detail: HTMLCanvasElement; dx0: number; dy0: number; span: number }
const DETAIL_SPAN = 24, DETAIL_CELL = 96, FULL_MAX = 4000;

async function renderMosaic(m: Mosaic, tiles: Map<number, MosaicTile>, focus: number): Promise<MosaicImage> {
  const span = Math.min(DETAIL_SPAN, m.cols, m.rows), fx = focus % m.cols, fy = Math.floor(focus / m.cols);
  const dx0 = Math.max(0, Math.min(m.cols - span, fx - Math.floor(span / 2))), dy0 = Math.max(0, Math.min(m.rows - span, fy - Math.floor(span / 2)));
  // Live mode keeps small copies for the whole picture; fetch the full-size tiles for the close-up.
  let detailTiles = tiles;
  if (live) {
    const near: MosaicTile[] = [];
    for (let y = dy0; y < dy0 + span; y++) for (let x = dx0; x < dx0 + span; x++) { const t = tiles.get(y * m.cols + x); if (t?.imagePath) near.push(t); }
    const urls = await tileImageUrls(near.map((t) => t.imagePath!)).catch(() => new Map<string, string>());
    detailTiles = new Map(tiles);
    for (const t of near) { const u = urls.get(t.imagePath!); if (u) detailTiles.set(t.slot, { ...t, imageUrl: u }); }
  }
  const [full, detail] = await Promise.all([
    renderRegion(m, tiles, 0, 0, m.cols, m.rows, Math.max(2, Math.floor(FULL_MAX / Math.max(m.cols, m.rows)))),
    renderRegion(m, detailTiles, dx0, dy0, span, span, DETAIL_CELL),
  ]);
  return { full, detail, dx0, dy0, span };
}

async function renderRegion(m: Mosaic, tiles: Map<number, MosaicTile>, x0: number, y0: number, cw: number, ch: number, cell: number): Promise<HTMLCanvasElement> {
  const gap = cell >= 12 ? Math.max(1, Math.round(cell / 40)) : 0;
  const c = document.createElement("canvas");
  c.width = cw * cell; c.height = ch * cell;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, c.width, c.height);
  const jobs: Promise<void>[] = [];
  for (let ry = 0; ry < ch; ry++) for (let rx = 0; rx < cw; rx++) {
    const i = (y0 + ry) * m.cols + x0 + rx;
    const t = tiles.get(i);
    const x = rx * cell + gap, y = ry * cell + gap, w = cell - gap * 2;
    const hex = m.slots[i].hex;
    if (t?.imageUrl) {
      jobs.push(loadImage(t.imageUrl).then((img) => { ctx.drawImage(img, x, y, w, w); }).catch(() => { ctx.fillStyle = hex; ctx.fillRect(x, y, w, w); }));
    } else {
      // Generated tiles: a soft gradient in the slot colour, with a few marks from its palette.
      const a = rnd(i * 7 + 3) * Math.PI * 2;
      const g = ctx.createLinearGradient(x + w / 2 - Math.cos(a) * w / 2, y + w / 2 - Math.sin(a) * w / 2, x + w / 2 + Math.cos(a) * w / 2, y + w / 2 + Math.sin(a) * w / 2);
      g.addColorStop(0, shade(hex, 0.18)); g.addColorStop(0.55, hex); g.addColorStop(1, shade(hex, -0.22));
      ctx.fillStyle = g; ctx.fillRect(x, y, w, w);
      if (t?.art) {
        const pal = artPalette(t.art);
        ctx.globalAlpha = 0.22;
        for (let k = 0; k < 3; k++) { ctx.fillStyle = pal[k % pal.length]; ctx.beginPath(); ctx.arc(x + rnd(i + k * 31) * w, y + rnd(i * 3 + k) * w, w * (0.12 + rnd(i + k) * 0.2), 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
    }
  }
  await Promise.all(jobs);
  return c;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const ease = (q: number) => (q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2);
const clamp = (v: number) => Math.max(0, Math.min(1, v));

function drawFrame(ctx: CanvasRenderingContext2D, img: MosaicImage, m: Mosaic, focus: number, p: number, contributors: number) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);
  const q = clamp((p - 0.18) / 0.64);
  const scale = Math.pow(m.cols * 0.94, 1 - ease(q));
  // Work in tile units, then read from the close-up while the view fits inside it, else from the whole mosaic.
  const sizeT = m.cols / scale, cxT = (focus % m.cols) + 0.5, cyT = Math.floor(focus / m.cols) + 0.5;
  const sxT = Math.max(0, Math.min(m.cols - sizeT, cxT - sizeT / 2)), syT = Math.max(0, Math.min(m.rows - sizeT, cyT - sizeT / 2));
  const inDetail = sxT >= img.dx0 && syT >= img.dy0 && sxT + sizeT <= img.dx0 + img.span && syT + sizeT <= img.dy0 + img.span;
  const mos = inDetail ? img.detail : img.full;
  const cell = inDetail ? DETAIL_CELL : img.full.width / m.cols;
  const size = sizeT * cell;
  const sx = (sxT - (inDetail ? img.dx0 : 0)) * cell, sy = (syT - (inDetail ? img.dy0 : 0)) * cell;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 80; ctx.shadowOffsetY = 40;
  ctx.fillStyle = "#000000"; ctx.fillRect(40, BOX_Y, BOX, BOX);
  ctx.restore();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(mos, sx, sy, size, size, 40, BOX_Y, BOX, BOX);

  ctx.textAlign = "center";
  const css = getComputedStyle(document.body);
  const serif = css.getPropertyValue("--serif").trim() || "Georgia, serif";
  const sans = css.getPropertyValue("--sans").trim() || "system-ui, sans-serif";
  const fade = (a: number, b: number) => clamp((p - a) / (b - a));
  ctx.fillStyle = `rgba(245,245,247,${0.4 + 0.6 * (1 - fade(0.3, 0.42))})`;
  ctx.font = `500 26px ${sans}`;
  ctx.fillText("Tessera · a digital mosaic", W / 2, 190);
  const early = p < 0.42;
  ctx.fillStyle = `rgba(239,227,204,${early ? 1 - fade(0.3, 0.42) : fade(0.55, 0.7)})`;
  ctx.font = `600 60px ${serif}`;
  ctx.fillText(early ? "This is one tile." : "Together, they made this.", W / 2, 300);
  const end = fade(0.8, 0.92);
  ctx.fillStyle = `rgba(239,227,204,${end})`;
  ctx.font = `92px ${serif}`;
  ctx.fillText(m.title, W / 2, 1600, W - 80);
  ctx.fillStyle = `rgba(168,154,132,${end})`;
  ctx.font = `30px ${sans}`;
  ctx.fillText(`${(m.cols * m.rows).toLocaleString()} tiles by ${contributors.toLocaleString()} people, one colour each`, W / 2, 1670, W - 80);
}

function Reveal({ id, focus: focusParam }: { id: string; focus: number | null }) {
  const s = useMosaicState();
  const m = useMosaic(id);
  const loaded = useLoad(id, () => loadMosaic(id));
  const tiles = useMemo(() => (m ? slotMap(tilesFor(s, m.id).filter((t) => t.status === "approved")) : new Map<number, MosaicTile>()), [s, m]);
  const contributors = useMemo(() => new Set([...tiles.values()].filter((t) => t.source !== "studio").map((t) => t.contributorId)).size, [tiles]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mosRef = useRef<MosaicImage | null>(null);
  const raf = useRef(0);
  const [ready, setReady] = useState(false);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [video, setVideo] = useState<{ url: string; ext: string } | null>(null);
  const focus = m ? (focusParam !== null && focusParam >= 0 && focusParam < m.cols * m.rows ? focusParam : Math.floor(m.rows * 0.42) * m.cols + Math.floor(m.cols * 0.4)) : 0;
  const visible = m && m.status === "revealed" && (m.visibility === "public" || ownsMosaic(s, m) || focusParam !== null);

  useEffect(() => {
    if (!m || !visible) return;
    let live = true;
    void renderMosaic(m, tiles, focus).then((c) => { if (live) { mosRef.current = c; setReady(true); } });
    return () => { live = false; };
  }, [m, tiles, visible, focus]);

  const paint = useCallback((p: number) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && mosRef.current && m) drawFrame(ctx, mosRef.current, m, focus, p, contributors);
  }, [m, focus, contributors]);

  useEffect(() => { if (ready) paint(pos); }, [ready, pos, paint]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const play = useCallback((from: number, onEnd?: () => void) => {
    cancelAnimationFrame(raf.current);
    const start = performance.now() - from * DURATION;
    setPlaying(true);
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION);
      setPos(p); paint(p);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else { setPlaying(false); onEnd?.(); }
    };
    raf.current = requestAnimationFrame(step);
  }, [paint]);

  function stop() { cancelAnimationFrame(raf.current); setPlaying(false); }

  function record() {
    const canvas = canvasRef.current;
    if (!canvas || typeof MediaRecorder === "undefined" || !canvas.captureStream) { alert("This browser can’t record video. Try Chrome, Edge or Safari."); return; }
    const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const rec = new MediaRecorder(canvas.captureStream(30), type ? { mimeType: type, videoBitsPerSecond: 8_000_000 } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || "video/webm" });
      setVideo({ url: URL.createObjectURL(blob), ext: blob.type.includes("mp4") ? "mp4" : "webm" });
      setRecording(false);
    };
    setVideo(null); setRecording(true);
    paint(0);
    rec.start();
    // Hold the last frame for a beat so the title can be read.
    play(0, () => setTimeout(() => rec.stop(), 1200));
  }

  if (loaded.loading) return <Page narrow><p className="muted" role="status">Loading the reveal…</p></Page>;
  if (!m) return <Page narrow><h1>Reveal not found</h1></Page>;
  if (m.status !== "revealed") return <Page narrow><span className="eyebrow">Not yet</span><h1 style={{ fontSize: 40, margin: "10px 0 16px" }}>{m.title}</h1><p className="muted">This mosaic is revealed on {dateLabel(m.revealAt)}.</p></Page>;
  if (!visible) return <Page narrow><h1>This mosaic is private</h1></Page>;

  return (
    <Page narrow>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-start" }}>
        <div className="reveal-stage" style={{ flex: "1 1 300px" }}>
          <canvas ref={canvasRef} width={W} height={H} role="img" aria-label={`Reveal of ${m.title}: zooming out from one tile to the full picture`} />
        </div>
        <div style={{ flex: "1 1 260px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <span className="eyebrow">The reveal{m.sample ? " · sample" : ""}</span>
          <h1 style={{ fontSize: 40 }}>{m.title}</h1>
          <p className="muted">From one tile to the whole picture, in seven seconds. Vertical 9:16 for TikTok, Reels and Stories.</p>
          <div className="row">
            <button className="btn btn--primary" disabled={!ready || recording} onClick={() => (playing ? stop() : play(pos >= 1 ? 0 : pos))}><Icon name={playing ? "pause" : "play"} size={14} />{playing ? "Pause" : "Play"}</button>
            <button className="btn" disabled={!ready || recording || playing} onClick={record}>{recording ? "Recording…" : "Make the video"}</button>
          </div>
          <label className="sr-only" htmlFor="scrub">Scrub the reveal</label>
          <input id="scrub" type="range" min={0} max={1000} value={Math.round(pos * 1000)} disabled={!ready || recording} onChange={(e) => { stop(); setPos(Number(e.target.value) / 1000); }} style={{ width: "100%", accentColor: "var(--gold)", minHeight: 44 }} />
          {video && <a className="btn btn--primary" href={video.url} download={`tessera-${m.id}.${video.ext}`}>Download video (.{video.ext})</a>}
          {video?.ext === "webm" && <p className="small faint">This browser saves WebM. TikTok and Instagram accept it; Safari saves MP4.</p>}
          <Link className="small" href={`/mosaic?id=${m.id}`}>See the mosaic</Link>
        </div>
      </div>
    </Page>
  );
}
