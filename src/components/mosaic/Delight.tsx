"use client";
/**
 * The home page's two hands-on moments.
 *  - RevealHero: a hidden mosaic you uncover by dragging across it. Past about a third, the rest cascades in.
 *  - PaintDemo: paint one square in your colour, place it, and the view zooms out to everyone else's squares.
 * Both draw on canvas, respect "reduce motion", and work with a finger, a mouse or the keyboard.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const rnd = (i: number) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const clamp = (v: number, a = 0, b = 255) => Math.max(a, Math.min(b, v));
const rgb = (c: number[]) => `rgb(${c.map((v) => Math.round(clamp(v))).join(",")})`;
const reducedQuery = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const useReducedMotion = () => useSyncExternalStore(
  (fn) => { const m = window.matchMedia("(prefers-reduced-motion: reduce)"); m.addEventListener("change", fn); return () => m.removeEventListener("change", fn); },
  reducedQuery, () => false);

/** Draws one painted-looking square: a base, a mark in a nearby colour, and a hint of the photo. */
function paintTile(g: CanvasRenderingContext2D, x: number, y: number, s: number, c: number[], seed: number) {
  const lum = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
  const drift = (j: number, amt: number) => c.map((v, ch) => v + (rnd(seed * 7 + j * 3 + ch) - 0.5) * amt * (0.3 + 0.7 * lum));
  const base = drift(1, 34), acc = drift(2, 70), dark = base.map((v) => v * 0.72);
  g.fillStyle = rgb(c.map((v) => v * 0.6)); g.fillRect(x, y, s, s);
  const gap = Math.max(1, s * 0.07), X = x + gap / 2, Y = y + gap / 2, S = s - gap;
  g.fillStyle = rgb(base); g.fillRect(X, Y, S, S);
  g.save(); g.beginPath(); g.rect(X, Y, S, S); g.clip();
  g.fillStyle = rgb(acc); g.strokeStyle = rgb(dark); g.lineCap = "round";
  const p = Math.floor(rnd(seed + 99) * 6);
  if (p === 0) { g.beginPath(); g.arc(X + S * .5, Y + S * .45, S * .26, 0, 7); g.fill(); }
  if (p === 1) { g.lineWidth = S * .13; g.beginPath(); g.moveTo(X, Y + S * .7); g.bezierCurveTo(X + S * .3, Y + S * .4, X + S * .6, Y + S, X + S, Y + S * .6); g.stroke(); }
  if (p === 2) { g.beginPath(); g.moveTo(X + S * .5, Y + S * .18); g.lineTo(X + S * .84, Y + S * .82); g.lineTo(X + S * .16, Y + S * .82); g.fill(); }
  if (p === 3) { g.globalAlpha = .8; g.fillRect(X, Y, S * .5, S); }
  if (p === 4) { g.lineWidth = S * .1; for (let q = 0; q < 3; q++) { g.beginPath(); g.moveTo(X, Y + S * (.25 + q * .25)); g.lineTo(X + S, Y + S * (.2 + q * .25)); g.stroke(); } }
  if (p === 5) { for (let q = 0; q < 4; q++) { g.beginPath(); g.arc(X + rnd(seed + q * 3) * S, Y + rnd(seed + q * 5) * S, S * .09, 0, 7); g.fill(); } }
  g.restore();
}

/** Average colour of each grid cell of a photo, as a flat list of [r, g, b]. */
async function photoGrid(src: string, cols: number, rows: number): Promise<number[][]> {
  const img = new Image(); img.decoding = "async"; img.src = src;
  await img.decode();
  const c = document.createElement("canvas"); c.width = cols; c.height = rows;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, cols, rows);
  const d = g.getImageData(0, 0, cols, rows).data, out: number[][] = [];
  for (let i = 0; i < cols * rows; i++) {
    const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], m = (r + gg + b) / 3;
    out.push([r, gg, b].map((v) => clamp((m + (v - m) * 1.12 - 128) * 1.06 + 128)));
  }
  return out;
}

type Phase = "hidden" | "touched" | "revealing" | "revealed";

export function RevealHero({ src, alt, credit }: { src: string; alt: string; credit: string }) {
  const wrap = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null);
  const st = useRef<{ cols: number; rows: number; cell: number; shown: Float32Array; target: Float32Array; at: Float64Array; sprite: HTMLCanvasElement | null; raf: number; touched: boolean; done: boolean }>(
    { cols: 0, rows: 0, cell: 0, shown: new Float32Array(0), target: new Float32Array(0), at: new Float64Array(0), sprite: null, raf: 0, touched: false, done: false });
  const [phase, setPhase] = useState<Phase>("hidden");
  const reduced = useReducedMotion();
  const frame = useRef<() => void>(() => {});

  const draw = useCallback(() => {
    const s = st.current, c = cv.current; if (!c || !s.sprite) return;
    const g = c.getContext("2d")!, now = performance.now(); let moving = false;
    for (let i = 0; i < s.shown.length; i++) {
      if (s.at[i] && now >= s.at[i]) { s.target[i] = 1; s.at[i] = 0; }
      if (s.at[i]) moving = true;
      const d = s.target[i] - s.shown[i];
      if (Math.abs(d) > 0.003) { s.shown[i] += reduced ? d : d * 0.2; moving = true; } else s.shown[i] = s.target[i];
    }
    const cell = s.cell;
    g.fillStyle = "#000a16"; g.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++) {
      const i = y * s.cols + x, v = s.shown[i];
      if (v < 1) { g.fillStyle = "#03203D"; g.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2); }
      if (v > 0) {
        const k = v * v * (3 - 2 * v), sz = cell * (0.55 + 0.45 * k), off = (cell - sz) / 2;
        g.globalAlpha = k; g.drawImage(s.sprite, x * cell, y * cell, cell, cell, x * cell + off, y * cell + off, sz, sz); g.globalAlpha = 1;
      }
    }
    s.raf = moving ? requestAnimationFrame(() => frame.current()) : 0;
    if (!moving && s.done) setPhase("revealed");
  }, [reduced]);
  useEffect(() => { frame.current = draw; }, [draw]);
  const kick = useCallback(() => { if (!st.current.raf) st.current.raf = requestAnimationFrame(() => frame.current()); }, []);

  // Build the grid and the painted sprite at the panel's size.
  useEffect(() => {
    const el = wrap.current, c = cv.current, state = st.current; if (!el || !c) return;
    let alive = true;
    const build = async () => {
      const w = el.clientWidth, cols = w < 520 ? 26 : 36, rows = Math.round(cols * 5 / 4);
      const dpr = Math.min(2, window.devicePixelRatio || 1), cell = Math.floor((w * dpr) / cols);
      c.width = cell * cols; c.height = cell * rows;
      const colours = await photoGrid(src, cols, rows).catch(() => null); if (!alive || !colours) return;
      const sprite = document.createElement("canvas"); sprite.width = c.width; sprite.height = c.height;
      const sg = sprite.getContext("2d")!;
      colours.forEach((col, i) => paintTile(sg, (i % cols) * cell, Math.floor(i / cols) * cell, cell, col, i + 17));
      const s = st.current, n = cols * rows, keep = s.cols === cols && s.rows === rows;
      Object.assign(s, { cols, rows, cell, sprite, shown: keep ? s.shown : new Float32Array(n), target: keep ? s.target : new Float32Array(n), at: keep ? s.at : new Float64Array(n) });
      kick();
    };
    void build();
    const ro = new ResizeObserver(() => { void build(); }); ro.observe(el);
    return () => { alive = false; ro.disconnect(); cancelAnimationFrame(state.raf); state.raf = 0; };
  }, [src, kick]);

  const revealAll = useCallback((fx = 0.5, fy = 0.5) => {
    const s = st.current; if (s.done) return;
    s.done = true; setPhase("revealing");
    const now = performance.now(), cx = fx * s.cols, cy = fy * s.rows;
    for (let i = 0; i < s.target.length; i++) {
      if (s.target[i] >= 1) continue;
      const d = Math.hypot((i % s.cols) - cx, Math.floor(i / s.cols) - cy);
      s.at[i] = reduced ? now : now + d * 28 + rnd(i) * 160;
    }
    kick();
  }, [kick, reduced]);

  const touch = useCallback((clientX: number, clientY: number) => {
    const s = st.current, c = cv.current; if (!c || !s.cols || s.done) return;
    const r = c.getBoundingClientRect(), fx = (clientX - r.left) / r.width, fy = (clientY - r.top) / r.height;
    const x = fx * s.cols, y = fy * s.rows, rad = s.cols < 30 ? 2.6 : 3.2;
    for (let ty = Math.floor(y - rad); ty <= y + rad; ty++) for (let tx = Math.floor(x - rad); tx <= x + rad; tx++) {
      if (tx < 0 || ty < 0 || tx >= s.cols || ty >= s.rows) continue;
      if (Math.hypot(tx + 0.5 - x, ty + 0.5 - y) <= rad) s.target[ty * s.cols + tx] = 1;
    }
    if (!s.touched) { s.touched = true; setPhase("touched"); }
    let lit = 0; for (let i = 0; i < s.target.length; i++) lit += s.target[i];
    if (lit / s.target.length > 0.3) revealAll(fx, fy);
    kick();
  }, [kick, revealAll]);

  function reset() {
    const s = st.current; s.target.fill(0); s.at.fill(0); s.done = false; s.touched = false; setPhase("hidden"); kick();
  }

  return (
    <figure className="rv">
      <div ref={wrap} className={`rv__panel rv--${phase}`}
        onPointerMove={(e) => { if (e.pointerType === "mouse" || e.buttons || e.pressure > 0) touch(e.clientX, e.clientY); }}
        onPointerDown={(e) => { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); touch(e.clientX, e.clientY); }}>
        <canvas ref={cv} role="img" aria-label={phase === "revealed" ? alt : "A hidden mosaic. Drag across it to reveal the picture."} />
        <div className="rv__hint" aria-hidden={phase === "revealing"}>
          {phase === "hidden" && <><span className="rv__dot" aria-hidden />Drag across to reveal</>}
          {phase === "touched" && <>Keep going…</>}
          {phase === "revealed" && <>Painted square by square. Seen all at once.</>}
        </div>
      </div>
      <figcaption className="rv__cap">
        {phase === "revealed"
          ? <button className="btn btn--quiet" onClick={reset}>Hide it again</button>
          : <button className="btn btn--quiet" onClick={() => revealAll()}>Reveal it for me</button>}
        <span className="faint small">Sample mosaic · {credit}</span>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ paint one square */

const COLOURS = [
  { name: "Sunset coral", rgb: [232, 116, 92] }, { name: "Lake teal", rgb: [46, 150, 150] }, { name: "Golden hour", rgb: [232, 176, 66] },
  { name: "Lavender dusk", rgb: [140, 116, 196] }, { name: "Rose", rgb: [214, 104, 140] }, { name: "Meadow", rgb: [104, 164, 86] },
];
const shade = (c: number[], k: number) => c.map((v) => (k > 0 ? v + (255 - v) * k : v * (1 + k)));

export function PaintDemo() {
  const cv = useRef<HTMLCanvasElement>(null), wall = useRef<HTMLCanvasElement>(null);
  const [ci, setCi] = useState(0);
  const [ink, setInk] = useState(0.35);
  const [size, setSize] = useState(0.08);
  const [stage, setStage] = useState<"paint" | "placed">("paint");
  const [strokes, setStrokes] = useState(0);
  const last = useRef<{ x: number; y: number } | null>(null);
  const colour = COLOURS[ci];

  const fill = useCallback(() => {
    const c = cv.current; if (!c) return;
    const g = c.getContext("2d")!; g.fillStyle = rgb(colour.rgb); g.fillRect(0, 0, c.width, c.height);
  }, [colour]);
  useEffect(() => { fill(); }, [fill]);
  const clear = () => { fill(); setStrokes(0); };

  function pos(e: React.PointerEvent) { const r = cv.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * cv.current!.width, y: (e.clientY - r.top) / r.height * cv.current!.height }; }
  function stroke(e: React.PointerEvent) {
    const c = cv.current!, g = c.getContext("2d")!, p = pos(e), from = last.current ?? p;
    g.strokeStyle = rgb(shade(colour.rgb, ink)); g.lineWidth = c.width * size * (0.6 + 0.8 * (e.pressure || 0.5)); g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); g.moveTo(from.x, from.y); g.lineTo(p.x, p.y); g.stroke(); last.current = p;
  }

  function place() {
    const w = wall.current, c = cv.current; if (!w || !c) return;
    const n = 13, cell = Math.floor(w.width / n), g = w.getContext("2d")!;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x, h = (rnd(i * 3 + ci) - 0.5) * 70, l = (rnd(i * 5) - 0.5) * 60;
      const col = colour.rgb.map((v, ch) => v + l + (ch === 0 ? h : ch === 2 ? -h : 0));
      paintTile(g, x * cell, y * cell, cell, col, i * 31 + ci);
    }
    const mid = Math.floor(n / 2);
    g.drawImage(c, mid * cell, mid * cell, cell, cell);
    setStage("placed");
  }

  return (
    <section className="section pd" aria-labelledby="pd-h">
      <div className="split"><h2 id="pd-h" style={{ fontSize: 40, margin: 0 }}>Try it: paint one square</h2><span className="small muted">This is exactly what your guests get.</span></div>
      <div className="pd__grid">
        <div className="pd__stage">
          <div className={`pd__zoom${stage === "placed" ? " is-out" : ""}`}>
            <canvas ref={wall} width={1040} height={1040} className="pd__wall" aria-hidden={stage === "paint"} role="img" aria-label="Your square in the middle of a mosaic of other people's squares" />
            <canvas ref={cv} width={520} height={520} className="pd__square" role="img" aria-label={`Your square, in ${colour.name}`}
              onPointerDown={(e) => { if (stage !== "paint") return; e.currentTarget.setPointerCapture(e.pointerId); last.current = null; stroke(e); }}
              onPointerMove={(e) => { if (stage === "paint" && e.buttons) stroke(e); }}
              onPointerUp={() => { if (last.current) setStrokes((n) => n + 1); last.current = null; }} />
          </div>
        </div>
        <div className="pd__side">
          {stage === "paint" ? (
            <>
              <div className="pd__colour"><span className="pd__chip" style={{ background: rgb(colour.rgb) }} /><div><span className="small muted">Your colour</span><b>{colour.name}</b></div></div>
              <p className="muted" style={{ margin: 0 }}>Paint anything: a heart, your initials, a scribble. Stay close to your colour so it reads in the picture.</p>
              <div className="pd__tools" role="group" aria-label="Brush">
                {[[0.35, "Lighter"], [0, "Your colour"], [-0.35, "Darker"]].map(([k, label]) => (
                  <button key={label as string} className="pd__ink" aria-pressed={ink === k} aria-label={label as string} title={label as string} onClick={() => setInk(k as number)} style={{ background: rgb(shade(colour.rgb, k as number)) }} />
                ))}
                <span className="pd__sep" />
                {[[0.04, "Fine"], [0.08, "Medium"], [0.16, "Bold"]].map(([v, label]) => (
                  <button key={label as string} className="btn pd__size" aria-pressed={size === v} onClick={() => setSize(v as number)}>{label as string}</button>
                ))}
              </div>
              <div className="row">
                <button className="btn btn--primary btn--glow" onClick={place} disabled={!strokes}>{strokes ? "Place my square" : "Paint something first"}</button>
                <button className="btn" onClick={clear}>Clear</button>
                <button className="btn btn--quiet" onClick={() => { setCi((ci + 1) % COLOURS.length); setStrokes(0); }}>Another colour</button>
              </div>
            </>
          ) : (
            <>
              <h3 style={{ fontSize: 26, margin: 0 }}>That’s yours, in the middle.</h3>
              <p className="muted" style={{ margin: 0 }}>Everyone around it painted their own square without seeing the picture. Now imagine ten thousand of them, from everyone who loves someone you know.</p>
              <div className="row">
                <Link className="btn btn--primary btn--glow" href="/start">Start yours</Link>
                <button className="btn" onClick={() => { setStage("paint"); clear(); }}>Paint another</button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
