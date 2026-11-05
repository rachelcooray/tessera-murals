"use client";
/**
 * The paint tool: a full painting app for one tile. Phone layout with sheets, tablet and desktop layout
 * with a tool rail and side panels (see .pt rules in globals.css).
 */
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from "react";
import { mosaicConfig } from "@/config/mosaic";
import { hexToRgb, rgbToHex } from "@/lib/colour";
import { averageColour, colourMatch, type SlotColour } from "@/lib/mosaic/colours";
import { pixels, squareCanvas } from "@/lib/mosaic/image";
import { BRUSHES, BRUSH_SETS, harmony, hexToHsv, hsvToHex, isHex, lensAdvice, paletteFor } from "@/lib/mosaic/paint/brushes";
import { MY_SET, deleteMyBrush, myBrushes, saveMyBrush } from "@/lib/mosaic/paint/mybrushes";
import { PAPERS } from "@/lib/mosaic/paint/paper";
import { TimelapseRecorder, exportTimelapse } from "@/lib/mosaic/paint/timelapse";
import { loadDraft, saveDraft } from "@/lib/mosaic/paint/drafts";
import { paintStats, type PaintStats } from "@/lib/mosaic/paint/effort";
import {
  BLENDS, PaintEngine, type Blend, type FilterName, type GradientKind, type GuideKind, type Point, type RetouchMode, type SelectKind, type ShapeStyle, type Stabiliser, type Symmetry, type Tool,
} from "@/lib/mosaic/paint/engine";
import { SHAPES, type ShapeKind } from "@/lib/mosaic/paint/shapes";

export interface PaintResult { canvas: HTMLCanvasElement; stats: PaintStats; /** Timelapse strip for the reviewer, if there's enough to show. */ strip: string | null }

const TOOLS: { id: Tool; label: string; d: string; hint: string }[] = [
  { id: "brush", label: "Brush", d: "M18.4 2.6a2 2 0 0 1 2.9 2.9L11 15.8l-3-3zM8 12.8c-2 0-4 1.6-4 4 0 1.6-1 2.6-2 3.2 4 .8 8-1 8-4.2z", hint: "Pick a brush in the library. Hold still at the end of a stroke to snap it straight. Touch and hold to pick a colour." },
  { id: "retouch", label: "Retouch", d: "M9 11V5a2 2 0 0 1 4 0v6M13 9a2 2 0 0 1 4 0v4c0 4-3 7-7 7a6 6 0 0 1-6-6v-2a2 2 0 0 1 4 0", hint: "Smudge, blur, sharpen, dodge, burn, sponge, clone or liquify what's already painted." },
  { id: "eraser", label: "Erase", d: "M16 3l5 5-10 10H6l-3-3zM9 21h12M11 8l5 5", hint: "Erases this layer with the current brush. On a mask, erasing hides." },
  { id: "fill", label: "Fill", d: "M5 11l7-7 8 8-7 7a2 2 0 0 1-2.8 0L5 13.8a2 2 0 0 1 0-2.8zM5 12h15M20 16c0 1.5 1 2.5 1 3.5a1 1 0 0 1-2 0c0-1 1-2 1-3.5z", hint: "Tap an area to fill it with the primary colour." },
  { id: "gradient", label: "Gradient", d: "M4 4h16v16H4zM4 14L14 4M4 20L20 4M10 20L20 10", hint: "Drag across the canvas: from the primary colour to clear, or to the secondary colour." },
  { id: "shapes", label: "Shapes", d: "M3 11h10v10H3zM21 9a6 6 0 1 1-12 0a6 6 0 1 1 12 0", hint: "Drag to draw. Outline uses the primary colour, fill the secondary. Line width follows Size." },
  { id: "text", label: "Text", d: "M4 6V4h16v2M12 4v16M9 20h6", hint: "Tap where the text goes." },
  { id: "select", label: "Select", d: "M4 4h16v16H4z", hint: "Painting, fills and filters then stay inside the selection." },
  { id: "transform", label: "Transform", d: "M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3", hint: "Drag to move the selection or the whole layer. Scale, turn, skew and flip below, then Apply." },
  { id: "picker", label: "Picker", d: "M19 3a2.1 2.1 0 0 1 3 3l-3 3-3-3zM16 6L5 17l-1 3 3-1 11-11", hint: "Tap anywhere to pick up that colour." },
  { id: "recolour", label: "Recolour", d: "M12 3a9 9 0 1 0 9 9M12 3v9h9M16 3.5A9 9 0 0 1 20.5 8", hint: "Tap a colour you've painted to swap it for the primary colour. Shading stays." },
  { id: "guides", label: "Guides", d: "M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18", hint: "Grids and perspective lines to paint by, and mirror painting. Guides never show in your tile." },
  { id: "filters", label: "Filters", d: "M4 6h8M16 6h4M14 4v4M4 12h2M10 12h10M8 10v4M4 18h10M18 18h2M16 16v4", hint: "Adjustments and effects for this layer, or just the selection." },
];

/** The tools on the phone's dock. The rest live behind More. */
const DOCK: Tool[] = ["brush", "retouch", "eraser", "fill", "select", "transform"];
/** Keyboard shortcuts for tools. */
const KEYS: Partial<Record<string, Tool>> = { b: "brush", s: "retouch", e: "eraser", g: "fill", d: "gradient", u: "shapes", t: "text", l: "select", v: "transform", i: "picker", r: "recolour" };
const SHORTCUTS: [string, string][] = [
  ["Brush", "B"], ["Retouch (smudge)", "S"], ["Erase", "E"], ["Fill", "G"], ["Gradient", "D"], ["Shapes", "U"], ["Text", "T"], ["Select", "L"], ["Transform", "V"], ["Picker", "I, or hold Alt"],
  ["Recolour", "R"], ["Smaller / bigger brush", "[  ]"], ["Undo", "Ctrl Z"], ["Redo", "Ctrl Shift Z"], ["Swap colours", "X"], ["New layer", "Ctrl Shift N"],
  ["Move the canvas", "Space + drag"], ["Turn the canvas", "Shift + scroll"], ["Fit to screen", "0"], ["Flip the view", "H"], ["Timelapse", "P"], ["Mosaic lens", "M"],
];
const STABILISERS: { id: Stabiliser; label: string }[] = [{ id: "off", label: "Off" }, { id: "smooth", label: "Smooth" }, { id: "rope", label: "Rope" }];

const RETOUCH: { id: RetouchMode; label: string }[] = [
  { id: "smudge", label: "Smudge" }, { id: "blur", label: "Blur" }, { id: "sharpen", label: "Sharpen" }, { id: "dodge", label: "Dodge" }, { id: "burn", label: "Burn" },
  { id: "saturate", label: "Saturate" }, { id: "desaturate", label: "Desaturate" }, { id: "clone", label: "Clone" }, { id: "liquify", label: "Liquify" },
];
const GRADIENTS: { id: GradientKind; label: string }[] = [{ id: "linear", label: "Linear" }, { id: "radial", label: "Radial" }, { id: "angle", label: "Angle" }, { id: "reflected", label: "Reflected" }, { id: "diamond", label: "Diamond" }];
const SELECTS: { id: SelectKind; label: string }[] = [{ id: "rect", label: "Box" }, { id: "ellipse", label: "Oval" }, { id: "lasso", label: "Lasso" }, { id: "polygon", label: "Polygon" }, { id: "wand", label: "Magic wand" }];
const STYLES: { id: ShapeStyle; label: string }[] = [{ id: "outline", label: "Outline" }, { id: "fill", label: "Filled" }, { id: "both", label: "Outline and fill" }];
const GUIDES: { id: GuideKind; label: string }[] = [{ id: "none", label: "None" }, { id: "grid", label: "Grid" }, { id: "isometric", label: "Isometric" }, { id: "perspective", label: "Perspective" }, { id: "thirds", label: "Thirds" }];
const SYMMETRY: { id: Symmetry; label: string }[] = [{ id: "off", label: "Off" }, { id: "vertical", label: "Left and right" }, { id: "horizontal", label: "Top and bottom" }, { id: "quad", label: "Four ways" }, { id: "radial", label: "Radial" }];
const FONTS = [
  { id: "serif", label: "Serif" }, { id: "sans", label: "Sans" }, { id: "mono", label: "Typewriter" }, { id: "hand", label: "Handwriting" }, { id: "display", label: "Poster" },
] as const;
type FontId = (typeof FONTS)[number]["id"];

type Param = { key: string; label: string; min: number; max: number; step?: number; value: number; unit?: string };
const FILTERS: { id: FilterName; label: string; group: "Adjust" | "Effects"; params: Param[] }[] = [
  { id: "hsb", label: "Hue, saturation, brightness", group: "Adjust", params: [{ key: "hue", label: "Hue", min: -180, max: 180, value: 0, unit: "°" }, { key: "saturation", label: "Saturation", min: -100, max: 100, value: 0, unit: "%" }, { key: "brightness", label: "Brightness", min: -100, max: 100, value: 0, unit: "%" }] },
  { id: "brightnessContrast", label: "Brightness and contrast", group: "Adjust", params: [{ key: "brightness", label: "Brightness", min: -100, max: 100, value: 0 }, { key: "contrast", label: "Contrast", min: -100, max: 100, value: 20 }] },
  { id: "colourBalance", label: "Colour balance", group: "Adjust", params: [{ key: "red", label: "Red", min: -100, max: 100, value: 0 }, { key: "green", label: "Green", min: -100, max: 100, value: 0 }, { key: "blue", label: "Blue", min: -100, max: 100, value: 0 }] },
  { id: "levels", label: "Levels", group: "Adjust", params: [{ key: "black", label: "Black", min: 0, max: 254, value: 0 }, { key: "white", label: "White", min: 1, max: 255, value: 255 }, { key: "gamma", label: "Midtones", min: 0.1, max: 3, step: 0.05, value: 1 }] },
  { id: "curves", label: "Curves", group: "Adjust", params: [{ key: "shadows", label: "Shadows", min: -64, max: 64, value: -12 }, { key: "midtones", label: "Midtones", min: -64, max: 64, value: 0 }, { key: "highlights", label: "Highlights", min: -64, max: 64, value: 12 }] },
  { id: "gradientMap", label: "Gradient map (primary to secondary)", group: "Adjust", params: [] },
  { id: "invert", label: "Invert", group: "Adjust", params: [] },
  { id: "desaturate", label: "Black and white", group: "Adjust", params: [] },
  { id: "posterize", label: "Posterize", group: "Adjust", params: [{ key: "steps", label: "Steps", min: 2, max: 16, value: 4 }] },
  { id: "threshold", label: "Threshold", group: "Adjust", params: [{ key: "level", label: "Level", min: 0, max: 255, value: 128 }] },
  { id: "blur", label: "Blur", group: "Effects", params: [{ key: "radius", label: "Radius", min: 1, max: 40, value: 6, unit: " px" }] },
  { id: "motionBlur", label: "Motion blur", group: "Effects", params: [{ key: "angle", label: "Angle", min: 0, max: 180, value: 0, unit: "°" }, { key: "distance", label: "Distance", min: 2, max: 60, value: 20, unit: " px" }] },
  { id: "sharpen", label: "Sharpen", group: "Effects", params: [{ key: "amount", label: "Amount", min: 0.1, max: 3, step: 0.1, value: 1 }] },
  { id: "noise", label: "Noise", group: "Effects", params: [{ key: "amount", label: "Amount", min: 1, max: 80, value: 20 }] },
  { id: "pixelate", label: "Pixelate", group: "Effects", params: [{ key: "cell", label: "Cell size", min: 2, max: 128, value: 24, unit: " px" }] },
  { id: "halftone", label: "Halftone", group: "Effects", params: [{ key: "cell", label: "Dot size", min: 4, max: 64, value: 16, unit: " px" }] },
  { id: "bloom", label: "Bloom", group: "Effects", params: [{ key: "threshold", label: "Threshold", min: 0, max: 255, value: 170 }, { key: "radius", label: "Radius", min: 1, max: 40, value: 14, unit: " px" }, { key: "strength", label: "Strength", min: 0.1, max: 2, step: 0.1, value: 0.8 }] },
  { id: "chromatic", label: "Chromatic aberration", group: "Effects", params: [{ key: "shift", label: "Shift", min: 1, max: 40, value: 8, unit: " px" }] },
  { id: "glitch", label: "Glitch", group: "Effects", params: [{ key: "amount", label: "Amount", min: 4, max: 200, value: 40 }] },
  { id: "vignette", label: "Vignette", group: "Effects", params: [{ key: "strength", label: "Strength", min: 0.1, max: 1, step: 0.05, value: 0.5 }] },
  { id: "emboss", label: "Emboss", group: "Effects", params: [] },
];

const icon = {
  back: "M15 6l-6 6 6 6", undo: "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11", redo: "M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2", more: "M5 12h.01M12 12h.01M19 12h.01", layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  swap: "M7 4L3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8", eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0",
  eyeOff: "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6",
  exitFull: "M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5",
  dots: "M5 12h.01M12 12h.01M19 12h.01", reference: "M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6", timelapse: "M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v4h4",
  lens: "M4 4h5v5H4zM10 4h5v5h-5zM16 4h4v5h-4zM4 10h5v5H4zM10 10h5v5h-5zM16 10h4v5h-4zM4 16h5v4H4zM10 16h5v4h-5zM16 16h4v4h-4z",
  keys: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10", picker: "M19 3a2.1 2.1 0 0 1 3 3l-3 3-3-3zM16 6L5 17l-1 3 3-1 11-11",
};

function Svg({ d, dash, size = 20 }: { d: string; dash?: boolean; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash ? "3 3" : undefined} aria-hidden="true"><path d={d} /></svg>;
}

/** A small copy of a layer, redrawn whenever the painting changes (the key changes with it). */
function LayerThumb({ source, mask }: { source: HTMLCanvasElement; mask?: boolean }) {
  const draw = useCallback((c: HTMLCanvasElement | null) => {
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (mask) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(source, 0, 0, c.width, c.height);
  }, [source, mask]);
  return <canvas ref={draw} width={88} height={88} className="pt-thumb" aria-hidden="true" />;
}

function Range({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="pt-range">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <output htmlFor={id}>{step < 1 ? value.toFixed(step < 0.1 ? 2 : 1) : Math.round(value)}{unit}</output>
    </div>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="pt-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" className="pt-toggle" aria-pressed={on} onClick={() => onChange(!on)}>{label}</button>;
}

/** A panel. Modal ones (More, Tools, Lens, Timelapse, Shortcuts) only show when opened, on every screen size. */
function Panel({ id, title, onClose, children, active, modal }: { id: string; title: ReactNode; onClose: () => void; children: ReactNode; active: boolean; modal?: boolean }) {
  return (
    <section className={`pt-panel${active ? " is-active" : ""}${modal ? " pt-panel--modal" : ""}`} data-panel={id} aria-label={typeof title === "string" ? title : id}>
      <div className="pt-panel__head"><h2>{title}</h2><button type="button" className="pt-close" onClick={onClose}>Close</button></div>
      {children}
    </section>
  );
}

/** 49 stand-in squares in colours like the slot's (never the real neighbours, which stay hidden). The middle one is yours. */
function lensNeighbours(slotHex: string): string[] {
  const [r, g, b] = hexToRgb(slotHex);
  return Array.from({ length: 49 }, (_, i) => {
    const n = (k: number) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x) - 0.5; };
    const light = n(1) * 36, warm = n(2) * 14;
    return rgbToHex([r + light + warm, g + light, b + light - warm].map((v) => Math.max(0, Math.min(255, v))) as [number, number, number]);
  });
}

/** Plays the recorded steps back, and makes a vertical video of them. */
function TimelapsePlayer({ recorder, frames, slotHex, slotNumber }: { recorder: TimelapseRecorder | null; frames: number; slotHex: string; slotNumber: number }) {
  const [imgs, setImgs] = useState<HTMLImageElement[]>([]);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<"1" | "2" | "4">("2");
  const [video, setVideo] = useState<{ url: string; ext: string } | null>(null);
  const [making, setMaking] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let live = true;
    void recorder?.images().then((list) => { if (live) { setImgs(list); setAt(list.length - 1); } });
    return () => { live = false; };
  }, [recorder, frames]);

  useEffect(() => {
    const c = canvasRef.current, img = imgs[at];
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = slotHex; ctx.fillRect(0, 0, c.width, c.height);
    if (img) ctx.drawImage(img, 0, 0, c.width, c.height);
  }, [imgs, at, slotHex]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setAt((i) => { if (i >= imgs.length - 1) { setPlaying(false); return i; } return i + 1; }), 160 / Number(speed));
    return () => window.clearInterval(id);
  }, [playing, speed, imgs.length]);

  async function make() {
    if (!recorder) return;
    setMaking("Making your video…"); setVideo(null);
    try { setVideo(await exportTimelapse(recorder, slotHex, `Slot ${slotNumber}`, Math.min(15, Math.max(4, imgs.length * 0.12)))); setMaking(null); }
    catch (err) { setMaking(err instanceof Error ? err.message : "The video couldn’t be made."); }
  }

  if (!imgs.length) return <p className="pt-note">Nothing recorded yet. Every stroke you paint is saved here as a step.</p>;
  return (
    <div className="pt-tl">
      <canvas ref={canvasRef} width={360} height={360} className="pt-tl__frame" role="img" aria-label={`Timelapse, step ${at + 1} of ${imgs.length}`} />
      <div className="pt-row">
        <button type="button" className="pt-btn pt-btn--primary" onClick={() => { if (!playing && at >= imgs.length - 1) setAt(0); setPlaying(!playing); }}>{playing ? "Pause" : "Play"}</button>
        <Seg label="Speed" value={speed} options={[{ id: "1", label: "1×" }, { id: "2", label: "2×" }, { id: "4", label: "4×" }] as const} onChange={setSpeed} />
      </div>
      <Range label="Step" value={at + 1} min={1} max={imgs.length} onChange={(v) => { setPlaying(false); setAt(v - 1); }} />
      <div className="pt-row">
        <button type="button" className="pt-btn" disabled={making === "Making your video…"} onClick={() => void make()}>Make a video</button>
        {video && <a className="pt-btn pt-btn--primary" href={video.url} download={`tessera-slot-${slotNumber}-timelapse.${video.ext}`}>Download (.{video.ext})</a>}
      </div>
      {making && <p className="pt-note" role="status">{making}</p>}
    </div>
  );
}

/** A photo to look at while painting. It floats above the canvas, drags by its title bar, and is never painted into the tile. */
function ReferenceWindow({ reference, onMove, onClose }: { reference: { url: string; x: number; y: number }; onMove: (x: number, y: number) => void; onClose: () => void }) {
  const drag = useRef<null | { dx: number; dy: number }>(null);
  return (
    <section className="pt-ref" style={{ left: reference.x, top: reference.y }} aria-label="Reference photo">
      <div className="pt-ref__bar" onPointerDown={(ev) => { ev.currentTarget.setPointerCapture(ev.pointerId); drag.current = { dx: ev.clientX - reference.x, dy: ev.clientY - reference.y }; }}
        onPointerMove={(ev) => { const d = drag.current; if (d) onMove(Math.max(0, Math.min(window.innerWidth - 120, ev.clientX - d.dx)), Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - d.dy))); }}
        onPointerUp={() => { drag.current = null; }}>
        <span>Reference</span>
        <button type="button" aria-label="Close the reference photo" onClick={onClose}>×</button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- a local photo the painter chose, shown as is */}
      <img src={reference.url} alt="Your reference photo" />
      <span className="pt-ref__note">For looking at only. It never goes into your tile.</span>
    </section>
  );
}

type Sheet = null | "brush" | "colour" | "layers" | "history" | "more" | "tools" | "lens" | "timelapse" | "keys";

export function Paint({ slot, slotNumber, draftId, onBack, onDone }: { slot: SlotColour; slotNumber: number; draftId: string; onBack: () => void; onDone: (r: PaintResult) => void }) {
  const [engine, setEngine] = useState<PaintEngine | null>(null);
  const [tick, setTick] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [match, setMatch] = useState(1);
  const [saved, setSaved] = useState(false);
  const [full, setFull] = useState(false);
  const [textAt, setTextAt] = useState<null | { x: number; y: number }>(null);
  const [text, setText] = useState("");
  const [textStyle, setTextStyle] = useState({ font: "serif" as FontId, size: 96, bold: false, italic: false, underline: false, strike: false, align: "left" as CanvasTextAlign, background: false });
  const [filter, setFilter] = useState<FilterName>("hsb");
  const [params, setParams] = useState<Record<string, number>>({});
  const [feather, setFeather] = useState(8);
  const [view, setView] = useState({ z: 1, x: 0, y: 0, r: 0, flip: false });
  const [hueMemo, setHueMemo] = useState(0);
  const [editing, setEditing] = useState<"primary" | "secondary">("primary");
  const [harmonyKind, setHarmonyKind] = useState<"complementary" | "analogous" | "triadic" | "split" | "tetradic">("complementary");
  const [brushSet, setBrushSet] = useState("Painting");
  const [renaming, setRenaming] = useState(false);
  const [penOnly, setPenOnly] = useState(false);
  const [penSeen, setPenSeen] = useState(false);
  const [avgHex, setAvgHex] = useState(slot.hex);
  const [lensView, setLensView] = useState<"afar" | "close" | "squint">("afar");
  const [lensImg, setLensImg] = useState<string | null>(null);
  const [reference, setReference] = useState<{ url: string; x: number; y: number } | null>(null);
  const [mine, setMine] = useState(() => myBrushes());
  const [frames, setFrames] = useState(0);
  const [showReviewer, setShowReviewer] = useState(true);
  const [recorder, setRecorder] = useState<TimelapseRecorder | null>(null);
  const pan = useRef<null | { x: number; y: number; view: { z: number; x: number; y: number; r: number; flip: boolean } }>(null);
  const space = useRef(false);
  const refInput = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>());
  const gesture = useRef<null | { d: number; a: number; mx: number; my: number; view: typeof view; count: number; t: number; moved: boolean }>(null);
  const stroke = useRef<{ x: number; y: number; t: number; moved: boolean; still?: number; hold?: number } | null>(null);
  const timers = useRef<{ save?: number; match?: number; notice?: number }>({});

  const attach = useCallback((el: HTMLCanvasElement | null) => {
    if (!el || el.dataset.ready) return;
    el.dataset.ready = "1";
    const e = new PaintEngine(el, mosaicConfig.paint.canvasPx, slot.hex, { maxLayers: mosaicConfig.paint.maxLayers, undoLimit: mosaicConfig.paint.undoSteps });
    const measure = () => {
      const avg = averageColour(pixels(squareCanvas(e.flatten(), 32)).data);
      setMatch(colourMatch(avg, hexToRgb(slot.hex)));
      setAvgHex(rgbToHex(avg));
    };
    const rec = new TimelapseRecorder();
    setRecorder(rec);
    e.onStep = () => { rec.capture(e.flatten()); setFrames(rec.steps); };
    e.onChange = () => {
      setTick((t) => t + 1);
      window.clearTimeout(timers.current.match);
      timers.current.match = window.setTimeout(measure, 250);
      window.clearTimeout(timers.current.save);
      setSaved(false);
      timers.current.save = window.setTimeout(() => {
        if (e.floating || e.pendingCurve) return;
        void e.serialize().then((d) => saveDraft(draftId, d)).then((ok) => setSaved(ok !== null));
      }, 1500);
    };
    e.onNotice = (msg) => {
      setNotice(msg);
      window.clearTimeout(timers.current.notice);
      timers.current.notice = window.setTimeout(() => setNotice(null), 3500);
    };
    e.onTextTap = (x, y) => setTextAt({ x, y });
    setEngine(e);
    void loadDraft(draftId).then((d) => { if (d) void e.restore(d); });
  }, [slot.hex, draftId]);

  /** Screen point to canvas pixels, undoing the view's pan, zoom, turn and flip. */
  const toCanvas = (ev: { clientX: number; clientY: number }) => {
    const st = stageRef.current!;
    const r = st.getBoundingClientRect(), w = st.clientWidth, size = mosaicConfig.paint.canvasPx;
    let x = ev.clientX - (r.left + r.width / 2) - view.x, y = ev.clientY - (r.top + r.height / 2) - view.y;
    const a = (-view.r * Math.PI) / 180;
    [x, y] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    x /= view.z; y /= view.z;
    if (view.flip) x = -x;
    return { x: ((x + w / 2) / w) * size, y: ((y + w / 2) / w) * size };
  };
  const pressureOf = (ev: PointerEvent) => (ev.pointerType === "pen" ? ev.pressure || 0.5 : 1);
  /** Canvas point with pressure, the pen's tilt and lean (turned with the view), and the event time for speed. */
  const pointOf = (ev: PointerEvent): Point => {
    let tilt = 0, azimuth: number | undefined;
    if (ev.pointerType === "pen") {
      const alt = (ev as PointerEvent & { altitudeAngle?: number }).altitudeAngle, azi = (ev as PointerEvent & { azimuthAngle?: number }).azimuthAngle;
      if (typeof alt === "number" && alt < Math.PI / 2 - 0.02) tilt = 1 - alt / (Math.PI / 2);
      else if (ev.tiltX || ev.tiltY) tilt = Math.atan(Math.hypot(Math.tan((ev.tiltX * Math.PI) / 180), Math.tan((ev.tiltY * Math.PI) / 180))) / (Math.PI / 2);
      if (tilt > 0.03) {
        azimuth = typeof azi === "number" ? azi : Math.atan2(Math.tan((ev.tiltY * Math.PI) / 180), Math.tan((ev.tiltX * Math.PI) / 180));
        azimuth -= (view.r * Math.PI) / 180;
        if (view.flip) azimuth = Math.PI - azimuth;
      }
    }
    return { ...toCanvas(ev), pressure: pressureOf(ev), tilt, azimuth, t: ev.timeStamp };
  };
  const clearStrokeTimers = () => { const s = stroke.current; if (s) { window.clearTimeout(s.still); window.clearTimeout(s.hold); } };

  function onDown(ev: ReactPointerEvent<HTMLCanvasElement>) {
    if (!engine) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, type: ev.pointerType });
    const n = pointers.current.size;
    if (n >= 2) {
      clearStrokeTimers();
      stroke.current = null;
      engine.cancel();
      const [a, b] = [...pointers.current.values()];
      const prev = gesture.current;
      gesture.current = { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view, count: Math.max(n, prev?.count ?? 0), t: prev?.t ?? ev.timeStamp, moved: prev?.moved ?? false };
      pan.current = null;
      return;
    }
    if (ev.pointerType === "pen" && !penSeen) { setPenSeen(true); setPenOnly(true); engine.onNotice("Pen found: it draws, and your fingers move the canvas. Change this in Brushes."); }
    // Pen-only drawing, Space + drag, or the middle button: move the canvas instead of painting.
    if ((penOnly && ev.pointerType === "touch") || (space.current && ev.pointerType === "mouse") || ev.button === 1) {
      pan.current = { x: ev.clientX, y: ev.clientY, view };
      return;
    }
    const p = pointOf(ev.nativeEvent);
    engine.down(p, ev.pointerType, ev.altKey);
    stroke.current = { x: ev.clientX, y: ev.clientY, t: ev.timeStamp, moved: false };
    if (engine.tool === "brush" && ev.pointerType !== "mouse") {
      stroke.current.hold = window.setTimeout(() => { if (stroke.current && !stroke.current.moved) engine.holdPick({ ...p, pressure: 1 }); }, 600);
    }
  }

  function onMove(ev: ReactPointerEvent<HTMLCanvasElement>) {
    if (!engine || !pointers.current.has(ev.pointerId)) return;
    pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, type: ev.pointerType });
    const g = gesture.current;
    if (g && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (Math.abs(d - g.d) > 12 || Math.hypot(mx - g.mx, my - g.my) > 12) g.moved = true;
      if (g.moved) {
        let turn = ((ang - g.a) * 180) / Math.PI;
        if (Math.abs(turn) < 8) turn = 0;
        setView({ ...g.view, z: Math.max(0.5, Math.min(8, (g.view.z * d) / Math.max(1, g.d))), x: g.view.x + mx - g.mx, y: g.view.y + my - g.my, r: g.view.r + turn });
      }
      return;
    }
    const pn = pan.current;
    if (pn) { setView({ ...pn.view, x: pn.view.x + ev.clientX - pn.x, y: pn.view.y + ev.clientY - pn.y }); return; }
    const s = stroke.current;
    if (s && Math.hypot(ev.clientX - s.x, ev.clientY - s.y) > 6) {
      s.moved = true;
      window.clearTimeout(s.hold);
      window.clearTimeout(s.still);
      if (engine.tool === "brush" || engine.tool === "eraser") s.still = window.setTimeout(() => engine.quickShape(), 550);
      s.x = ev.clientX; s.y = ev.clientY;
    }
    const native = ev.nativeEvent;
    const list = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    engine.move((list.length ? list : [native]).map(pointOf));
  }

  function onUp(ev: ReactPointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(ev.pointerId);
    if (pan.current) { if (pointers.current.size === 0) pan.current = null; return; }
    const g = gesture.current;
    if (g) {
      if (pointers.current.size === 0) {
        if (!g.moved && ev.timeStamp - g.t < 350) { if (g.count === 2) engine?.undo(); if (g.count >= 3) engine?.redo(); }
        gesture.current = null;
      }
      return;
    }
    clearStrokeTimers();
    stroke.current = null;
    engine?.up();
  }

  // Keyboard shortcuts on computers. Typing in a field never triggers them.
  useEffect(() => {
    if (!engine) return;
    const en = engine;
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      const k = ev.key.toLowerCase(), mod = ev.ctrlKey || ev.metaKey;
      if (ev.key === " ") { space.current = true; ev.preventDefault(); return; }
      if (mod && k === "z") { ev.preventDefault(); if (ev.shiftKey) en.redo(); else en.undo(); return; }
      if (mod && k === "y") { ev.preventDefault(); en.redo(); return; }
      if (mod && ev.shiftKey && k === "n") { ev.preventDefault(); if (en.canAddLayer) en.addLayer(); return; }
      if (mod || ev.altKey) return;
      if (k === "[") { en.configure({ brushSize: Math.max(1, Math.round(en.brushSize / 1.2)) }); return; }
      if (k === "]") { en.configure({ brushSize: Math.min(300, Math.round(en.brushSize * 1.2 + 1)) }); return; }
      if (k === "x") { en.swapColours(); return; }
      if (k === "0") { setView({ z: 1, x: 0, y: 0, r: 0, flip: false }); return; }
      if (k === "h") { setView((v) => ({ ...v, flip: !v.flip })); return; }
      if (k === "p") { setSheet((x) => (x === "timelapse" ? null : "timelapse")); return; }
      if (k === "m") { setSheet((x) => (x === "lens" ? null : "lens")); return; }
      if (ev.key === "?") { setSheet("keys"); return; }
      if (k === "escape") { setSheet(null); return; }
      const t = KEYS[k];
      if (t) en.setTool(t);
    };
    const onKeyUp = (ev: KeyboardEvent) => { if (ev.key === " ") space.current = false; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); };
  }, [engine]);

  // The Mosaic lens shows the real square close up: a small copy, refreshed as you paint.
  useEffect(() => {
    if (sheet !== "lens" || !engine) return;
    const id = window.setTimeout(() => setLensImg(squareCanvas(engine.flatten(), 96).toDataURL("image/jpeg", 0.85)), 120);
    return () => window.clearTimeout(id);
  }, [sheet, tick, engine]);

  function onWheel(ev: ReactWheelEvent) {
    setView((v) => (ev.shiftKey ? { ...v, r: v.r + (ev.deltaY < 0 ? 5 : -5) } : { ...v, z: Math.max(0.5, Math.min(8, v.z * (ev.deltaY < 0 ? 1.1 : 0.9))) }));
  }

  const e = engine;
  const tool = TOOLS.find((t) => t.id === (e?.tool ?? "brush"))!;
  const palette = paletteFor(slot);
  const editColour = e ? (editing === "primary" ? e.colour : e.colour2) : slot.hex;
  const setEditColour = (hex: string) => { if (!e) return; if (editing === "primary") e.setColour(hex); else e.setColour2(hex); };
  const [h0, s0, v0] = hexToHsv(editColour);
  const hue = s0 === 0 || v0 === 0 ? hueMemo : h0;
  const fontFamily = (k: FontId) => {
    const css = getComputedStyle(document.body);
    if (k === "serif") return css.getPropertyValue("--serif").trim() || "Georgia, serif";
    if (k === "sans") return css.getPropertyValue("--sans").trim() || "system-ui, sans-serif";
    if (k === "mono") return "ui-monospace, 'Courier New', monospace";
    if (k === "hand") return "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";
    return "Impact, 'Arial Black', sans-serif";
  };
  const matchOk = match >= mosaicConfig.minColourMatch;
  const filterDef = FILTERS.find((f) => f.id === filter)!;
  const param = (p: Param) => params[`${filter}.${p.key}`] ?? p.value;
  const sizeTool = e && ["brush", "retouch", "eraser", "shapes"].includes(e.tool);
  const opacityTool = e && ["brush", "eraser", "gradient"].includes(e.tool);
  const close = () => setSheet(null);

  function svPick(ev: ReactPointerEvent<HTMLDivElement>) {
    if (!e || (ev.type === "pointermove" && ev.buttons === 0)) return;
    const r = ev.currentTarget.getBoundingClientRect();
    setEditColour(hsvToHex(hue, Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, 1 - (ev.clientY - r.top) / r.height))));
  }

  async function finish() {
    if (!e) return;
    e.applyTransform();
    if (e.tool === "shapes") e.setTool("brush");
    window.clearTimeout(timers.current.save);
    void e.serialize().then((d) => saveDraft(draftId, d));
    const strip = showReviewer && recorder ? await recorder.strip().catch(() => null) : null;
    onDone({ canvas: e.flatten(), stats: paintStats(e.records), strip });
  }

  function saveBrush() {
    if (!e) return;
    const name = window.prompt("Name your brush", `${e.brush.name.replace(/ \(mine\)$/, "")} (mine)`);
    if (!name?.trim()) return;
    const b = saveMyBrush({ ...e.brush, name: name.trim().slice(0, 30), size: e.brushSize, opacity: e.brushOpacity, hardness: e.hardness, flow: e.flow, smoothing: e.smoothing, sizeJitter: e.sizeJitter, opacityJitter: e.opacityJitter, scatter: e.scatter, taper: e.taper, wet: e.wet });
    setMine(myBrushes());
    setBrushSet(MY_SET);
    e.setBrush(b.id);
  }

  function openReference(f: File | undefined) {
    if (!f || !f.type.startsWith("image/")) return;
    if (reference) URL.revokeObjectURL(reference.url);
    setReference({ url: URL.createObjectURL(f), x: 16, y: 96 });
    close();
  }

  const pickTool = (id: Tool) => {
    e?.setTool(id);
    if (id !== "text") setTextAt(null);
    if (sheet === "tools") close();
    // Phones have no room for the hint line, so it shows briefly over the canvas instead.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 959px)").matches) e?.onNotice(TOOLS.find((t) => t.id === id)?.hint ?? "");
  };

  function download() {
    if (!e) return;
    e.flatten().toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `tessera-slot-${slotNumber}.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  }

  const brushPanel = e && (
    <Panel id="brush" title="Brushes" onClose={close} active={sheet === "brush"}>
      <div className="pt-brushes">
        <div role="tablist" aria-label="Brush sets" className="pt-sets">
          {[...BRUSH_SETS, MY_SET].map((s) => <button key={s} type="button" role="tab" aria-selected={brushSet === s} onClick={() => setBrushSet(s)}>{s}</button>)}
        </div>
        <div className="pt-brushlist">
          {brushSet === MY_SET && mine.length === 0 && <p className="pt-note">Tune a brush below, then Save as my brush. It stays on this device.</p>}
          {(brushSet === MY_SET ? mine : BRUSHES.filter((b) => b.set === brushSet)).map((b) => (
            <button key={b.id} type="button" aria-pressed={e.brush.id === b.id} onClick={() => { e.setBrush(b.id); if (e.tool !== "brush" && e.tool !== "eraser" && e.tool !== "retouch") e.setTool("brush"); }}>
              <span>{b.name}{b.wet ? <small> · mixes</small> : null}</span>
              <svg width="100%" height="22" viewBox="0 0 200 22" preserveAspectRatio="none" aria-hidden="true"><path d="M6 15 C 40 4, 80 20, 120 10 S 180 5, 194 12" fill="none" stroke="currentColor" strokeWidth={b.texture === "pixel" ? 2 : Math.max(1.5, b.size / 8)} strokeOpacity={b.opacity * (0.4 + b.flow * 0.6)} strokeDasharray={b.texture === "spray" || b.scatter ? "1 3" : b.texture === "scatter" ? "2 2" : b.texture === "grain" ? "1 1" : undefined} strokeLinecap={b.texture === "pixel" ? "square" : "round"} /></svg>
            </button>
          ))}
        </div>
      </div>
      <div className="pt-settings">
        <span className="pt-label">Brush studio · {e.brush.name}</span>
        <Range label="Size" value={e.brushSize} min={1} max={300} unit=" px" onChange={(v) => e.configure({ brushSize: v })} />
        <Range label="Opacity" value={e.brushOpacity * 100} min={1} max={100} unit="%" onChange={(v) => e.configure({ brushOpacity: v / 100 })} />
        <Range label="Hardness" value={e.hardness * 100} min={0} max={100} unit="%" onChange={(v) => e.configure({ hardness: v / 100 })} />
        <Range label="Flow" value={e.flow * 100} min={1} max={100} unit="%" onChange={(v) => e.configure({ flow: v / 100 })} />
        <Range label="Size jitter" value={e.sizeJitter * 100} min={0} max={100} unit="%" onChange={(v) => e.configure({ sizeJitter: v / 100 })} />
        <Range label="Opacity jitter" value={e.opacityJitter * 100} min={0} max={100} unit="%" onChange={(v) => e.configure({ opacityJitter: v / 100 })} />
        <Range label="Scatter" value={e.scatter * 100} min={0} max={200} unit="%" onChange={(v) => e.configure({ scatter: v / 100 })} />
        <Range label="Taper" value={e.taper} min={0} max={200} unit=" px" onChange={(v) => e.configure({ taper: v })} />
        <Range label="Wet mix" value={e.wet * 100} min={0} max={100} unit="%" onChange={(v) => e.configure({ wet: v / 100 })} />
        <span className="pt-label">Steadiness</span>
        <Seg label="Stabiliser" value={e.stabiliser} options={STABILISERS} onChange={(v) => e.configure({ stabiliser: v })} />
        {e.stabiliser === "smooth" && <Range label="Smoothing" value={e.smoothing * 100} min={0} max={100} unit="%" onChange={(v) => e.configure({ smoothing: v / 100 })} />}
        {e.stabiliser === "rope" && <Range label="Rope length" value={e.rope} min={5} max={160} unit=" px" onChange={(v) => e.configure({ rope: v })} />}
        <span className="pt-label">Pen</span>
        <Range label="Tilt shading" value={e.tiltShade * 100} min={0} max={100} unit="%" onChange={(v) => e.configure({ tiltShade: v / 100 })} />
        <Range label="Thin when fast" value={e.speedThin * 100} min={0} max={100} unit="%" onChange={(v) => e.configure({ speedThin: v / 100 })} />
        <div className="pt-row">
          <Toggle label="Nib follows the pen" on={e.nibFollowsPen} onChange={(v) => e.configure({ nibFollowsPen: v })} />
          <Toggle label="Pen draws, fingers move" on={penOnly} onChange={setPenOnly} />
        </div>
        <span className="pt-label">Paper</span>
        <Seg label="Paper" value={e.paper} options={PAPERS} onChange={(v) => e.configure({ paper: v })} />
        {e.paper !== "smooth" && <Range label="Grain" value={e.paperStrength * 100} min={0} max={100} unit="%" onChange={(v) => e.configure({ paperStrength: v / 100 })} />}
        <div className="pt-row">
          <button type="button" className="pt-btn pt-btn--primary" onClick={saveBrush}>Save as my brush</button>
          {e.brush.id.startsWith("my-") && <button type="button" className="pt-btn pt-btn--danger" onClick={() => { deleteMyBrush(e.brush.id); setMine(myBrushes()); e.setBrush("gouache"); }}>Delete {e.brush.name}</button>}
        </div>
      </div>
    </Panel>
  );

  const colourPanel = e && (
    <Panel id="colour" title="Colour" onClose={close} active={sheet === "colour"}>
      <div className="pt-pair">
        <button type="button" aria-pressed={editing === "primary"} onClick={() => setEditing("primary")}><i style={{ background: e.colour }} />Primary</button>
        <button type="button" aria-pressed={editing === "secondary"} onClick={() => setEditing("secondary")}><i style={{ background: e.colour2 }} />Secondary</button>
        <button type="button" className="pt-icon" aria-label="Swap primary and secondary" onClick={() => e.swapColours()}><Svg d={icon.swap} size={18} /></button>
      </div>
      <div className="pt-colour">
        <div className="pt-sv" role="slider" aria-label="Saturation and brightness" aria-valuenow={Math.round(v0 * 100)} aria-valuetext={`${Math.round(s0 * 100)}% saturation, ${Math.round(v0 * 100)}% brightness`} tabIndex={0}
          style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex(hue, 1, 1)})` }}
          onPointerDown={(ev) => { ev.currentTarget.setPointerCapture(ev.pointerId); svPick(ev); }} onPointerMove={svPick}>
          <span style={{ left: `${s0 * 100}%`, top: `${(1 - v0) * 100}%`, background: editColour }} />
        </div>
        <div className="pt-colour__side">
          <div className="pt-compare"><span style={{ background: editColour }} /><span style={{ background: slot.hex }} /></div>
          <div className="pt-compare__labels"><span>Now</span><span>Slot</span></div>
          <label className="pt-hex">Hex
            <input key={editColour} defaultValue={editColour.toUpperCase()} maxLength={7} onBlur={(ev) => { const v = ev.target.value.trim(); if (isHex(v)) setEditColour(v.startsWith("#") ? v.toLowerCase() : `#${v.toLowerCase()}`); }} onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }} />
          </label>
        </div>
      </div>
      <Range label="Hue" value={Math.round(hue)} min={0} max={359} unit="°" onChange={(h) => { setHueMemo(h); setEditColour(hsvToHex(h, s0 || 0.6, v0 || 0.8)); }} />
      <span className="pt-label">Made from your slot colour</span>
      <div className="pt-swatches" role="radiogroup" aria-label="Colours from your slot">
        {palette.map((c) => <button key={c.label} type="button" role="radio" aria-checked={editColour.toLowerCase() === c.hex.toLowerCase()} aria-label={c.label} style={{ background: c.hex }} onClick={() => setEditColour(c.hex)} />)}
      </div>
      <span className="pt-label">Harmony</span>
      <select className="pt-select-input" aria-label="Harmony" value={harmonyKind} onChange={(ev) => setHarmonyKind(ev.target.value as typeof harmonyKind)}>
        <option value="complementary">Complementary</option><option value="analogous">Analogous</option><option value="triadic">Triadic</option><option value="split">Split complementary</option><option value="tetradic">Tetradic</option>
      </select>
      <div className="pt-swatches">{harmony(editColour, harmonyKind).map((c, i) => <button key={`${c}-${i}`} type="button" aria-label={`Harmony colour ${c}`} style={{ background: c }} onClick={() => setEditColour(c)} />)}</div>
      {e.recent.length > 0 && <><span className="pt-label">Recent</span>
        <div className="pt-swatches pt-swatches--small">{e.recent.map((c) => <button key={c} type="button" aria-label={`Recent colour ${c}`} style={{ background: c }} onClick={() => setEditColour(c)} />)}</div></>}
      <div className="pt-row"><Toggle label="Stay in my colour" on={e.colourGuard} onChange={(v) => e.configure({ colourGuard: v })} /><button type="button" className="pt-btn" onClick={() => setSheet("lens")}>Mosaic lens</button></div>
      <p className="pt-note">{e.colourGuard ? "Colours far from your slot are pulled back toward it as you pick them, so the tile always fits." : `Any colour is allowed. The meter shows how close the whole tile stays to slot ${slotNumber}.`}</p>
    </Panel>
  );

  const l = e?.layer;
  const layersPanel = e && l && (
    <Panel id="layers" title={<>Layers <small>{e.layers.length} of {e.layerLimit}</small></>} onClose={close} active={sheet === "layers"}>
      <ol className="pt-layers">
        {e.layers.map((x, i) => ({ x, i })).reverse().map(({ x, i }) => (
          <li key={x.id} aria-current={i === e.current}>
            <button type="button" className="pt-layer" onClick={() => e.selectLayer(i)}>
              <LayerThumb key={`${x.id}-${tick}`} source={x.canvas} />
              {x.mask && <LayerThumb key={`${x.id}-m-${tick}`} source={x.mask} mask />}
              <span className="pt-layer__text"><span>{x.name}{x.reference ? " · reference" : ""}</span><small>{x.locked ? "Your slot colour · locked" : [BLENDS.find((b) => b.id === x.blend)?.label, `${Math.round(x.opacity * 100)}%`, x.clip && "clipped", x.alphaLock && "alpha locked", x.lockAll && "locked", x.editMask && "editing mask"].filter(Boolean).join(" · ")}</small></span>
            </button>
            <button type="button" className="pt-eye" aria-pressed={x.visible} aria-label={`${x.visible ? "Hide" : "Show"} ${x.name}`} onClick={() => e.setLayerProp(i, "visible", !x.visible)}><Svg d={x.visible ? icon.eye : icon.eyeOff} size={18} /></button>
          </li>
        ))}
      </ol>
      {!l.locked && <div className="pt-settings">
        {renaming
          ? <input className="pt-input" autoFocus defaultValue={l.name} maxLength={30} aria-label="Layer name" onBlur={(ev) => { if (ev.target.value.trim()) e.setLayerProp(e.current, "name", ev.target.value.trim()); setRenaming(false); }} onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }} />
          : <button type="button" className="pt-label pt-rename" onClick={() => setRenaming(true)}>{l.name} · rename</button>}
        <Range label="Opacity" value={l.opacity * 100} min={0} max={100} unit="%" onChange={(v) => e.setLayerProp(e.current, "opacity", v / 100)} />
        <label className="pt-select">Blend
          <select value={l.blend} onChange={(ev) => e.setLayerProp(e.current, "blend", ev.target.value as Blend)}>{BLENDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>
        </label>
        <div className="pt-row">
          <Toggle label="Lock alpha" on={l.alphaLock} onChange={(v) => e.setLayerProp(e.current, "alphaLock", v)} />
          <Toggle label="Clip to below" on={l.clip} onChange={(v) => e.setLayerProp(e.current, "clip", v)} />
          <Toggle label="Lock layer" on={l.lockAll} onChange={(v) => e.setLayerProp(e.current, "lockAll", v)} />
          <Toggle label="Reference" on={l.reference} onChange={(v) => e.setLayerProp(e.current, "reference", v)} />
        </div>
        <div className="pt-row">
          {!l.mask ? <button type="button" className="pt-btn" onClick={() => e.addMask()}>Add mask</button> : <>
            <Toggle label={l.editMask ? "Painting the mask" : "Paint the mask"} on={l.editMask} onChange={(v) => e.setLayerProp(e.current, "editMask", v)} />
            <button type="button" className="pt-btn" onClick={() => e.removeMask(true)}>Apply mask</button>
            <button type="button" className="pt-btn" onClick={() => e.removeMask(false)}>Delete mask</button>
          </>}
        </div>
      </div>}
      <div className="pt-grid3">
        <button type="button" className="pt-btn pt-btn--primary" disabled={!e.canAddLayer} onClick={() => e.addLayer()}>New layer</button>
        <button type="button" className="pt-btn" disabled={!e.canAddLayer || l.locked} onClick={() => e.duplicateLayer()}>Duplicate</button>
        <button type="button" className="pt-btn" disabled={e.current <= 1} onClick={() => e.mergeDown()}>Merge down</button>
        <button type="button" className="pt-btn" disabled={l.locked || e.current >= e.layers.length - 1} onClick={() => e.moveLayer(1)}>Move up</button>
        <button type="button" className="pt-btn" disabled={e.current <= 1} onClick={() => e.moveLayer(-1)}>Move down</button>
        <button type="button" className="pt-btn pt-btn--danger" disabled={l.locked || e.layers.length <= 2} onClick={() => e.deleteLayer()}>Delete</button>
        <button type="button" className="pt-btn" disabled={l.locked} onClick={() => e.fillSelected()}>Fill layer</button>
        <button type="button" className="pt-btn" disabled={l.locked} onClick={() => e.clearSelected()}>Clear layer</button>
        <button type="button" className="pt-btn" disabled={e.layers.length <= 2} onClick={() => e.flattenLayers()}>Flatten</button>
      </div>
    </Panel>
  );

  const hist = e?.history;
  const historyPanel = e && hist && (
    <Panel id="history" title="History" onClose={close} active={sheet === "history"}>
      <ol className="pt-history">
        <li><button type="button" aria-current={hist.applied === 0} onClick={() => e.jumpTo(0)}>Start</button></li>
        {hist.labels.map((label, i) => <li key={i}><button type="button" aria-current={hist.applied === i + 1} className={i + 1 > hist.applied ? "is-future" : ""} onClick={() => e.jumpTo(i + 1)}>{label}</button></li>)}
      </ol>
      <p className="pt-note">Tap a step to go back to it. The last {mosaicConfig.paint.undoSteps} steps are kept. Two-finger tap undoes, three-finger tap redoes.</p>
    </Panel>
  );

  const morePanel = e && (
    <Panel id="more" title="Canvas" onClose={close} active={sheet === "more"} modal>
      <div className="pt-grid3">
        <button type="button" className="pt-btn" onClick={() => { setFull(true); close(); }}>Full screen</button>
        <button type="button" className="pt-btn" onClick={() => setView((v) => ({ ...v, r: v.r - 15 }))}>Turn left</button>
        <button type="button" className="pt-btn" onClick={() => setView((v) => ({ ...v, r: v.r + 15 }))}>Turn right</button>
        <button type="button" className="pt-btn" onClick={() => setView((v) => ({ ...v, flip: !v.flip }))}>Flip view</button>
        <button type="button" className="pt-btn" onClick={() => setView((v) => ({ ...v, z: Math.min(8, v.z * 1.5) }))}>Zoom in</button>
        <button type="button" className="pt-btn" onClick={() => setView({ z: 1, x: 0, y: 0, r: 0, flip: false })}>Reset view</button>
        <button type="button" className="pt-btn" onClick={download}>Save a copy</button>
        <button type="button" className="pt-btn" onClick={() => e.clearSelected()} disabled={l?.locked}>Clear layer</button>
        <button type="button" className="pt-btn" onClick={() => e.flattenLayers()} disabled={e.layers.length <= 2}>Flatten</button>
        <button type="button" className="pt-btn" onClick={() => refInput.current?.click()}>Reference photo</button>
        <button type="button" className="pt-btn" onClick={() => setSheet("timelapse")}>Timelapse</button>
        <button type="button" className="pt-btn" onClick={() => setSheet("keys")}>Shortcuts</button>
      </div>
      <div className="pt-row"><Toggle label="Pen draws, fingers move the canvas" on={penOnly} onChange={setPenOnly} /></div>
      <p className="pt-note">Flip view only mirrors what you see, to check your drawing. Pinch to zoom, twist with two fingers to turn, Shift and scroll to turn on a computer.</p>
    </Panel>
  );

  const toolsPanel = e && (
    <Panel id="tools" title="All tools" onClose={close} active={sheet === "tools"} modal>
      <div className="pt-alltools">
        {TOOLS.filter((t) => !DOCK.includes(t.id)).map((t) => <button key={t.id} type="button" aria-pressed={e.tool === t.id} onClick={() => pickTool(t.id)}><Svg d={t.d} /><span>{t.label}</span></button>)}
        <button type="button" onClick={() => refInput.current?.click()}><Svg d={icon.reference} /><span>Reference</span></button>
        <button type="button" onClick={() => setSheet("timelapse")}><Svg d={icon.timelapse} /><span>Timelapse</span></button>
        <button type="button" onClick={() => setSheet("lens")}><Svg d={icon.lens} /><span>Mosaic lens</span></button>
        <button type="button" onClick={() => setSheet("more")}><Svg d={icon.more} /><span>Canvas</span></button>
      </div>
    </Panel>
  );

  const lensCells = lensNeighbours(slot.hex);
  const lensPanel = e && (
    <Panel id="lens" title={<>Mosaic lens <small>New</small></>} onClose={close} active={sheet === "lens"} modal>
      <p className="pt-note">How your square reads from across the room, beside squares in colours like yours. They’re stand-ins: nobody sees the real picture until the reveal.</p>
      <div className={`pt-lens${lensView === "squint" ? " is-squint" : ""}`} role="img" aria-label={`Your square in the middle of 48 squares in colours like slot ${slotNumber}, ${lensView === "close" ? "close up" : lensView === "squint" ? "blurred as if squinting" : "from afar"}`}>
        {lensCells.map((c, i) => i === 24
          ? <span key={i} className="is-mine" style={lensView === "close" && lensImg ? { backgroundImage: `url(${lensImg})`, backgroundSize: "cover" } : { background: avgHex }} />
          : <span key={i} style={{ background: c }} />)}
      </div>
      <Seg label="View" value={lensView} options={[{ id: "afar", label: "From afar" }, { id: "close", label: "Close up" }, { id: "squint", label: "Squint" }] as const} onChange={setLensView} />
      <div className="pt-lensmatch">
        <div className="split"><span>Colour match</span><b style={{ color: matchOk ? "#8fb093" : "#e0b070" }}>{Math.round(match * 100)}%</b></div>
        <span className="pt-meter__bar"><i style={{ width: `${Math.round(match * 100)}%`, background: matchOk ? "#8fb093" : "#e0b070" }} /></span>
        <div className="pt-row pt-note"><i className="pt-dot" style={{ background: slot.hex }} />Your slot <i className="pt-dot" style={{ background: avgHex }} />Your square, averaged</div>
        <p className="pt-note">{lensAdvice(avgHex, slot.hex, match)}</p>
      </div>
      <div className="pt-row"><Toggle label="Stay in my colour" on={e.colourGuard} onChange={(v) => e.configure({ colourGuard: v })} /><span className="pt-note">Pulls far-off colours back toward your slot as you pick them.</span></div>
    </Panel>
  );

  const timelapsePanel = e && (
    <Panel id="timelapse" title={<>Timelapse <small>{frames} step{frames === 1 ? "" : "s"}</small></>} onClose={close} active={sheet === "timelapse"} modal>
      {sheet === "timelapse" && <TimelapsePlayer recorder={recorder} frames={frames} slotHex={slot.hex} slotNumber={slotNumber} />}
      <div className="pt-row"><Toggle label="Show the reviewer" on={showReviewer} onChange={setShowReviewer} /><span className="pt-note">Eight frames go with your tile as proof it was painted by hand. Only Tessera’s reviewer sees them.</span></div>
      <p className="pt-note">Recorded on this device while you paint. Only your square is in it, never the hidden picture.</p>
    </Panel>
  );

  const keysPanel = e && (
    <Panel id="keys" title="Shortcuts" onClose={close} active={sheet === "keys"} modal>
      <dl className="pt-keys">{SHORTCUTS.map(([what, key]) => <div key={what}><dt>{what}</dt><dd><kbd>{key}</kbd></dd></div>)}</dl>
      <p className="pt-note">Two-finger tap undoes and three-finger tap redoes on touch screens.</p>
    </Panel>
  );

  const ts = textStyle;
  const options = e && (() => {
    switch (e.tool) {
      case "retouch": return <>
        <label className="pt-select">Mode<select value={e.retouchMode} onChange={(ev) => e.configure({ retouchMode: ev.target.value as RetouchMode })}>{RETOUCH.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
        {e.retouchMode !== "clone" && e.retouchMode !== "liquify" && <Range label="Strength" value={e.retouchStrength * 100} min={1} max={100} unit="%" onChange={(v) => e.configure({ retouchStrength: v / 100 })} />}
        {e.retouchMode === "clone" && <div className="pt-row"><Toggle label={e.settingCloneSource ? "Tap the source…" : "Set source"} on={e.settingCloneSource} onChange={(v) => e.configure({ settingCloneSource: v })} /><span className="pt-note">{e.cloneSource ? "Paint to copy from the cross. Alt-click also sets it." : "Tap where to copy from first."}</span></div>}
      </>;
      case "fill": return <>
        <Range label="Tolerance" value={e.fillTolerance} min={0} max={128} onChange={(v) => e.configure({ fillTolerance: v })} />
        <div className="pt-row"><Toggle label="Touching only" on={e.fillContiguous} onChange={(v) => e.configure({ fillContiguous: v })} /><Toggle label="Sample all layers" on={e.fillAllLayers} onChange={(v) => e.configure({ fillAllLayers: v })} />{e.selection && <button type="button" className="pt-btn" onClick={() => e.fillSelected()}>Fill selection</button>}</div>
      </>;
      case "recolour": return <>
        <Range label="Tolerance" value={e.fillTolerance} min={0} max={128} onChange={(v) => e.configure({ fillTolerance: v })} />
        <div className="pt-row"><Toggle label="Touching only" on={e.fillContiguous} onChange={(v) => e.configure({ fillContiguous: v })} /><span className="pt-note">New colour: the primary. Tap a colour on this layer.</span></div>
      </>;
      case "gradient": return <><Seg label="Gradient" value={e.gradientKind} options={GRADIENTS} onChange={(v) => e.configure({ gradientKind: v })} /><div className="pt-row"><Toggle label="To secondary colour" on={e.gradientToSecondary} onChange={(v) => e.configure({ gradientToSecondary: v })} /></div></>;
      case "shapes": return <>
        <label className="pt-select">Shape<select value={e.shape} onChange={(ev) => e.configure({ shape: ev.target.value as ShapeKind })}>{SHAPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        {e.shape !== "line" && e.shape !== "curve" && <Seg label="Style" value={e.shapeStyle} options={STYLES} onChange={(v) => e.configure({ shapeStyle: v })} />}
      </>;
      case "text": return textAt ? (
        <div className="pt-text">
          <textarea className="pt-input pt-textarea" autoFocus value={text} maxLength={120} rows={2} placeholder="Type here" onChange={(ev) => setText(ev.target.value)} aria-label="Text to place" />
          <label className="pt-select">Font<select value={ts.font} onChange={(ev) => setTextStyle({ ...ts, font: ev.target.value as FontId })}>{FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
          <Range label="Text size" value={ts.size} min={12} max={400} unit=" px" onChange={(v) => setTextStyle({ ...ts, size: v })} />
          <div className="pt-row">
            <Toggle label="Bold" on={ts.bold} onChange={(v) => setTextStyle({ ...ts, bold: v })} /><Toggle label="Italic" on={ts.italic} onChange={(v) => setTextStyle({ ...ts, italic: v })} />
            <Toggle label="Underline" on={ts.underline} onChange={(v) => setTextStyle({ ...ts, underline: v })} /><Toggle label="Strikethrough" on={ts.strike} onChange={(v) => setTextStyle({ ...ts, strike: v })} />
            <Toggle label="Background" on={ts.background} onChange={(v) => setTextStyle({ ...ts, background: v })} />
          </div>
          <Seg label="Align" value={ts.align as "left" | "center" | "right"} options={[{ id: "left", label: "Left" }, { id: "center", label: "Centre" }, { id: "right", label: "Right" }]} onChange={(v) => setTextStyle({ ...ts, align: v })} />
          <div className="pt-row"><button type="button" className="pt-btn" onClick={() => { setTextAt(null); setText(""); }}>Cancel</button><button type="button" className="pt-btn pt-btn--primary" disabled={!text.trim()} onClick={() => { e.placeText(text, textAt.x, textAt.y, { family: fontFamily(ts.font), size: ts.size, bold: ts.bold, italic: ts.italic, underline: ts.underline, strike: ts.strike, align: ts.align, background: ts.background }); setTextAt(null); setText(""); }}>Place text</button></div>
        </div>) : null;
      case "select": return <>
        <Seg label="Selection" value={e.selectKind} options={SELECTS} onChange={(v) => e.configure({ selectKind: v })} />
        {e.selectKind === "wand" && <Range label="Tolerance" value={e.fillTolerance} min={0} max={128} onChange={(v) => e.configure({ fillTolerance: v })} />}
        <div className="pt-row">
          <Toggle label="Add to selection" on={e.selectAdd} onChange={(v) => e.configure({ selectAdd: v })} />
          {e.selectKind === "polygon" && <button type="button" className="pt-btn" disabled={e.polygon.length < 3} onClick={() => e.closePolygon()}>Close shape</button>}
          <button type="button" className="pt-btn" onClick={() => e.selectAll()}>All</button>
          <button type="button" className="pt-btn" disabled={!e.selection && !e.polygon.length} onClick={() => e.deselect()}>None</button>
          <button type="button" className="pt-btn" disabled={!e.selection} onClick={() => e.invertSelection()}>Invert</button>
          <button type="button" className="pt-btn" onClick={() => e.selectLayerContents()}>Layer contents</button>
        </div>
        {e.selection && <>
          <div className="pt-row"><Range label="Feather" value={feather} min={1} max={60} unit=" px" onChange={setFeather} /><button type="button" className="pt-btn" onClick={() => e.featherSelection(feather)}>Feather</button></div>
          <div className="pt-row">
            <button type="button" className="pt-btn" onClick={() => e.copyToLayer(false)}>Copy to new layer</button>
            <button type="button" className="pt-btn" onClick={() => e.copyToLayer(true)}>Cut to new layer</button>
            <button type="button" className="pt-btn" onClick={() => e.fillSelected()}>Fill</button>
            <button type="button" className="pt-btn pt-btn--danger" onClick={() => e.clearSelected()}>Delete</button>
          </div>
        </>}
      </>;
      case "transform": {
        const t = e.floating?.t;
        return <>
          <Range label="Scale" value={(t?.scale ?? 1) * 100} min={5} max={400} unit="%" onChange={(v) => e.setTransform({ scale: v / 100 })} />
          <Range label="Turn" value={t?.rotate ?? 0} min={-180} max={180} unit="°" onChange={(v) => e.setTransform({ rotate: v })} />
          <Range label="Skew across" value={t?.skewX ?? 0} min={-60} max={60} unit="°" onChange={(v) => e.setTransform({ skewX: v })} />
          <Range label="Skew down" value={t?.skewY ?? 0} min={-60} max={60} unit="°" onChange={(v) => e.setTransform({ skewY: v })} />
          <Range label="Lean across" value={t?.perspX ?? 0} min={-80} max={80} unit="%" onChange={(v) => e.setTransform({ perspX: v })} />
          <Range label="Lean back" value={t?.perspY ?? 0} min={-80} max={80} unit="%" onChange={(v) => e.setTransform({ perspY: v })} />
          <div className="pt-row">
            <button type="button" className="pt-btn" onClick={() => e.setTransform({ flipH: !(t?.flipH ?? false) })}>Flip ↔</button>
            <button type="button" className="pt-btn" onClick={() => e.setTransform({ flipV: !(t?.flipV ?? false) })}>Flip ↕</button>
            <button type="button" className="pt-btn" onClick={() => e.setTransform({ rotate: ((t?.rotate ?? 0) + 90 + 180) % 360 - 180 })}>Turn 90°</button>
            <button type="button" className="pt-btn" disabled={!e.floating} onClick={() => e.cancelTransform()}>Cancel</button>
            <button type="button" className="pt-btn pt-btn--primary" disabled={!e.floating} onClick={() => e.applyTransform()}>Apply</button>
          </div>
        </>;
      }
      case "guides": return <>
        <Seg label="Guide" value={e.guide} options={GUIDES} onChange={(v) => e.configure({ guide: v })} />
        {(e.guide === "grid" || e.guide === "isometric") && <Range label="Spacing" value={e.guideSize} min={16} max={256} unit=" px" onChange={(v) => e.configure({ guideSize: v })} />}
        {e.guide === "perspective" && <p className="pt-note">Tap the canvas to move the vanishing point.</p>}
        <span className="pt-label">Mirror painting</span>
        <Seg label="Mirror" value={e.symmetry} options={SYMMETRY} onChange={(v) => e.configure({ symmetry: v })} />
      </>;
      case "filters": return <>
        <label className="pt-select">Filter<select value={filter} onChange={(ev) => setFilter(ev.target.value as FilterName)}>
          {(["Adjust", "Effects"] as const).map((g) => <optgroup key={g} label={g}>{FILTERS.filter((f) => f.group === g).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</optgroup>)}
        </select></label>
        {filterDef.params.map((p) => <Range key={`${filter}.${p.key}`} label={p.label} value={param(p)} min={p.min} max={p.max} step={p.step} unit={p.unit} onChange={(v) => setParams({ ...params, [`${filter}.${p.key}`]: v })} />)}
        <div className="pt-row">
          <button type="button" className="pt-btn" onClick={() => setParams(Object.fromEntries(Object.entries(params).filter(([k]) => !k.startsWith(`${filter}.`))))}>Reset</button>
          <button type="button" className="pt-btn pt-btn--primary" onClick={() => e.applyFilter(filter, Object.fromEntries(filterDef.params.map((p) => [p.key, param(p)])))}>Apply to {e.selection ? "selection" : e.layer.name}</button>
        </div>
      </>;
      default: return null;
    }
  })();

  return (
    <div className={`pt${full ? " pt--full" : ""}`}>
      <header className="pt-head">
        <button type="button" className="pt-icon" aria-label="Back to your slot" onClick={onBack}><Svg d={icon.back} /></button>
        <div className="pt-title"><span>Slot {slotNumber}</span><small>{saved ? "Draft saved on this device" : "Painting"}{l?.editMask ? " · mask" : ""}</small></div>
        <button type="button" className="pt-icon" aria-label="Undo" disabled={!e?.canUndo} onClick={() => e?.undo()}><Svg d={icon.undo} /></button>
        <button type="button" className="pt-icon" aria-label="Redo" disabled={!e?.canRedo} onClick={() => e?.redo()}><Svg d={icon.redo} /></button>
        <button type="button" className="pt-icon" aria-label="History" aria-pressed={sheet === "history"} onClick={() => setSheet(sheet === "history" ? null : "history")}><Svg d={icon.history} /></button>
        <button type="button" className="pt-icon" aria-label="Canvas options" aria-pressed={sheet === "more"} onClick={() => setSheet(sheet === "more" ? null : "more")}><Svg d={icon.more} size={22} /></button>
        <button type="button" className="pt-done" disabled={!e} onClick={finish}>Done</button>
      </header>

      <nav className="pt-tools" role="toolbar" aria-label="Tools">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" className={DOCK.includes(t.id) ? undefined : "is-extra"} aria-pressed={e?.tool === t.id} aria-keyshortcuts={Object.entries(KEYS).find(([, v]) => v === t.id)?.[0]?.toUpperCase()} onClick={() => pickTool(t.id)}>
            <Svg d={t.d} dash={t.id === "select"} /><span>{t.label}</span>
          </button>
        ))}
        <button type="button" className="is-extra" aria-pressed={!!reference} onClick={() => (reference ? setReference(null) : refInput.current?.click())}><Svg d={icon.reference} /><span>Reference</span></button>
        <button type="button" className="is-extra" aria-pressed={sheet === "timelapse"} aria-keyshortcuts="P" onClick={() => setSheet(sheet === "timelapse" ? null : "timelapse")}><Svg d={icon.timelapse} /><span>Replay</span></button>
        <button type="button" className="is-extra" aria-pressed={sheet === "lens"} aria-keyshortcuts="M" onClick={() => setSheet(sheet === "lens" ? null : "lens")}><Svg d={icon.lens} /><span>Lens</span></button>
        <button type="button" className="is-extra" aria-pressed={sheet === "keys"} onClick={() => setSheet(sheet === "keys" ? null : "keys")}><Svg d={icon.keys} /><span>Keys</span></button>
        <button type="button" className="pt-moretool" aria-pressed={sheet === "tools"} aria-label="More tools" onClick={() => setSheet(sheet === "tools" ? null : "tools")}>
          {e && !DOCK.includes(e.tool) ? <Svg d={tool.d} /> : <Svg d={icon.dots} />}<span>{e && !DOCK.includes(e.tool) ? tool.label : "More"}</span>
        </button>
      </nav>

      <main className="pt-stage" ref={stageRef} onWheel={onWheel}>
        <div className="pt-canvas-wrap" style={{ transform: `translate(${view.x}px, ${view.y}px) rotate(${view.r}deg) scale(${view.z * (view.flip ? -1 : 1)}, ${view.z})` }}>
          <canvas ref={attach} className="pt-canvas" aria-label={`Painting canvas for slot ${slotNumber}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={(ev) => ev.preventDefault()} />
        </div>
        {e && (sizeTool || opacityTool) && (
          <div className="pt-rail" role="group" aria-label="Brush size and opacity">
            {sizeTool && <input type="range" aria-label={e.tool === "shapes" ? "Line width" : "Brush size"} min={1} max={300} value={e.brushSize} onChange={(ev) => e.configure({ brushSize: Number(ev.target.value) })} />}
            <button type="button" className="pt-rail__pick" aria-label="Pick a colour from the canvas" aria-pressed={e.tool === "picker"} onClick={() => pickTool(e.tool === "picker" ? "brush" : "picker")}><Svg d={icon.picker} size={14} /></button>
            {opacityTool && <input type="range" aria-label="Opacity" min={1} max={100} value={Math.round(e.brushOpacity * 100)} onChange={(ev) => e.configure({ brushOpacity: Number(ev.target.value) / 100 })} />}
          </div>
        )}
        <button type="button" className="pt-lenschip" aria-label={`Mosaic lens: colour match ${Math.round(match * 100)} percent`} onClick={() => setSheet(sheet === "lens" ? null : "lens")}>
          <span className="pt-lenschip__grid" aria-hidden="true">{lensCells.slice(16, 19).concat(lensCells.slice(23, 26), lensCells.slice(30, 33)).map((c, i) => <i key={i} style={{ background: i === 4 ? avgHex : c }} className={i === 4 ? "is-mine" : undefined} />)}</span>
          <span style={{ color: matchOk ? "#8fb093" : "#e0b070" }}>{Math.round(match * 100)}%</span>
        </button>
        {(view.z !== 1 || view.r !== 0 || view.flip || view.x || view.y) ? <button type="button" className="pt-fit" onClick={() => setView({ z: 1, x: 0, y: 0, r: 0, flip: false })}>{Math.round(view.z * 100)}%{view.r ? ` · ${Math.round(view.r)}°` : ""}{view.flip ? " · flipped" : ""} · Reset</button> : null}
        {full && <button type="button" className="pt-exitfull" aria-label="Leave full screen" onClick={() => setFull(false)}><Svg d={icon.exitFull} /></button>}
        {notice && <p className="pt-notice" role="status">{notice}</p>}
      </main>

      <footer className="pt-status" aria-label="Status">
        <span>{Math.round(view.z * 100)}%</span>
        {view.r ? <span>Turned {Math.round(view.r)}°</span> : null}
        <span>{penSeen ? `Pen: pressure and tilt${penOnly ? ", fingers move" : ""}` : "Mouse or touch"}</span>
        {e && <span>Stabiliser: {e.stabiliser === "rope" ? `rope ${e.rope} px` : e.stabiliser === "smooth" ? `smooth ${Math.round(e.smoothing * 100)}%` : "off"}</span>}
        {e && <span>Paper: {PAPERS.find((x) => x.id === e.paper)?.label.toLowerCase()}</span>}
        {e && e.symmetry !== "off" && <span>Mirror on</span>}
        <span className="pt-status__rec"><i aria-hidden="true" />Timelapse · {frames}</span>
        <span className="pt-status__grow" />
        <button type="button" className="pt-status__keys" onClick={() => setSheet("keys")}>Shortcuts ?</button>
      </footer>

      <div className="pt-controls">
        <div className="pt-meter" aria-live="polite">
          <span className="pt-mini" aria-hidden="true"><i style={{ background: e?.colour ?? slot.hex }} /></span>
          <span className="pt-meter__bar"><i style={{ width: `${Math.round(match * 100)}%`, background: matchOk ? "#8fb093" : "#e0b070" }} /></span>
          <span style={{ color: matchOk ? "#8fb093" : "#e0b070" }}>Colour match {Math.round(match * 100)}%{matchOk ? "" : ", drifting"}</span>
        </div>
        {e && <>
          <div className="pt-sizes">
            {sizeTool && <Range label={e.tool === "shapes" ? "Line width" : "Size"} value={e.brushSize} min={1} max={300} unit=" px" onChange={(v) => e.configure({ brushSize: v })} />}
            {opacityTool && <Range label="Opacity" value={e.brushOpacity * 100} min={1} max={100} unit="%" onChange={(v) => e.configure({ brushOpacity: v / 100 })} />}
          </div>
          <div className="pt-quick">
            <button type="button" className="pt-chip" onClick={() => setSheet(sheet === "brush" ? null : "brush")}><span>{e.brush.name}</span><small>{e.brush.set}{e.paper !== "smooth" ? ` · ${PAPERS.find((x) => x.id === e.paper)?.label}` : ""}</small></button>
            <button type="button" className="pt-chip pt-chip--colour" aria-label="Colours" onClick={() => setSheet(sheet === "colour" ? null : "colour")}><i style={{ background: e.colour2 }} className="is-back" /><i style={{ background: e.colour }} /></button>
            <button type="button" className="pt-chip pt-chip--layers" aria-label="Layers" onClick={() => setSheet(sheet === "layers" ? null : "layers")}><Svg d={icon.layers} size={18} />{e.layers.length}</button>
          </div>
        </>}
        <p className="pt-hint">{tool.hint}</p>
        {options}
      </div>

      <aside className={`pt-aside${sheet ? " is-open" : ""}`} data-sheet={sheet ?? ""}>
        {sheet && <button type="button" className="pt-scrim" aria-label="Close panel" onClick={close} />}
        {toolsPanel}{lensPanel}{timelapsePanel}{keysPanel}{morePanel}{brushPanel}{colourPanel}{layersPanel}{historyPanel}
      </aside>

      <input ref={refInput} type="file" accept="image/*" className="sr-only" aria-label="Choose a reference photo" onChange={(ev) => { openReference(ev.target.files?.[0]); ev.target.value = ""; }} />
      {reference && <ReferenceWindow reference={reference} onMove={(x, y) => setReference({ ...reference, x, y })} onClose={() => { URL.revokeObjectURL(reference.url); setReference(null); }} />}
    </div>
  );
}
