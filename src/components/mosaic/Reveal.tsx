"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { artPalette } from "@/lib/art";
import { loadImage } from "@/lib/mosaic/image";
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

/** Draws the whole mosaic once, large, so zoomed frames stay sharp. */
async function renderMosaic(m: Mosaic, tiles: Map<number, MosaicTile>): Promise<HTMLCanvasElement> {
  const cell = Math.max(48, Math.floor(2048 / m.cols));
  const gap = Math.max(1, Math.round(cell / 40));
  const c = document.createElement("canvas");
  c.width = m.cols * cell; c.height = m.rows * cell;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#080605";
  ctx.fillRect(0, 0, c.width, c.height);
  const jobs: Promise<void>[] = [];
  for (let i = 0; i < m.cols * m.rows; i++) {
    const t = tiles.get(i);
    const x = (i % m.cols) * cell + gap, y = Math.floor(i / m.cols) * cell + gap, w = cell - gap * 2;
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

function drawFrame(ctx: CanvasRenderingContext2D, mos: HTMLCanvasElement, m: Mosaic, focus: number, p: number, contributors: number) {
  ctx.fillStyle = "#0e0b09";
  ctx.fillRect(0, 0, W, H);
  const q = clamp((p - 0.18) / 0.64);
  const scale = Math.pow(m.cols * 0.94, 1 - ease(q));
  const cell = mos.width / m.cols;
  const cx = ((focus % m.cols) + 0.5) * cell, cy = (Math.floor(focus / m.cols) + 0.5) * cell;
  const size = mos.width / scale;
  const sx = Math.max(0, Math.min(mos.width - size, cx - size / 2)), sy = Math.max(0, Math.min(mos.height - size, cy - size / 2));
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 80; ctx.shadowOffsetY = 40;
  ctx.fillStyle = "#080605"; ctx.fillRect(40, BOX_Y, BOX, BOX);
  ctx.restore();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(mos, sx, sy, size, size, 40, BOX_Y, BOX, BOX);

  ctx.textAlign = "center";
  const css = getComputedStyle(document.body);
  const serif = css.getPropertyValue("--serif").trim() || "Georgia, serif";
  const sans = css.getPropertyValue("--sans").trim() || "system-ui, sans-serif";
  const fade = (a: number, b: number) => clamp((p - a) / (b - a));
  ctx.fillStyle = `rgba(201,162,79,${0.4 + 0.6 * (1 - fade(0.3, 0.42))})`;
  ctx.font = `500 26px ${sans}`;
  ctx.fillText("TESSERA  ·  A HIDDEN MOSAIC", W / 2, 190);
  const early = p < 0.42;
  ctx.fillStyle = `rgba(239,227,204,${early ? 1 - fade(0.3, 0.42) : fade(0.55, 0.7)})`;
  ctx.font = `italic 64px ${serif}`;
  ctx.fillText(early ? "This is one tile." : "Together, they made this.", W / 2, 300);
  const end = fade(0.8, 0.92);
  ctx.fillStyle = `rgba(239,227,204,${end})`;
  ctx.font = `92px ${serif}`;
  ctx.fillText(m.title, W / 2, 1600, W - 80);
  ctx.fillStyle = `rgba(168,154,132,${end})`;
  ctx.font = `30px ${sans}`;
  ctx.fillText(`${m.cols * m.rows} tiles by ${contributors} people, one colour each`, W / 2, 1670, W - 80);
}

function Reveal({ id, focus: focusParam }: { id: string; focus: number | null }) {
  const s = useMosaicState();
  const m = useMosaic(id);
  const tiles = useMemo(() => (m ? slotMap(tilesFor(s, m.id).filter((t) => t.status === "approved")) : new Map<number, MosaicTile>()), [s, m]);
  const contributors = useMemo(() => new Set([...tiles.values()].filter((t) => t.source !== "studio").map((t) => t.contributorId)).size, [tiles]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mosRef = useRef<HTMLCanvasElement | null>(null);
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
    void renderMosaic(m, tiles).then((c) => { if (live) { mosRef.current = c; setReady(true); } });
    return () => { live = false; };
  }, [m, tiles, visible]);

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
