"use client";
/**
 * The paint tool's engine: layers and masks, brushes, every tool, selections, transforms, filters,
 * guides, undo history and the stroke record. Plain canvas 2D, no libraries.
 * Coordinates are canvas pixels (0 to size).
 */
import { hexToRgb, rgbToHex, type RGB } from "../../colour.ts";
import { brushById, type BrushPreset } from "./brushes.ts";
import { colourMask, floodMask } from "./fill.ts";
import * as F from "./filters.ts";
import { curvePoints, shapePath, type ShapeKind } from "./shapes.ts";
import type { StrokeRecord } from "./effort.ts";

export type Tool = "brush" | "retouch" | "eraser" | "fill" | "gradient" | "shapes" | "text" | "select" | "transform" | "picker" | "guides" | "filters";
export type RetouchMode = "smudge" | "blur" | "sharpen" | "dodge" | "burn" | "saturate" | "desaturate" | "clone" | "liquify";
export type GradientKind = "linear" | "radial" | "angle" | "reflected" | "diamond";
export type SelectKind = "rect" | "ellipse" | "lasso" | "polygon" | "wand";
export type ShapeStyle = "outline" | "fill" | "both";
export type GuideKind = "none" | "grid" | "isometric" | "perspective" | "thirds";
export type Symmetry = "off" | "vertical" | "horizontal" | "quad" | "radial";
export type Blend = GlobalCompositeOperation;

export const BLENDS: { id: Blend; label: string }[] = [
  { id: "source-over", label: "Normal" }, { id: "multiply", label: "Multiply" }, { id: "screen", label: "Screen" }, { id: "overlay", label: "Overlay" },
  { id: "darken", label: "Darken" }, { id: "lighten", label: "Lighten" }, { id: "color-dodge", label: "Colour dodge" }, { id: "color-burn", label: "Colour burn" },
  { id: "hard-light", label: "Hard light" }, { id: "soft-light", label: "Soft light" }, { id: "difference", label: "Difference" }, { id: "exclusion", label: "Exclusion" },
  { id: "hue", label: "Hue" }, { id: "saturation", label: "Saturation" }, { id: "color", label: "Colour" }, { id: "luminosity", label: "Luminosity" },
];

export interface Layer {
  id: string;
  name: string;
  canvas: HTMLCanvasElement;
  /** Layer mask: where its alpha is low, the layer is hidden. */
  mask: HTMLCanvasElement | null;
  editMask: boolean;
  visible: boolean;
  opacity: number;
  blend: Blend;
  /** The background holds the slot colour and can't be painted on. */
  locked: boolean;
  /** Locked by the person painting. */
  lockAll: boolean;
  alphaLock: boolean;
  /** Clip to the layer below. */
  clip: boolean;
  /** Fill and the magic wand look at this layer only. */
  reference: boolean;
}

export interface Point { x: number; y: number; pressure: number }

export interface TextStyle { family: string; size: number; bold: boolean; italic: boolean; underline: boolean; strike: boolean; align: CanvasTextAlign; background: boolean }

export interface Transform { dx: number; dy: number; scale: number; rotate: number; skewX: number; skewY: number; flipH: boolean; flipV: boolean }
const NO_TRANSFORM: Transform = { dx: 0, dy: 0, scale: 1, rotate: 0, skewX: 0, skewY: 0, flipH: false, flipV: false };

export type FilterName =
  | "hsb" | "brightnessContrast" | "colourBalance" | "levels" | "invert" | "desaturate" | "posterize" | "threshold" | "gradientMap"
  | "blur" | "motionBlur" | "sharpen" | "noise" | "pixelate" | "halftone" | "bloom" | "chromatic" | "glitch" | "vignette" | "emboss";

interface Entry { label: string; undo(): void; redo(): void }

export interface DraftLayer { name: string; visible: boolean; opacity: number; blend: Blend; locked: boolean; lockAll: boolean; alphaLock: boolean; clip: boolean; reference: boolean; png: Blob | null; maskPng: Blob | null }
export interface Draft { size: number; layers: DraftLayer[]; current: number; records: StrokeRecord[]; colour: string; colour2: string; brushId: string }

const canvasOf = (size: number): HTMLCanvasElement => { const c = document.createElement("canvas"); c.width = c.height = size; return c; };
const ctx2d = (c: HTMLCanvasElement) => c.getContext("2d")!;
const copyOf = (src: HTMLCanvasElement) => { const c = canvasOf(src.width); ctx2d(c).drawImage(src, 0, 0); return c; };
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

type Gesture = {
  tool: Tool; start: number; input: string; last: Point; smooth: Point; since: number; travelled: number; origin: Point;
  dirty: [number, number, number, number]; carry?: HTMLCanvasElement; outline?: [number, number][]; straight?: boolean;
  wetColour?: RGB; cloneOffset?: [number, number]; moveFrom?: [number, number];
};

export class PaintEngine {
  readonly size: number;
  readonly slotHex: string;
  layers: Layer[] = [];
  current = 1;
  tool: Tool = "brush";
  brush: BrushPreset = brushById("gouache");
  brushSize = this.brush.size;
  brushOpacity = this.brush.opacity;
  hardness = this.brush.hardness;
  flow = this.brush.flow;
  smoothing = this.brush.smoothing;
  sizeJitter = 0;
  opacityJitter = 0;
  scatter = 0;
  taper = 0;
  wet = 0;
  /** Primary and secondary colours. */
  colour: string;
  colour2 = "#efe3cc";
  symmetry: Symmetry = "off";
  shape: ShapeKind = "rect";
  shapeStyle: ShapeStyle = "outline";
  gradientKind: GradientKind = "linear";
  gradientToSecondary = false;
  selectKind: SelectKind = "lasso";
  selectAdd = false;
  fillTolerance = 32;
  fillContiguous = true;
  fillAllLayers = true;
  retouchMode: RetouchMode = "smudge";
  retouchStrength = 0.5;
  cloneSource: [number, number] | null = null;
  settingCloneSource = false;
  guide: GuideKind = "none";
  guideSize = 64;
  vanishing: [number, number];
  /** Selection as a mask canvas: alpha 255 is fully selected. */
  selection: HTMLCanvasElement | null = null;
  /** Polygon selection being built, point by point. */
  polygon: [number, number][] = [];
  /** A pending curve: the line is drawn, the next drag bends it. */
  pendingCurve: { a: [number, number]; b: [number, number] } | null = null;
  /** What the transform tool has lifted, and how it's being moved. */
  floating: { canvas: HTMLCanvasElement; centre: [number, number]; t: Transform } | null = null;
  records: StrokeRecord[] = [];
  recent: string[] = [];
  onChange: () => void = () => {};
  onNotice: (msg: string) => void = () => {};
  onTextTap: (x: number, y: number) => void = () => {};

  private readonly display: HTMLCanvasElement;
  private readonly maxLayers: number;
  private readonly undoLimit: number;
  private readonly buffer: HTMLCanvasElement;
  private readonly live: HTMLCanvasElement;
  private readonly scratch: HTMLCanvasElement;
  private readonly scratch2: HTMLCanvasElement;
  private readonly before: HTMLCanvasElement;
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  private nextId = 1;
  private gesture: Gesture | null = null;
  private frame = 0;

  constructor(display: HTMLCanvasElement, size: number, slotHex: string, opts: { maxLayers: number; undoLimit: number }) {
    this.display = display;
    this.size = size;
    this.slotHex = slotHex;
    this.colour = slotHex;
    this.vanishing = [size / 2, size / 2];
    this.maxLayers = opts.maxLayers;
    this.undoLimit = opts.undoLimit;
    display.width = display.height = size;
    this.buffer = canvasOf(size);
    this.live = canvasOf(size);
    this.scratch = canvasOf(size);
    this.scratch2 = canvasOf(size);
    this.before = canvasOf(size);
    const bg = this.makeLayer("Background");
    bg.locked = true;
    const bctx = ctx2d(bg.canvas);
    bctx.fillStyle = slotHex;
    bctx.fillRect(0, 0, size, size);
    this.layers = [bg, this.makeLayer("Layer 1")];
    this.render();
  }

  /* ---------- state the screen reads ---------- */

  get layer(): Layer { return this.layers[this.current]; }
  get canUndo(): boolean { return this.undoStack.length > 0 || !!this.floating; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get canAddLayer(): boolean { return this.layers.length < this.maxLayers; }
  get layerLimit(): number { return this.maxLayers; }
  /** Every step, oldest first, and how many of them are currently applied. */
  get history(): { labels: string[]; applied: number } {
    return { labels: [...this.undoStack.map((e) => e.label), ...[...this.redoStack].reverse().map((e) => e.label)], applied: this.undoStack.length };
  }

  setBrush(id: string) {
    const b = brushById(id);
    this.brush = b;
    Object.assign(this, { brushSize: b.size, brushOpacity: b.opacity, hardness: b.hardness, flow: b.flow, smoothing: b.smoothing, sizeJitter: b.sizeJitter, opacityJitter: b.opacityJitter, scatter: b.scatter, taper: b.taper, wet: b.wet });
    this.changed();
  }

  /** Changes tool options and redraws. */
  configure(patch: Partial<Pick<PaintEngine,
    "brushSize" | "brushOpacity" | "hardness" | "flow" | "smoothing" | "sizeJitter" | "opacityJitter" | "scatter" | "taper" | "wet" |
    "fillTolerance" | "fillContiguous" | "fillAllLayers" | "symmetry" | "shape" | "shapeStyle" | "gradientKind" | "gradientToSecondary" |
    "selectKind" | "selectAdd" | "retouchMode" | "retouchStrength" | "settingCloneSource" | "guide" | "guideSize" | "vanishing">>) {
    if (patch.shape && patch.shape !== "curve") this.commitCurve();
    if (patch.selectKind && patch.selectKind !== "polygon") this.polygon = [];
    Object.assign(this, patch);
    this.render();
    this.changed();
  }

  setColour(hex: string) { this.colour = hex; this.changed(); }
  setColour2(hex: string) { this.colour2 = hex; this.changed(); }
  swapColours() { [this.colour, this.colour2] = [this.colour2, this.colour]; this.changed(); }
  private useColour() { this.recent = [this.colour, ...this.recent.filter((c) => c !== this.colour)].slice(0, 10); }

  setTool(t: Tool) {
    if (this.gesture || t === this.tool) { this.tool = t; this.changed(); return; }
    if (this.tool === "transform") this.applyTransform();
    if (this.tool === "shapes") this.commitCurve();
    this.polygon = [];
    this.tool = t;
    this.render();
    this.changed();
  }

  /* ---------- where paint goes ---------- */

  private target(): HTMLCanvasElement { return this.layer.editMask && this.layer.mask ? this.layer.mask : this.layer.canvas; }
  private editingMask(): boolean { return this.layer.editMask && !!this.layer.mask; }

  private canPaint(): boolean {
    const l = this.layer;
    if (l.locked) { this.onNotice("The background holds your colour and is locked. Pick another layer to paint on."); return false; }
    if (l.lockAll) { this.onNotice(`“${l.name}” is locked. Unlock it in Layers to paint on it.`); return false; }
    if (!l.visible) { this.onNotice("This layer is hidden. Show it to paint on it."); return false; }
    return true;
  }

  /* ---------- pointer input ---------- */

  /** The last kind of pointer used: "pen", "touch" or "mouse". */
  lastInput = "touch";

  down(p: Point, input: string, alt = false) {
    if (this.gesture) return;
    this.lastInput = input;
    const t = this.tool;
    if (t === "guides") {
      if (this.guide === "perspective") this.configure({ vanishing: [p.x, p.y] });
      return;
    }
    if (t === "filters") return;
    if (t === "picker") { this.pick(p); return; }
    if (t === "select") { this.selectDown(p, input); return; }
    if (t === "retouch" && this.retouchMode === "clone" && (alt || this.settingCloneSource || !this.cloneSource)) {
      this.cloneSource = [p.x, p.y];
      this.settingCloneSource = false;
      this.onNotice("Clone source set. Now paint where you want the copy.");
      this.changed();
      return;
    }
    if (!this.canPaint()) return;
    if (t === "text") { this.onTextTap(p.x, p.y); return; }
    if (t === "fill") { this.fill(p, input); return; }
    this.gesture = { tool: t, start: Date.now(), input, last: p, smooth: p, since: 0, travelled: 0, origin: p, dirty: [p.x, p.y, p.x, p.y] };
    if (t === "transform") {
      if (!this.floating) this.lift();
      this.gesture.moveFrom = [this.floating!.t.dx - p.x, this.floating!.t.dy - p.y];
      return;
    }
    this.beginOp();
    ctx2d(this.buffer).clearRect(0, 0, this.size, this.size);
    if (t === "brush" || t === "eraser") {
      if (this.wet && t === "brush") this.gesture.wetColour = hexToRgb(this.colour);
      this.dabsTo(p, p, true);
    }
    if (t === "retouch") {
      const s = Math.ceil(this.brushSize);
      if (this.retouchMode === "smudge" || this.retouchMode === "liquify") {
        const carry = canvasOf(s);
        ctx2d(carry).drawImage(this.target(), p.x - s / 2, p.y - s / 2, s, s, 0, 0, s, s);
        this.gesture.carry = carry;
      }
      if (this.retouchMode === "clone") this.gesture.cloneOffset = [this.cloneSource![0] - p.x, this.cloneSource![1] - p.y];
      this.retouchAt(p);
    }
    if (t === "shapes" && this.shape === "curve" && this.pendingCurve) this.drawCurve(p);
    this.schedule();
  }

  move(points: Point[]) {
    const g = this.gesture;
    if (!g) return;
    for (const p of points) {
      if (g.tool === "select") { this.selectMove(p); continue; }
      if (g.tool === "transform") { this.floating!.t.dx = p.x + g.moveFrom![0]; this.floating!.t.dy = p.y + g.moveFrom![1]; continue; }
      if (g.tool === "brush" || g.tool === "eraser" || g.tool === "retouch") {
        const k = 1 - this.smoothing * 0.85;
        const s: Point = { x: g.smooth.x + (p.x - g.smooth.x) * k, y: g.smooth.y + (p.y - g.smooth.y) * k, pressure: p.pressure };
        if (g.straight) this.straightLine(s);
        else if (g.tool === "retouch") this.retouchTo(g.smooth, s);
        else this.dabsTo(g.smooth, s, false);
        g.smooth = s;
      }
      if (g.tool === "gradient") this.drawGradient(g.origin, p);
      if (g.tool === "shapes") { if (this.shape === "curve" && this.pendingCurve) this.drawCurve(p); else this.drawShape(g.origin, p); }
      g.last = p;
    }
    this.schedule();
  }

  up() {
    const g = this.gesture;
    if (!g) return;
    if (g.tool === "select") { this.selectUp(); return; }
    if (g.tool === "transform") { this.gesture = null; this.render(); this.changed(); return; }
    if (g.tool === "shapes" && this.shape === "curve") {
      if (!this.pendingCurve) {
        this.pendingCurve = { a: [g.origin.x, g.origin.y], b: [g.last.x, g.last.y] };
        this.gesture = null;
        this.onNotice("Now drag anywhere to bend the curve.");
        this.render();
        this.changed();
        return;
      }
      this.pendingCurve = null;
    }
    if (g.tool === "retouch") {
      this.maskToSelection();
      this.endOp(this.retouchMode === "clone" || this.retouchMode === "smudge" || this.retouchMode === "liquify" ? g.dirty : [0, 0, this.size, this.size], this.retouchLabel());
    } else {
      this.commitBuffer(g.tool === "eraser");
      const full = g.tool === "gradient";
      this.endOp(full ? [0, 0, this.size, this.size] : g.dirty, g.tool === "brush" ? this.brush.name : g.tool === "eraser" ? "Erase" : g.tool === "gradient" ? "Gradient" : "Shape");
      if (g.tool !== "eraser") this.useColour();
    }
    this.records.push({ tool: g.tool === "retouch" ? this.retouchMode : g.tool, start: g.start, end: Date.now(), input: g.input });
    this.gesture = null;
    this.render();
    this.changed();
  }

  /** A second finger landed: drop the stroke in progress without keeping it. */
  cancel() {
    const g = this.gesture;
    if (!g) return;
    this.gesture = null;
    if (g.tool !== "select" && g.tool !== "transform") {
      const tctx = ctx2d(this.target());
      tctx.clearRect(0, 0, this.size, this.size);
      tctx.drawImage(this.before, 0, 0);
      ctx2d(this.buffer).clearRect(0, 0, this.size, this.size);
    }
    this.render();
  }

  /** QuickShape: the finger rested at the end of a stroke, so it becomes a straight line that can still be adjusted. */
  quickShape() {
    const g = this.gesture;
    if (!g || g.straight || (g.tool !== "brush" && g.tool !== "eraser") || Math.hypot(g.smooth.x - g.origin.x, g.smooth.y - g.origin.y) < this.size / 50) return;
    g.straight = true;
    this.straightLine(g.smooth);
    this.onNotice("Snapped to a straight line. Keep holding to adjust it.");
    this.schedule();
  }

  private straightLine(to: Point) {
    const g = this.gesture!;
    ctx2d(this.buffer).clearRect(0, 0, this.size, this.size);
    g.dirty = [g.origin.x, g.origin.y, g.origin.x, g.origin.y];
    g.since = 0; g.travelled = this.taper;
    this.dabsTo({ ...g.origin, pressure: to.pressure }, { ...g.origin, pressure: to.pressure }, true);
    this.dabsTo({ ...g.origin, pressure: to.pressure }, to, false);
  }

  /* ---------- brushes ---------- */

  private sizeAt(pressure: number) {
    const g = this.gesture;
    const taper = this.taper > 0 && g ? Math.min(1, 0.15 + (0.85 * g.travelled) / this.taper) : 1;
    const jitter = this.sizeJitter ? 1 - Math.random() * this.sizeJitter : 1;
    return Math.max(1, this.brushSize * (this.brush.pressureSize ? 0.25 + 0.75 * pressure : 1) * taper * jitter);
  }

  private mirrors(x: number, y: number): [number, number][] {
    const c = this.size / 2;
    switch (this.symmetry) {
      case "vertical": return [[x, y], [2 * c - x, y]];
      case "horizontal": return [[x, y], [x, 2 * c - y]];
      case "quad": return [[x, y], [2 * c - x, y], [x, 2 * c - y], [2 * c - x, 2 * c - y]];
      case "radial": {
        const dx = x - c, dy = y - c;
        return Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return [c + dx * Math.cos(a) - dy * Math.sin(a), c + dx * Math.sin(a) + dy * Math.cos(a)] as [number, number]; });
      }
      default: return [[x, y]];
    }
  }

  private markDirty(x: number, y: number, r: number) {
    const d = this.gesture!.dirty;
    for (const [mx, my] of this.mirrors(x, y)) {
      d[0] = Math.min(d[0], mx - r); d[1] = Math.min(d[1], my - r);
      d[2] = Math.max(d[2], mx + r); d[3] = Math.max(d[3], my + r);
    }
  }

  private dabsTo(a: Point, b: Point, first: boolean) {
    const g = this.gesture!;
    const ctx = ctx2d(this.buffer);
    const step = Math.max(0.5, this.brushSize * this.brush.spacing);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (first) { this.dab(ctx, a.x, a.y, a.pressure, 0); g.since = 0; return; }
    let at = step - g.since;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    while (at <= dist) {
      const t = dist ? at / dist : 0;
      g.travelled += step;
      this.dab(ctx, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.pressure + (b.pressure - a.pressure) * t, angle);
      at += step;
    }
    g.since = dist - (at - step);
  }

  private dab(ctx: CanvasRenderingContext2D, x: number, y: number, pressure: number, angle: number) {
    const g = this.gesture!;
    const size = this.sizeAt(pressure);
    const r = size / 2;
    if (this.scatter) { const a = Math.random() * Math.PI * 2, d = Math.random() * this.scatter * size; x += Math.cos(a) * d; y += Math.sin(a) * d; }
    let alpha = Math.min(1, this.flow * (this.brush.pressureOpacity ? 0.2 + 0.8 * pressure : 1));
    if (this.opacityJitter) alpha *= 1 - Math.random() * this.opacityJitter;
    const erase = this.tool === "eraser";
    let rgb: RGB = erase || this.editingMask() ? [0, 0, 0] : hexToRgb(this.colour);
    if (g.wetColour && !erase && !this.editingMask()) {
      const px = ctx2d(this.target()).getImageData(Math.max(0, Math.min(this.size - 1, Math.round(x))), Math.max(0, Math.min(this.size - 1, Math.round(y))), 1, 1).data;
      const under: RGB = px[3] > 20 ? [px[0], px[1], px[2]] : g.wetColour;
      g.wetColour = mix(mix(g.wetColour, under, this.wet * 0.5), hexToRgb(this.colour), 0.08);
      rgb = g.wetColour;
    }
    const [cr, cg, cb] = rgb.map(Math.round);
    const tex = erase ? "smooth" : this.brush.texture;
    this.markDirty(x, y, r * 2 + 2);
    for (const [mx, my] of this.mirrors(x, y)) {
      ctx.save();
      ctx.globalAlpha = alpha;
      if (tex === "smooth") {
        const grad = ctx.createRadialGradient(mx, my, 0, mx, my, r);
        const h = Math.min(0.99, this.hardness);
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},1)`);
        grad.addColorStop(h, `rgba(${cr},${cg},${cb},1)`);
        grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
      } else if (tex === "pixel") {
        const s = Math.max(1, Math.round(size));
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.globalAlpha = 1;
        ctx.fillRect(Math.round(mx - s / 2), Math.round(my - s / 2), s, s);
      } else if (tex === "nib") {
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.beginPath(); ctx.ellipse(mx, my, r, Math.max(0.8, r * 0.22), -Math.PI / 4, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        if (tex === "bristle") {
          const n = 7, perp = angle + Math.PI / 2;
          for (let i = 0; i < n; i++) {
            const o = (i / (n - 1) - 0.5) * size * 0.9;
            ctx.globalAlpha = alpha * (0.6 + Math.random() * 0.4);
            ctx.beginPath(); ctx.arc(mx + Math.cos(perp) * o, my + Math.sin(perp) * o, r * (0.18 + Math.random() * 0.12), 0, Math.PI * 2); ctx.fill();
          }
        } else {
          const count = tex === "spray" ? Math.min(160, r * 3) : tex === "scatter" ? Math.min(80, r * 1.6) : Math.min(120, r * r * 0.5 + 4);
          const dot = tex === "spray" ? 0.8 : tex === "scatter" ? Math.max(1, r * 0.22) : Math.max(0.6, r * 0.14);
          for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
            ctx.globalAlpha = alpha * (tex === "grain" ? 0.35 + Math.random() * 0.65 : 0.5 + Math.random() * 0.5);
            ctx.fillRect(mx + Math.cos(a) * d - dot / 2, my + Math.sin(a) * d - dot / 2, dot, dot);
          }
        }
      }
      ctx.restore();
    }
  }

  /* ---------- retouch: smudge, blur, sharpen, dodge, burn, sponge, clone, liquify ---------- */

  private retouchLabel(): string {
    return ({ smudge: "Smudge", blur: "Blur brush", sharpen: "Sharpen brush", dodge: "Dodge", burn: "Burn", saturate: "Sponge (saturate)", desaturate: "Sponge (desaturate)", clone: "Clone", liquify: "Liquify" } as const)[this.retouchMode];
  }

  private retouchTo(a: Point, b: Point) {
    const step = Math.max(1, this.brushSize * (this.retouchMode === "smudge" || this.retouchMode === "liquify" ? 0.12 : 0.25));
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    for (let d = step; d <= dist; d += step) { const t = d / dist; this.retouchAt({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, pressure: b.pressure }); }
  }

  private retouchAt(p: Point) {
    const g = this.gesture!;
    const s = Math.max(4, Math.ceil(this.sizeAt(p.pressure)));
    const tctx = ctx2d(this.target());
    for (const [x, y] of this.mirrors(p.x, p.y)) {
      this.markDirty(x, y, s / 2 + 2);
      const mode = this.retouchMode;
      if (mode === "smudge" || mode === "liquify") {
        const carry = g.carry!;
        const strength = mode === "liquify" ? 1 : Math.min(0.95, 0.3 + this.retouchStrength * 0.65);
        tctx.save();
        tctx.beginPath(); tctx.arc(x, y, s / 2, 0, Math.PI * 2); tctx.clip();
        tctx.globalAlpha = strength;
        tctx.drawImage(carry, x - carry.width / 2, y - carry.height / 2);
        tctx.restore();
        const cctx = ctx2d(carry);
        cctx.save();
        if (mode === "liquify") cctx.clearRect(0, 0, carry.width, carry.height);
        cctx.globalAlpha = mode === "liquify" ? 1 : 1 - strength;
        cctx.drawImage(this.target(), x - carry.width / 2, y - carry.height / 2, carry.width, carry.height, 0, 0, carry.width, carry.height);
        cctx.restore();
      } else if (mode === "clone") {
        const [ox, oy] = g.cloneOffset!;
        tctx.save();
        tctx.beginPath(); tctx.arc(x, y, s / 2, 0, Math.PI * 2); tctx.clip();
        tctx.globalAlpha = this.flow;
        tctx.drawImage(this.before, x + ox - s / 2, y + oy - s / 2, s, s, x - s / 2, y - s / 2, s, s);
        tctx.restore();
      } else {
        const x0 = Math.max(0, Math.floor(x - s / 2)), y0 = Math.max(0, Math.floor(y - s / 2));
        const w = Math.min(this.size, Math.ceil(x + s / 2)) - x0, h = Math.min(this.size, Math.ceil(y + s / 2)) - y0;
        if (w < 2 || h < 2) continue;
        const img = tctx.getImageData(x0, y0, w, h);
        F.toneDab({ data: img.data, width: w, height: h }, mode, this.retouchStrength * 0.6, this.hardness);
        tctx.putImageData(img, x0, y0);
      }
    }
  }

  /* ---------- gradients and shapes ---------- */

  private drawGradient(a: Point, b: Point) {
    const ctx = ctx2d(this.buffer);
    ctx.clearRect(0, 0, this.size, this.size);
    const [r, g, bl] = hexToRgb(this.colour);
    const [r2, g2, b2] = hexToRgb(this.colour2);
    const c0 = `rgba(${r},${g},${bl},1)`;
    const c1 = this.gradientToSecondary ? `rgba(${r2},${g2},${b2},1)` : `rgba(${r},${g},${bl},0)`;
    const len = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    if (this.gradientKind === "diamond") {
      const img = ctx.createImageData(this.size, this.size);
      const from = [r, g, bl, 255], to = this.gradientToSecondary ? [r2, g2, b2, 255] : [r, g, bl, 0];
      const ang = Math.atan2(b.y - a.y, b.x - a.x), cos = Math.cos(-ang), sin = Math.sin(-ang);
      for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
        const dx = x - a.x, dy = y - a.y, u = dx * cos - dy * sin, v = dx * sin + dy * cos;
        const t = Math.min(1, (Math.abs(u) + Math.abs(v)) / len), i = (y * this.size + x) * 4;
        for (let c = 0; c < 4; c++) img.data[i + c] = from[c] + (to[c] - from[c]) * t;
      }
      ctx.putImageData(img, 0, 0);
      return;
    }
    let grad: CanvasGradient;
    if (this.gradientKind === "radial") grad = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, len);
    else if (this.gradientKind === "angle") grad = ctx.createConicGradient(Math.atan2(b.y - a.y, b.x - a.x), a.x, a.y);
    else if (this.gradientKind === "reflected") grad = ctx.createLinearGradient(2 * a.x - b.x, 2 * a.y - b.y, b.x, b.y);
    else grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    if (this.gradientKind === "reflected") { grad.addColorStop(0, c1); grad.addColorStop(0.5, c0); grad.addColorStop(1, c1); }
    else { grad.addColorStop(0, c0); grad.addColorStop(1, c1); }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.size, this.size);
  }

  private strokeStyle(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = this.colour;
    ctx.fillStyle = this.shapeStyle === "both" ? this.colour2 : this.colour;
    ctx.lineWidth = Math.max(1, this.brushSize / 2);
    ctx.lineCap = ctx.lineJoin = "round";
  }

  private paintPath(ctx: CanvasRenderingContext2D, pts: [number, number][], closed: boolean) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (closed) ctx.closePath();
    if (closed && this.shapeStyle !== "outline") ctx.fill();
    if (!closed || this.shapeStyle !== "fill") ctx.stroke();
    const pad = ctx.lineWidth + 2, d = this.gesture?.dirty;
    if (d) for (const [x, y] of pts) { d[0] = Math.min(d[0], x - pad); d[1] = Math.min(d[1], y - pad); d[2] = Math.max(d[2], x + pad); d[3] = Math.max(d[3], y + pad); }
  }

  private drawShape(a: Point, b: Point) {
    const ctx = ctx2d(this.buffer);
    ctx.clearRect(0, 0, this.size, this.size);
    this.strokeStyle(ctx);
    const s = shapePath(this.shape, a.x, a.y, b.x, b.y);
    this.paintPath(ctx, s.points, s.closed);
  }

  private drawCurve(c: Point) {
    const ctx = ctx2d(this.buffer);
    ctx.clearRect(0, 0, this.size, this.size);
    this.strokeStyle(ctx);
    const { a, b } = this.pendingCurve!;
    this.gesture!.dirty = [0, 0, this.size, this.size];
    this.paintPath(ctx, curvePoints(a, [2 * c.x - (a[0] + b[0]) / 2, 2 * c.y - (a[1] + b[1]) / 2], b), false);
  }

  /** Keeps a curve that was never bent, as a straight line. */
  private commitCurve() {
    if (!this.pendingCurve) return;
    this.pendingCurve = null;
    this.commitBuffer(false);
    this.endOp([0, 0, this.size, this.size], "Line");
    this.render();
  }

  /* ---------- fill, picker, text ---------- */

  private sampleSource(): HTMLCanvasElement {
    const ref = this.layers.find((l) => l.reference);
    if (ref) return ref.canvas;
    return this.fillAllLayers ? this.flatten() : this.layer.canvas;
  }

  private maskAt(p: Point): Uint8Array {
    const data = ctx2d(this.sampleSource()).getImageData(0, 0, this.size, this.size).data;
    return this.fillContiguous ? floodMask(data, this.size, this.size, p.x, p.y, this.fillTolerance, 1) : colourMask(data, this.size, this.size, p.x, p.y, this.fillTolerance);
  }

  private fill(p: Point, input: string) {
    const start = Date.now();
    const mask = this.maskAt(p);
    const [r, g, b] = this.editingMask() ? [0, 0, 0] : hexToRgb(this.colour);
    const out = new ImageData(this.size, this.size);
    for (let i = 0; i < mask.length; i++) if (mask[i]) { out.data[i * 4] = r; out.data[i * 4 + 1] = g; out.data[i * 4 + 2] = b; out.data[i * 4 + 3] = 255; }
    this.beginOp();
    ctx2d(this.buffer).putImageData(out, 0, 0);
    this.commitBuffer(false);
    this.endOp([0, 0, this.size, this.size], "Fill");
    this.useColour();
    this.records.push({ tool: "fill", start, end: Date.now(), input });
    this.render();
    this.changed();
  }

  private pick(p: Point) {
    const d = ctx2d(this.flatten()).getImageData(Math.max(0, Math.min(this.size - 1, Math.floor(p.x))), Math.max(0, Math.min(this.size - 1, Math.floor(p.y))), 1, 1).data;
    this.setColour(rgbToHex([d[0], d[1], d[2]]));
  }

  /** Touch-and-hold eyedropper: drops the stroke in progress and picks the colour under the finger. */
  holdPick(p: Point) {
    this.cancel();
    this.pick(p);
    this.onNotice("Colour picked.");
  }

  placeText(text: string, x: number, y: number, style: TextStyle) {
    if (!text.trim() || !this.canPaint()) return;
    const start = Date.now();
    this.beginOp();
    const ctx = ctx2d(this.buffer);
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.font = `${style.italic ? "italic " : ""}${style.bold ? "bold " : ""}${style.size}px ${style.family}`;
    ctx.textAlign = style.align;
    ctx.textBaseline = "top";
    const lines = text.split("\n"), lh = style.size * 1.2;
    const widths = lines.map((l) => ctx.measureText(l).width), maxW = Math.max(...widths);
    const left = style.align === "center" ? x - maxW / 2 : style.align === "right" ? x - maxW : x;
    if (style.background) { ctx.fillStyle = this.colour2; ctx.fillRect(left - style.size * 0.25, y - style.size * 0.15, maxW + style.size * 0.5, lh * lines.length + style.size * 0.1); }
    ctx.fillStyle = ctx.strokeStyle = this.colour;
    ctx.lineWidth = Math.max(1, style.size / 14);
    lines.forEach((l, i) => {
      const ly = y + i * lh;
      ctx.fillText(l, x, ly);
      const lx = style.align === "center" ? x - widths[i] / 2 : style.align === "right" ? x - widths[i] : x;
      if (style.underline) { ctx.beginPath(); ctx.moveTo(lx, ly + style.size * 1.02); ctx.lineTo(lx + widths[i], ly + style.size * 1.02); ctx.stroke(); }
      if (style.strike) { ctx.beginPath(); ctx.moveTo(lx, ly + style.size * 0.55); ctx.lineTo(lx + widths[i], ly + style.size * 0.55); ctx.stroke(); }
    });
    this.commitBuffer(false);
    this.endOp([0, 0, this.size, this.size], "Text");
    this.useColour();
    this.records.push({ tool: "text", start, end: Date.now(), input: this.lastInput });
    this.render();
    this.changed();
  }

  /* ---------- selections ---------- */

  private selectDown(p: Point, input: string) {
    if (this.selectKind === "wand") {
      const mask = this.maskAt(p);
      const c = canvasOf(this.size), img = new ImageData(this.size, this.size);
      for (let i = 0; i < mask.length; i++) if (mask[i]) img.data[i * 4 + 3] = 255;
      ctx2d(c).putImageData(img, 0, 0);
      this.setSelection(this.combine(c), "Magic wand");
      return;
    }
    if (this.selectKind === "polygon") {
      const first = this.polygon[0];
      if (first && this.polygon.length >= 3 && Math.hypot(p.x - first[0], p.y - first[1]) < this.size / 40) { this.closePolygon(); return; }
      this.polygon = [...this.polygon, [p.x, p.y]];
      this.render();
      this.changed();
      return;
    }
    this.gesture = { tool: "select", start: Date.now(), input, last: p, smooth: p, since: 0, travelled: 0, origin: p, dirty: [0, 0, 0, 0], outline: [[p.x, p.y]] };
  }

  private selectMove(p: Point) {
    const g = this.gesture!, o = g.origin;
    if (this.selectKind === "lasso") g.outline!.push([p.x, p.y]);
    else if (this.selectKind === "rect") g.outline = [[o.x, o.y], [p.x, o.y], [p.x, p.y], [o.x, p.y]];
    else g.outline = shapePath("ellipse", o.x, o.y, p.x, p.y).points;
  }

  private selectUp() {
    const pts = this.gesture!.outline!;
    this.gesture = null;
    const [x0, y0, x1, y1] = bounds(pts);
    if (x1 - x0 < 4 || y1 - y0 < 4) { if (!this.selectAdd) this.deselect(); else this.render(); return; }
    this.setSelection(this.combine(this.pathMask(pts)), this.selectKind === "lasso" ? "Lasso select" : this.selectKind === "rect" ? "Box select" : "Oval select");
  }

  closePolygon() {
    if (this.polygon.length < 3) return;
    const pts = this.polygon;
    this.polygon = [];
    this.setSelection(this.combine(this.pathMask(pts)), "Polygon select");
  }

  private pathMask(pts: [number, number][]): HTMLCanvasElement {
    const c = canvasOf(this.size), ctx = ctx2d(c);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    return c;
  }

  private combine(mask: HTMLCanvasElement): HTMLCanvasElement {
    if (!this.selectAdd || !this.selection) return mask;
    const c = copyOf(this.selection);
    ctx2d(c).drawImage(mask, 0, 0);
    return c;
  }

  private setSelection(sel: HTMLCanvasElement | null, label: string) {
    const was = this.selection;
    this.selection = sel;
    this.push({ label, undo: () => { this.selection = was; }, redo: () => { this.selection = sel; } });
    this.render();
    this.changed();
  }

  selectAll() { const c = canvasOf(this.size); const x = ctx2d(c); x.fillStyle = "#fff"; x.fillRect(0, 0, this.size, this.size); this.setSelection(c, "Select all"); }
  deselect() { this.polygon = []; if (this.selection) this.setSelection(null, "Deselect"); else { this.render(); this.changed(); } }

  invertSelection() {
    if (!this.selection) return;
    const c = canvasOf(this.size), x = ctx2d(c);
    x.fillStyle = "#fff"; x.fillRect(0, 0, this.size, this.size);
    x.globalCompositeOperation = "destination-out"; x.drawImage(this.selection, 0, 0);
    this.setSelection(c, "Invert selection");
  }

  featherSelection(radius: number) {
    if (!this.selection || radius < 1) return;
    const c = copyOf(this.selection), x = ctx2d(c), img = x.getImageData(0, 0, this.size, this.size);
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; }
    F.boxBlur({ data: img.data, width: this.size, height: this.size }, radius);
    x.putImageData(img, 0, 0);
    this.setSelection(c, "Feather");
  }

  selectLayerContents() {
    const c = canvasOf(this.size), x = ctx2d(c);
    x.drawImage(this.layer.canvas, 0, 0);
    x.globalCompositeOperation = "source-in"; x.fillStyle = "#fff"; x.fillRect(0, 0, this.size, this.size);
    this.setSelection(c, "Select layer");
  }

  /** The current layer's pixels inside the selection, as a new canvas. */
  private selectedPixels(): HTMLCanvasElement {
    const c = copyOf(this.layer.canvas);
    if (this.selection) { const x = ctx2d(c); x.globalCompositeOperation = "destination-in"; x.drawImage(this.selection, 0, 0); }
    return c;
  }

  copyToLayer(cut: boolean) {
    if (!this.selection) { this.onNotice("Select something first."); return; }
    if (!this.canAddLayer) { this.onNotice(`Up to ${this.maxLayers} layers.`); return; }
    if (cut && !this.canPaint()) return;
    const part = this.selectedPixels();
    if (cut) {
      this.beginOp();
      const x = ctx2d(this.layer.canvas);
      x.save(); x.globalCompositeOperation = "destination-out"; x.drawImage(this.selection, 0, 0); x.restore();
      this.endOp([0, 0, this.size, this.size], "Cut");
    }
    const l = this.makeLayer(cut ? "Cut" : "Copy");
    ctx2d(l.canvas).drawImage(part, 0, 0);
    const next = [...this.layers];
    next.splice(this.current + 1, 0, l);
    this.setLayers(next, this.current + 1, cut ? "Cut to new layer" : "Copy to new layer");
  }

  clearSelected() {
    if (!this.canPaint()) return;
    this.beginOp();
    const x = ctx2d(this.target());
    x.save();
    if (this.selection) { x.globalCompositeOperation = "destination-out"; x.drawImage(this.selection, 0, 0); } else x.clearRect(0, 0, this.size, this.size);
    x.restore();
    this.endOp([0, 0, this.size, this.size], this.selection ? "Delete selection" : "Clear layer");
    this.render(); this.changed();
  }

  fillSelected() {
    if (!this.canPaint()) return;
    this.beginOp();
    const b = ctx2d(this.buffer);
    b.clearRect(0, 0, this.size, this.size);
    b.fillStyle = this.editingMask() ? "#000" : this.colour;
    b.fillRect(0, 0, this.size, this.size);
    this.commitBuffer(false);
    this.endOp([0, 0, this.size, this.size], this.selection ? "Fill selection" : "Fill layer");
    this.useColour();
    this.render(); this.changed();
  }

  /** After a tool that changed the target directly, keep the change inside the selection only. */
  private maskToSelection() {
    if (!this.selection) return;
    const t = this.target(), s = ctx2d(this.scratch2);
    s.save();
    s.clearRect(0, 0, this.size, this.size);
    s.drawImage(t, 0, 0);
    s.globalCompositeOperation = "destination-in"; s.drawImage(this.selection, 0, 0);
    s.restore();
    const x = ctx2d(t);
    x.save();
    x.clearRect(0, 0, this.size, this.size);
    x.drawImage(this.before, 0, 0);
    x.globalCompositeOperation = "destination-out"; x.drawImage(this.selection, 0, 0);
    x.globalCompositeOperation = "source-over"; x.drawImage(this.scratch2, 0, 0);
    x.restore();
  }

  /* ---------- transform ---------- */

  /** Lifts the selection (or the whole layer) so it can be moved, scaled, turned, skewed and flipped. */
  private lift() {
    this.beginOp();
    const part = this.selection ? this.selectedPixels() : copyOf(this.target());
    const x = ctx2d(this.target());
    x.save();
    if (this.selection) { x.globalCompositeOperation = "destination-out"; x.drawImage(this.selection, 0, 0); } else x.clearRect(0, 0, this.size, this.size);
    x.restore();
    const [x0, y0, x1, y1] = this.selection ? alphaBounds(this.selection) : [0, 0, this.size, this.size];
    this.floating = { canvas: part, centre: [(x0 + x1) / 2, (y0 + y1) / 2], t: { ...NO_TRANSFORM } };
  }

  setTransform(patch: Partial<Transform>) {
    if (!this.floating) { if (!this.canPaint()) return; this.lift(); }
    Object.assign(this.floating!.t, patch);
    this.render();
    this.changed();
  }

  private drawFloating(ctx: CanvasRenderingContext2D) {
    const f = this.floating!, t = f.t, [cx, cy] = f.centre;
    ctx.save();
    ctx.translate(cx + t.dx, cy + t.dy);
    ctx.rotate((t.rotate * Math.PI) / 180);
    ctx.transform(1, Math.tan((t.skewY * Math.PI) / 180), Math.tan((t.skewX * Math.PI) / 180), 1, 0, 0);
    ctx.scale(t.scale * (t.flipH ? -1 : 1), t.scale * (t.flipV ? -1 : 1));
    ctx.translate(-cx, -cy);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(f.canvas, 0, 0);
    ctx.restore();
  }

  applyTransform() {
    if (!this.floating) return;
    const start = Date.now();
    this.drawFloating(ctx2d(this.target()));
    const t = this.floating.t;
    if (this.selection && (t.dx || t.dy || t.scale !== 1 || t.rotate || t.skewX || t.skewY || t.flipH || t.flipV)) {
      const sel = canvasOf(this.size);
      const was = this.floating.canvas;
      this.floating.canvas = this.selection;
      this.drawFloating(ctx2d(sel));
      this.floating.canvas = was;
      this.selection = sel;
    }
    this.floating = null;
    this.endOp([0, 0, this.size, this.size], "Transform");
    this.records.push({ tool: "transform", start, end: Date.now(), input: this.lastInput });
    this.render();
    this.changed();
  }

  cancelTransform() {
    if (!this.floating) return;
    this.floating = null;
    const x = ctx2d(this.target());
    x.clearRect(0, 0, this.size, this.size);
    x.drawImage(this.before, 0, 0);
    this.render();
    this.changed();
  }

  /* ---------- filters ---------- */

  applyFilter(name: FilterName, v: Record<string, number>) {
    if (!this.canPaint()) return;
    this.beginOp();
    const t = this.target(), img = ctx2d(t).getImageData(0, 0, this.size, this.size);
    const p = { data: img.data, width: this.size, height: this.size };
    switch (name) {
      case "hsb": F.adjustHsb(p, v.hue ?? 0, v.saturation ?? 0, v.brightness ?? 0); break;
      case "brightnessContrast": F.brightnessContrast(p, v.brightness ?? 0, v.contrast ?? 0); break;
      case "colourBalance": F.colourBalance(p, v.red ?? 0, v.green ?? 0, v.blue ?? 0); break;
      case "levels": F.levels(p, v.black ?? 0, v.white ?? 255, v.gamma ?? 1); break;
      case "invert": F.invert(p); break;
      case "desaturate": F.desaturate(p); break;
      case "posterize": F.posterize(p, v.steps ?? 4); break;
      case "threshold": F.threshold(p, v.level ?? 128); break;
      case "gradientMap": F.gradientMap(p, hexToRgb(this.colour), hexToRgb(this.colour2)); break;
      case "blur": F.boxBlur(p, v.radius ?? 4); break;
      case "motionBlur": F.motionBlur(p, v.angle ?? 0, v.distance ?? 20); break;
      case "sharpen": F.sharpen(p, v.amount ?? 1); break;
      case "noise": F.noise(p, v.amount ?? 20); break;
      case "pixelate": F.pixelate(p, v.cell ?? 16); break;
      case "halftone": F.halftone(p, v.cell ?? 12); break;
      case "bloom": F.bloom(p, v.threshold ?? 180, v.radius ?? 12, v.strength ?? 0.8); break;
      case "chromatic": F.chromatic(p, v.shift ?? 6); break;
      case "glitch": F.glitch(p, v.amount ?? 40); break;
      case "vignette": F.vignette(p, v.strength ?? 0.5); break;
      case "emboss": F.emboss(p); break;
    }
    ctx2d(t).putImageData(img, 0, 0);
    this.maskToSelection();
    this.endOp([0, 0, this.size, this.size], FILTER_LABELS[name]);
    this.render();
    this.changed();
  }

  /* ---------- layers ---------- */

  private makeLayer(name: string): Layer {
    return { id: `l${this.nextId++}`, name, canvas: canvasOf(this.size), mask: null, editMask: false, visible: true, opacity: 1, blend: "source-over", locked: false, lockAll: false, alphaLock: false, clip: false, reference: false };
  }

  private setLayers(next: Layer[], current: number, label: string) {
    this.applyTransform();
    const was = this.layers, wasCurrent = this.current;
    this.layers = next; this.current = current;
    this.push({ label, undo: () => { this.layers = was; this.current = wasCurrent; }, redo: () => { this.layers = next; this.current = current; } });
    this.render();
    this.changed();
  }

  addLayer() {
    if (!this.canAddLayer) { this.onNotice(`Up to ${this.maxLayers} layers.`); return; }
    const next = [...this.layers];
    next.splice(this.current + 1, 0, this.makeLayer(`Layer ${this.nextId - 1}`));
    this.setLayers(next, this.current + 1, "New layer");
  }

  duplicateLayer() {
    if (!this.canAddLayer) { this.onNotice(`Up to ${this.maxLayers} layers.`); return; }
    const src = this.layer;
    const l: Layer = { ...src, ...this.makeLayer(`${src.name} copy`), opacity: src.opacity, blend: src.blend, alphaLock: src.alphaLock, clip: src.clip, mask: src.mask ? copyOf(src.mask) : null, locked: false };
    ctx2d(l.canvas).drawImage(src.canvas, 0, 0);
    const next = [...this.layers];
    next.splice(this.current + 1, 0, l);
    this.setLayers(next, this.current + 1, "Duplicate layer");
  }

  deleteLayer() {
    if (this.layer.locked) { this.onNotice("The background can't be deleted."); return; }
    if (this.layers.length <= 2) { this.onNotice("Keep at least one layer to paint on."); return; }
    this.setLayers(this.layers.filter((_, i) => i !== this.current), Math.max(1, this.current - 1), "Delete layer");
  }

  /** One layer as it shows: mask, clip and opacity applied, blend mode not. */
  private rendered(i: number): HTMLCanvasElement {
    const l = this.layers[i], c = copyOf(l.canvas), x = ctx2d(c);
    x.globalCompositeOperation = "destination-in";
    if (l.mask) x.drawImage(l.mask, 0, 0);
    if (l.clip && i > 0) x.drawImage(this.layers[i - 1].canvas, 0, 0);
    return c;
  }

  mergeDown() {
    if (this.current <= 1) { this.onNotice("Nothing to merge into. The background stays separate."); return; }
    const top = this.layer, below = this.layers[this.current - 1];
    const merged: Layer = { ...below, id: `l${this.nextId++}`, canvas: copyOf(this.rendered(this.current - 1)), mask: null, editMask: false };
    const m = ctx2d(merged.canvas);
    m.globalAlpha = top.opacity; m.globalCompositeOperation = top.blend;
    m.drawImage(this.rendered(this.current), 0, 0);
    const next = [...this.layers];
    next.splice(this.current - 1, 2, merged);
    this.setLayers(next, this.current - 1, "Merge down");
  }

  /** Flattens every layer above the background into one. */
  flattenLayers() {
    if (this.layers.length <= 2) return;
    const merged = this.makeLayer("Flattened"), m = ctx2d(merged.canvas);
    this.layers.forEach((l, i) => { if (i === 0 || !l.visible) return; m.globalAlpha = l.opacity; m.globalCompositeOperation = l.blend; m.drawImage(this.rendered(i), 0, 0); });
    this.setLayers([this.layers[0], merged], 1, "Flatten");
  }

  moveLayer(dir: -1 | 1) {
    const to = this.current + dir;
    if (this.layer.locked || to < 1 || to >= this.layers.length) return;
    const next = [...this.layers];
    [next[this.current], next[to]] = [next[to], next[this.current]];
    this.setLayers(next, to, dir > 0 ? "Move layer up" : "Move layer down");
  }

  selectLayer(i: number) { this.applyTransform(); this.current = i; this.changed(); }

  setLayerProp<K extends "visible" | "opacity" | "blend" | "alphaLock" | "clip" | "name" | "lockAll" | "reference" | "editMask">(i: number, key: K, value: Layer[K]) {
    const l = this.layers[i];
    if (l.locked && key !== "visible") return;
    const was = l[key], id = l.id;
    const apply = (v: Layer[K]) => {
      const x = this.layers.find((y) => y.id === id);
      if (!x) return;
      if (key === "reference" && v) this.layers.forEach((y) => { y.reference = false; });
      x[key] = v;
    };
    apply(value);
    this.push({ label: LAYER_PROP_LABELS[key], undo: () => apply(was), redo: () => apply(value) });
    this.render();
    this.changed();
  }

  addMask() {
    const l = this.layer;
    if (l.locked || l.mask) return;
    const mask = canvasOf(this.size), x = ctx2d(mask);
    x.fillStyle = "#fff"; x.fillRect(0, 0, this.size, this.size);
    const id = l.id;
    const set = (m: HTMLCanvasElement | null, edit: boolean) => { const y = this.layers.find((z) => z.id === id); if (y) { y.mask = m; y.editMask = edit; } };
    set(mask, true);
    this.push({ label: "Add mask", undo: () => set(null, false), redo: () => set(mask, true) });
    this.onNotice("Mask added. Paint to show, erase to hide.");
    this.render(); this.changed();
  }

  /** Bakes the mask into the layer, or throws it away. */
  removeMask(apply: boolean) {
    const l = this.layer;
    if (!l.mask) return;
    const id = l.id, mask = l.mask, was = copyOf(l.canvas);
    const set = (m: HTMLCanvasElement | null, img: HTMLCanvasElement) => {
      const y = this.layers.find((z) => z.id === id);
      if (!y) return;
      y.mask = m; y.editMask = !!m && y.editMask;
      const x = ctx2d(y.canvas); x.clearRect(0, 0, this.size, this.size); x.drawImage(img, 0, 0);
    };
    if (apply) { const c = copyOf(l.canvas); const x = ctx2d(c); x.globalCompositeOperation = "destination-in"; x.drawImage(mask, 0, 0); set(null, c); this.push({ label: "Apply mask", undo: () => set(mask, was), redo: () => set(null, c) }); }
    else { set(null, was); this.push({ label: "Delete mask", undo: () => set(mask, was), redo: () => set(null, was) }); }
    this.render(); this.changed();
  }

  /* ---------- undo and history ---------- */

  private beginOp() {
    const b = ctx2d(this.before);
    b.clearRect(0, 0, this.size, this.size);
    b.drawImage(this.target(), 0, 0);
  }

  private endOp(dirty: [number, number, number, number], label: string) {
    const x = Math.max(0, Math.floor(dirty[0])), y = Math.max(0, Math.floor(dirty[1]));
    const w = Math.min(this.size, Math.ceil(dirty[2])) - x, h = Math.min(this.size, Math.ceil(dirty[3])) - y;
    if (w <= 0 || h <= 0) return;
    const layerId = this.layer.id, onMask = this.editingMask();
    const was = ctx2d(this.before).getImageData(x, y, w, h);
    const now = ctx2d(this.target()).getImageData(x, y, w, h);
    const put = (img: ImageData) => { const l = this.layers.find((z) => z.id === layerId); const c = l && (onMask ? l.mask : l.canvas); if (c) ctx2d(c).putImageData(img, x, y); };
    this.push({ label, undo: () => put(was), redo: () => put(now) });
  }

  private push(e: Entry) {
    this.undoStack.push(e);
    if (this.undoStack.length > this.undoLimit) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (this.gesture) return;
    if (this.floating) { this.cancelTransform(); return; }
    if (this.pendingCurve) { this.pendingCurve = null; ctx2d(this.buffer).clearRect(0, 0, this.size, this.size); this.render(); this.changed(); return; }
    const e = this.undoStack.pop();
    if (!e) return;
    e.undo();
    this.redoStack.push(e);
    this.current = Math.min(this.current, this.layers.length - 1);
    this.render(); this.changed();
  }

  redo() {
    if (this.gesture) return;
    const e = this.redoStack.pop();
    if (!e) return;
    e.redo();
    this.undoStack.push(e);
    this.current = Math.min(this.current, this.layers.length - 1);
    this.render(); this.changed();
  }

  /** Steps back or forward until exactly `applied` history steps are in effect. */
  jumpTo(applied: number) {
    this.applyTransform();
    while (this.undoStack.length > applied && this.undoStack.length) this.undo();
    while (this.undoStack.length < applied && this.redoStack.length) this.redo();
  }

  /* ---------- drawing to the screen ---------- */

  private commitBuffer(erase: boolean) {
    const t = this.target();
    let src = this.buffer;
    if (this.selection) {
      const s = ctx2d(this.scratch2);
      s.save(); s.clearRect(0, 0, this.size, this.size); s.drawImage(this.buffer, 0, 0);
      s.globalCompositeOperation = "destination-in"; s.drawImage(this.selection, 0, 0); s.restore();
      src = this.scratch2;
    }
    const x = ctx2d(t);
    x.save();
    x.globalAlpha = this.tool === "fill" || this.tool === "text" || this.tool === "shapes" ? 1 : this.brushOpacity;
    x.globalCompositeOperation = erase ? "destination-out" : this.brush.mode === "glow" && this.tool === "brush" && !this.editingMask() ? "lighter" : this.layer.alphaLock && !this.editingMask() ? "source-atop" : "source-over";
    x.drawImage(src, 0, 0);
    x.restore();
    ctx2d(this.buffer).clearRect(0, 0, this.size, this.size);
  }

  /** The current target as it would look if the stroke in progress were kept. */
  private liveTarget(): HTMLCanvasElement {
    const g = this.gesture;
    const ctx = ctx2d(this.live);
    ctx.save();
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.drawImage(this.target(), 0, 0);
    const buffered = (g && (g.tool === "brush" || g.tool === "eraser" || g.tool === "gradient" || g.tool === "shapes")) || this.pendingCurve;
    if (buffered) {
      let src = this.buffer;
      if (this.selection) {
        const s = ctx2d(this.scratch2);
        s.save(); s.clearRect(0, 0, this.size, this.size); s.drawImage(this.buffer, 0, 0);
        s.globalCompositeOperation = "destination-in"; s.drawImage(this.selection, 0, 0); s.restore();
        src = this.scratch2;
      }
      const tool = g?.tool ?? "shapes";
      ctx.globalAlpha = tool === "shapes" ? 1 : this.brushOpacity;
      ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : this.brush.mode === "glow" && tool === "brush" && !this.editingMask() ? "lighter" : this.layer.alphaLock && !this.editingMask() ? "source-atop" : "source-over";
      ctx.drawImage(src, 0, 0);
    }
    ctx.restore();
    if (this.floating) this.drawFloating(ctx);
    return this.live;
  }

  private composite(ctx: CanvasRenderingContext2D, withLive: boolean) {
    ctx.save();
    ctx.clearRect(0, 0, this.size, this.size);
    const liveNeeded = withLive && (this.gesture || this.floating || this.pendingCurve);
    this.layers.forEach((l, i) => {
      if (!l.visible) return;
      const isCurrent = i === this.current && liveNeeded;
      const live = isCurrent ? this.liveTarget() : null;
      const content = isCurrent && !this.editingMask() ? live! : l.canvas;
      const mask = isCurrent && this.editingMask() ? live : l.mask;
      let src = content;
      if (mask || (l.clip && i > 0)) {
        const s = ctx2d(this.scratch);
        s.save(); s.clearRect(0, 0, this.size, this.size); s.drawImage(content, 0, 0);
        s.globalCompositeOperation = "destination-in";
        if (mask) s.drawImage(mask, 0, 0);
        if (l.clip && i > 0) s.drawImage(this.layers[i - 1].canvas, 0, 0);
        s.restore();
        src = this.scratch;
      }
      ctx.globalAlpha = l.opacity;
      ctx.globalCompositeOperation = l.blend;
      ctx.drawImage(src, 0, 0);
    });
    ctx.restore();
  }

  /** All visible layers flattened, without guides or selection. */
  flatten(): HTMLCanvasElement {
    const out = canvasOf(this.size);
    this.composite(ctx2d(out), false);
    return out;
  }

  private schedule() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }

  render() {
    const ctx = ctx2d(this.display);
    this.composite(ctx, true);
    this.drawGuides(ctx);
    const s = this.size;
    if (this.selection && !this.floating) {
      const o = ctx2d(this.scratch);
      o.save(); o.clearRect(0, 0, s, s); o.fillStyle = "rgba(14,11,9,0.45)"; o.fillRect(0, 0, s, s);
      o.globalCompositeOperation = "destination-out"; o.drawImage(this.selection, 0, 0); o.restore();
      ctx.drawImage(this.scratch, 0, 0);
    }
    const outline = this.gesture?.outline ?? (this.polygon.length ? this.polygon : null);
    if (outline && outline.length > 1) {
      ctx.save();
      ctx.lineWidth = s / 400;
      ctx.beginPath();
      outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (this.selectKind !== "lasso" && this.selectKind !== "polygon") ctx.closePath();
      ctx.setLineDash([s / 120, s / 120]);
      ctx.strokeStyle = "#0e0b09"; ctx.stroke();
      ctx.lineDashOffset = s / 120; ctx.strokeStyle = "#efe3cc"; ctx.stroke();
      ctx.restore();
    }
    if (this.polygon.length) {
      const [x, y] = this.polygon[0];
      ctx.save(); ctx.fillStyle = "#c9a24f"; ctx.beginPath(); ctx.arc(x, y, s / 90, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    if (this.floating) {
      const f = this.floating, b = alphaBounds(f.canvas);
      ctx.save();
      const t = f.t, [cx, cy] = f.centre;
      ctx.translate(cx + t.dx, cy + t.dy); ctx.rotate((t.rotate * Math.PI) / 180);
      ctx.transform(1, Math.tan((t.skewY * Math.PI) / 180), Math.tan((t.skewX * Math.PI) / 180), 1, 0, 0);
      ctx.scale(t.scale, t.scale); ctx.translate(-cx, -cy);
      ctx.lineWidth = s / 300 / t.scale; ctx.setLineDash([s / 80, s / 80]); ctx.strokeStyle = "#c9a24f";
      ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
      ctx.restore();
    }
    if (this.tool === "retouch" && this.retouchMode === "clone" && this.cloneSource) {
      const [x, y] = this.cloneSource;
      ctx.save(); ctx.strokeStyle = "#efe3cc"; ctx.lineWidth = s / 400;
      ctx.beginPath(); ctx.moveTo(x - s / 60, y); ctx.lineTo(x + s / 60, y); ctx.moveTo(x, y - s / 60); ctx.lineTo(x, y + s / 60); ctx.stroke(); ctx.restore();
    }
  }

  private drawGuides(ctx: CanvasRenderingContext2D) {
    const s = this.size, g = this.guideSize;
    ctx.save();
    ctx.strokeStyle = "rgba(239,227,204,0.35)";
    ctx.lineWidth = s / 1000;
    ctx.beginPath();
    if (this.guide === "grid") for (let v = g; v < s; v += g) { ctx.moveTo(v, 0); ctx.lineTo(v, s); ctx.moveTo(0, v); ctx.lineTo(s, v); }
    if (this.guide === "isometric") {
      const t = Math.tan(Math.PI / 6);
      for (let c = -s * 2; c < s * 2; c += g) { ctx.moveTo(0, c); ctx.lineTo(s, c + s * t); ctx.moveTo(0, c); ctx.lineTo(s, c - s * t); }
      for (let v = 0; v < s; v += g / t / 2) { ctx.moveTo(v, 0); ctx.lineTo(v, s); }
    }
    if (this.guide === "perspective") {
      const [vx, vy] = this.vanishing;
      for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; ctx.moveTo(vx, vy); ctx.lineTo(vx + Math.cos(a) * s * 2, vy + Math.sin(a) * s * 2); }
      ctx.moveTo(0, vy); ctx.lineTo(s, vy);
    }
    if (this.guide === "thirds") for (const v of [s / 3, (2 * s) / 3]) { ctx.moveTo(v, 0); ctx.lineTo(v, s); ctx.moveTo(0, v); ctx.lineTo(s, v); }
    ctx.stroke();
    if (this.symmetry !== "off") {
      ctx.strokeStyle = "rgba(201,162,79,0.6)";
      ctx.setLineDash([s / 100, s / 100]);
      ctx.beginPath();
      if (this.symmetry === "vertical" || this.symmetry === "quad" || this.symmetry === "radial") { ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s); }
      if (this.symmetry === "horizontal" || this.symmetry === "quad" || this.symmetry === "radial") { ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2); }
      if (this.symmetry === "radial") { ctx.moveTo(0, 0); ctx.lineTo(s, s); ctx.moveTo(s, 0); ctx.lineTo(0, s); }
      ctx.stroke();
    }
    ctx.restore();
  }

  private changed() { this.onChange(); }

  /* ---------- drafts ---------- */

  async serialize(): Promise<Draft> {
    const blob = (c: HTMLCanvasElement | null) => (c ? new Promise<Blob | null>((res) => c.toBlob(res, "image/png")) : Promise.resolve(null));
    const layers = await Promise.all(this.layers.map(async (l) => ({
      name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, locked: l.locked, lockAll: l.lockAll, alphaLock: l.alphaLock, clip: l.clip, reference: l.reference,
      png: await blob(l.canvas), maskPng: await blob(l.mask),
    })));
    return { size: this.size, layers, current: this.current, records: this.records, colour: this.colour, colour2: this.colour2, brushId: this.brush.id };
  }

  async restore(d: Draft) {
    if (d.size !== this.size || !d.layers.length) return;
    const draw = async (b: Blob | null | undefined, c: HTMLCanvasElement) => { if (!b) return; const bmp = await createImageBitmap(b); ctx2d(c).drawImage(bmp, 0, 0); bmp.close(); };
    const layers: Layer[] = [];
    for (const dl of d.layers) {
      const l: Layer = { ...this.makeLayer(dl.name), visible: dl.visible, opacity: dl.opacity, blend: dl.blend, locked: dl.locked, lockAll: !!dl.lockAll, alphaLock: dl.alphaLock, clip: dl.clip, reference: !!dl.reference };
      await draw(dl.png, l.canvas);
      if (dl.maskPng) { l.mask = canvasOf(this.size); await draw(dl.maskPng, l.mask); }
      layers.push(l);
    }
    this.layers = layers;
    this.current = Math.min(Math.max(1, d.current), layers.length - 1);
    this.records = d.records ?? [];
    this.colour = d.colour ?? this.colour;
    this.colour2 = d.colour2 ?? this.colour2;
    if (d.brushId) this.setBrush(d.brushId);
    this.undoStack = []; this.redoStack = [];
    this.render();
    this.changed();
  }
}

const FILTER_LABELS: Record<FilterName, string> = {
  hsb: "Hue, saturation, brightness", brightnessContrast: "Brightness and contrast", colourBalance: "Colour balance", levels: "Levels", invert: "Invert",
  desaturate: "Black and white", posterize: "Posterize", threshold: "Threshold", gradientMap: "Gradient map", blur: "Blur", motionBlur: "Motion blur",
  sharpen: "Sharpen", noise: "Noise", pixelate: "Pixelate", halftone: "Halftone", bloom: "Bloom", chromatic: "Chromatic aberration", glitch: "Glitch",
  vignette: "Vignette", emboss: "Emboss",
};

const LAYER_PROP_LABELS: Record<string, string> = {
  visible: "Show or hide layer", opacity: "Layer opacity", blend: "Blend mode", alphaLock: "Lock alpha", clip: "Clip to below", name: "Rename layer",
  lockAll: "Lock layer", reference: "Reference layer", editMask: "Edit mask",
};

function bounds(pts: [number, number][]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

/** The box around a canvas's non-transparent pixels, sampled every 4 pixels for speed. */
function alphaBounds(c: HTMLCanvasElement): [number, number, number, number] {
  const s = c.width, d = ctx2d(c).getImageData(0, 0, s, s).data;
  let x0 = s, y0 = s, x1 = 0, y1 = 0;
  for (let y = 0; y < s; y += 4) for (let x = 0; x < s; x += 4) if (d[(y * s + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 4); y1 = Math.max(y1, y + 4); }
  return x1 > x0 ? [x0, y0, x1, y1] : [0, 0, s, s];
}
