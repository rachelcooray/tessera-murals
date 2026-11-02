"use client";
/**
 * The paint tool's engine: layers, brushes, every tool, undo and redo, and the stroke record.
 * Plain canvas 2D, no libraries. Coordinates are canvas pixels (0 to size).
 */
import { hexToRgb, rgbToHex } from "../../colour.ts";
import { brushById, type BrushPreset } from "./brushes.ts";
import { floodMask } from "./fill.ts";
import type { StrokeRecord } from "./effort.ts";

export type Tool = "brush" | "smudge" | "eraser" | "fill" | "gradient" | "shapes" | "select" | "move" | "picker" | "text" | "symmetry" | "adjust";
export type Blend = "source-over" | "multiply" | "screen" | "overlay" | "soft-light" | "color" | "luminosity";
export type Symmetry = "off" | "vertical" | "horizontal" | "quad" | "radial";
export type ShapeKind = "line" | "rect" | "ellipse";
export type SelectKind = "lasso" | "rect";

export const BLENDS: { id: Blend; label: string }[] = [
  { id: "source-over", label: "Normal" }, { id: "multiply", label: "Multiply" }, { id: "screen", label: "Screen" },
  { id: "overlay", label: "Overlay" }, { id: "soft-light", label: "Soft light" }, { id: "color", label: "Colour" }, { id: "luminosity", label: "Luminosity" },
];

export interface Layer {
  id: string;
  name: string;
  canvas: HTMLCanvasElement;
  visible: boolean;
  opacity: number;
  blend: Blend;
  /** The background holds the slot colour and can't be painted on. */
  locked: boolean;
  alphaLock: boolean;
  /** Clip to the layer below. */
  clip: boolean;
}

export interface Point { x: number; y: number; pressure: number }

export interface Adjustments { hue: number; saturation: number; brightness: number; blur: number; noise: number }

interface Entry { undo(): void; redo(): void }

interface Selection { points: [number, number][]; inverted: boolean }

export interface DraftLayer { name: string; visible: boolean; opacity: number; blend: Blend; locked: boolean; alphaLock: boolean; clip: boolean; png: Blob | null }
export interface Draft { size: number; layers: DraftLayer[]; current: number; records: StrokeRecord[]; colour: string; brushId: string }

const canvasOf = (size: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
};
const ctx2d = (c: HTMLCanvasElement) => c.getContext("2d", { willReadFrequently: false })!;

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
  colour: string;
  symmetry: Symmetry = "off";
  shape: ShapeKind = "rect";
  shapeFill = false;
  selectKind: SelectKind = "lasso";
  fillTolerance = 32;
  selection: Selection | null = null;
  records: StrokeRecord[] = [];
  recent: string[] = [];
  /** Called after anything changes, so the screen can redraw its controls. */
  onChange: () => void = () => {};
  /** Called with a short message for the person painting, such as "The background is locked". */
  onNotice: (msg: string) => void = () => {};
  /** Called when the text tool is tapped, with where the text goes. */
  onTextTap: (x: number, y: number) => void = () => {};

  private readonly display: HTMLCanvasElement;
  private readonly maxLayers: number;
  private readonly undoLimit: number;
  private readonly buffer: HTMLCanvasElement;
  private readonly live: HTMLCanvasElement;
  private readonly scratch: HTMLCanvasElement;
  private readonly before: HTMLCanvasElement;
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  private nextId = 1;
  private gesture: null | {
    tool: Tool; start: number; input: string; last: Point; smooth: Point; since: number;
    origin: Point; dirty: [number, number, number, number]; floating?: HTMLCanvasElement; carry?: HTMLCanvasElement; lasso?: [number, number][];
  } = null;
  private floatOffset: [number, number] = [0, 0];
  private frame = 0;

  constructor(display: HTMLCanvasElement, size: number, slotHex: string, opts: { maxLayers: number; undoLimit: number }) {
    this.display = display;
    this.size = size;
    this.slotHex = slotHex;
    this.colour = slotHex;
    this.maxLayers = opts.maxLayers;
    this.undoLimit = opts.undoLimit;
    display.width = display.height = size;
    this.buffer = canvasOf(size);
    this.live = canvasOf(size);
    this.scratch = canvasOf(size);
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
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get canAddLayer(): boolean { return this.layers.length < this.maxLayers; }
  get layerLimit(): number { return this.maxLayers; }

  setBrush(id: string) {
    this.brush = brushById(id);
    this.brushSize = this.brush.size;
    this.brushOpacity = this.brush.opacity;
    this.hardness = this.brush.hardness;
    this.flow = this.brush.flow;
    this.smoothing = this.brush.smoothing;
    this.changed();
  }

  /** Changes tool options and redraws the controls. */
  configure(patch: Partial<Pick<PaintEngine, "brushSize" | "brushOpacity" | "hardness" | "flow" | "smoothing" | "fillTolerance" | "symmetry" | "shape" | "shapeFill" | "selectKind">>) {
    Object.assign(this, patch);
    this.changed();
  }

  setColour(hex: string) {
    this.colour = hex;
    this.changed();
  }

  /** Remembers a colour that was actually used, newest first. */
  private useColour() {
    this.recent = [this.colour, ...this.recent.filter((c) => c !== this.colour)].slice(0, 8);
  }

  setTool(t: Tool) {
    if (this.gesture) return;
    this.tool = t;
    this.changed();
  }

  /* ---------- pointer input ---------- */

  down(p: Point, input: string) {
    if (this.gesture) return;
    const t = this.tool;
    const paints = t === "brush" || t === "smudge" || t === "eraser" || t === "fill" || t === "gradient" || t === "shapes" || t === "move" || t === "text" || t === "adjust";
    if (paints && this.layer.locked) { this.onNotice("The background holds your colour and is locked. Pick another layer to paint on."); return; }
    if (paints && !this.layer.visible) { this.onNotice("This layer is hidden. Show it to paint on it."); return; }
    if (t === "symmetry" || t === "adjust") return;
    if (t === "picker") { this.pick(p); return; }
    if (t === "text") { this.onTextTap(p.x, p.y); return; }
    if (t === "fill") { this.fill(p, input); return; }
    this.gesture = { tool: t, start: Date.now(), input, last: p, smooth: p, since: 0, origin: p, dirty: [p.x, p.y, p.x, p.y] };
    if (t === "select") { this.gesture.lasso = [[p.x, p.y]]; return; }
    this.beginOp();
    const bctx = ctx2d(this.buffer);
    bctx.clearRect(0, 0, this.size, this.size);
    if (t === "brush" || t === "eraser") this.dabsTo(p, p, true);
    if (t === "smudge") {
      const s = Math.ceil(this.brushSize);
      const carry = canvasOf(s);
      ctx2d(carry).drawImage(this.layer.canvas, p.x - s / 2, p.y - s / 2, s, s, 0, 0, s, s);
      this.gesture.carry = carry;
    }
    if (t === "move") this.lift();
    this.schedule();
  }

  move(points: Point[]) {
    const g = this.gesture;
    if (!g) return;
    for (const p of points) {
      if (g.tool === "select") {
        if (this.selectKind === "lasso") g.lasso!.push([p.x, p.y]);
        else g.lasso = [[g.origin.x, g.origin.y], [p.x, g.origin.y], [p.x, p.y], [g.origin.x, p.y]];
        continue;
      }
      if (g.tool === "brush" || g.tool === "eraser" || g.tool === "smudge") {
        const k = 1 - this.smoothing * 0.85;
        const s: Point = { x: g.smooth.x + (p.x - g.smooth.x) * k, y: g.smooth.y + (p.y - g.smooth.y) * k, pressure: p.pressure };
        if (g.tool === "smudge") this.smudgeTo(g.smooth, s); else this.dabsTo(g.smooth, s, false);
        g.smooth = s;
      }
      if (g.tool === "gradient") this.drawGradient(g.origin, p);
      if (g.tool === "shapes") this.drawShape(g.origin, p);
      if (g.tool === "move") this.floatOffset = [p.x - g.origin.x, p.y - g.origin.y];
      g.last = p;
    }
    this.schedule();
  }

  up() {
    const g = this.gesture;
    if (!g) return;
    if (g.tool === "select") {
      const pts = g.lasso!;
      const [x0, y0, x1, y1] = bounds(pts);
      this.gesture = null;
      if (x1 - x0 < 4 || y1 - y0 < 4) this.setSelection(null);
      else this.setSelection({ points: pts, inverted: false });
      return;
    }
    if (g.tool === "move") {
      this.dropFloating();
      this.endOp([0, 0, this.size, this.size]);
    } else if (g.tool === "smudge") {
      this.endOp(g.dirty);
    } else {
      this.commitBuffer(g.tool === "eraser");
      this.endOp(g.tool === "gradient" ? [0, 0, this.size, this.size] : g.dirty);
      if (g.tool !== "eraser") this.useColour();
    }
    this.records.push({ tool: g.tool, start: g.start, end: Date.now(), input: g.input });
    this.gesture = null;
    this.render();
    this.changed();
  }

  /** A second finger landed: drop the stroke in progress without keeping it. */
  cancel() {
    const g = this.gesture;
    if (!g) return;
    this.gesture = null;
    if (g.tool !== "select") {
      const lctx = ctx2d(this.layer.canvas);
      lctx.clearRect(0, 0, this.size, this.size);
      lctx.drawImage(this.before, 0, 0);
      ctx2d(this.buffer).clearRect(0, 0, this.size, this.size);
      this.floatOffset = [0, 0];
    }
    this.render();
  }

  /* ---------- brushes ---------- */

  private sizeAt(pressure: number) {
    return Math.max(1, this.brushSize * (this.brush.pressureSize ? 0.25 + 0.75 * pressure : 1));
  }

  private mirrors(x: number, y: number): [number, number][] {
    const c = this.size / 2;
    switch (this.symmetry) {
      case "vertical": return [[x, y], [2 * c - x, y]];
      case "horizontal": return [[x, y], [x, 2 * c - y]];
      case "quad": return [[x, y], [2 * c - x, y], [x, 2 * c - y], [2 * c - x, 2 * c - y]];
      case "radial": {
        const out: [number, number][] = [];
        const dx = x - c, dy = y - c;
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4, cos = Math.cos(a), sin = Math.sin(a);
          out.push([c + dx * cos - dy * sin, c + dx * sin + dy * cos]);
        }
        return out;
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
    let travelled = step - g.since;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    while (travelled <= dist) {
      const t = dist ? travelled / dist : 0;
      this.dab(ctx, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.pressure + (b.pressure - a.pressure) * t, angle);
      travelled += step;
    }
    g.since = dist - (travelled - step);
  }

  private dab(ctx: CanvasRenderingContext2D, x: number, y: number, pressure: number, angle: number) {
    const size = this.sizeAt(pressure);
    const r = size / 2;
    const alpha = Math.min(1, this.flow * (this.brush.pressureOpacity ? 0.2 + 0.8 * pressure : 1));
    const [cr, cg, cb] = hexToRgb(this.tool === "eraser" ? "#000000" : this.colour);
    const tex = this.tool === "eraser" ? "smooth" : this.brush.texture;
    this.markDirty(x, y, r + 2);
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
      } else {
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        if (tex === "bristle") {
          const n = 7, perp = angle + Math.PI / 2;
          for (let i = 0; i < n; i++) {
            const o = (i / (n - 1) - 0.5) * size * 0.9;
            const br = r * (0.18 + Math.random() * 0.12);
            ctx.globalAlpha = alpha * (0.6 + Math.random() * 0.4);
            ctx.beginPath(); ctx.arc(mx + Math.cos(perp) * o, my + Math.sin(perp) * o, br, 0, Math.PI * 2); ctx.fill();
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

  private smudgeTo(a: Point, b: Point) {
    const g = this.gesture!;
    const carry = g.carry!;
    const s = carry.width;
    const lctx = ctx2d(this.layer.canvas);
    const cctx = ctx2d(carry);
    const step = Math.max(1, s * 0.12);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const strength = Math.min(0.95, 0.35 + this.flow * 0.6);
    for (let d = step; d <= dist; d += step) {
      const t = d / dist, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      this.markDirty(x, y, s / 2 + 2);
      lctx.save();
      this.clipSelection(lctx);
      lctx.beginPath(); lctx.arc(x, y, s / 2, 0, Math.PI * 2); lctx.clip();
      lctx.globalAlpha = strength;
      lctx.drawImage(carry, x - s / 2, y - s / 2);
      lctx.restore();
      cctx.save();
      cctx.globalAlpha = 1 - strength;
      cctx.drawImage(this.layer.canvas, x - s / 2, y - s / 2, s, s, 0, 0, s, s);
      cctx.restore();
    }
  }

  private drawGradient(a: Point, b: Point) {
    const ctx = ctx2d(this.buffer);
    ctx.clearRect(0, 0, this.size, this.size);
    const [r, g, bl] = hexToRgb(this.colour);
    const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    grad.addColorStop(0, `rgba(${r},${g},${bl},1)`);
    grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.size, this.size);
  }

  private drawShape(a: Point, b: Point) {
    const ctx = ctx2d(this.buffer);
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.strokeStyle = ctx.fillStyle = this.colour;
    ctx.lineWidth = Math.max(1, this.brushSize / 2);
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.beginPath();
    if (this.shape === "line") { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    else if (this.shape === "rect") { ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); if (this.shapeFill) ctx.fill(); else ctx.stroke(); }
    else { ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2); if (this.shapeFill) ctx.fill(); else ctx.stroke(); }
    const pad = ctx.lineWidth + 2;
    const d = this.gesture!.dirty;
    d[0] = Math.min(d[0], a.x, b.x) - pad; d[1] = Math.min(d[1], a.y, b.y) - pad;
    d[2] = Math.max(d[2], a.x, b.x) + pad; d[3] = Math.max(d[3], a.y, b.y) + pad;
  }

  /* ---------- fill, picker, text ---------- */

  private fill(p: Point, input: string) {
    const start = Date.now();
    const flat = this.flatten();
    const data = ctx2d(flat).getImageData(0, 0, this.size, this.size);
    const mask = floodMask(data.data, this.size, this.size, p.x, p.y, this.fillTolerance, 1);
    const [r, g, b] = hexToRgb(this.colour);
    const out = new ImageData(this.size, this.size);
    for (let i = 0; i < mask.length; i++) if (mask[i]) { out.data[i * 4] = r; out.data[i * 4 + 1] = g; out.data[i * 4 + 2] = b; out.data[i * 4 + 3] = 255; }
    this.beginOp();
    ctx2d(this.buffer).putImageData(out, 0, 0);
    this.gesture = { tool: "fill", start, input, last: p, smooth: p, since: 0, origin: p, dirty: [0, 0, this.size, this.size] };
    this.commitBuffer(false);
    this.endOp([0, 0, this.size, this.size]);
    this.useColour();
    this.records.push({ tool: "fill", start, end: Date.now(), input });
    this.gesture = null;
    this.render();
    this.changed();
  }

  private pick(p: Point) {
    const flat = this.flatten();
    const d = ctx2d(flat).getImageData(Math.max(0, Math.min(this.size - 1, Math.floor(p.x))), Math.max(0, Math.min(this.size - 1, Math.floor(p.y))), 1, 1).data;
    this.setColour(rgbToHex([d[0], d[1], d[2]]));
  }

  placeText(text: string, x: number, y: number, px: number, family: string, input: string) {
    if (!text.trim() || this.layer.locked) return;
    const start = Date.now();
    this.beginOp();
    const ctx = ctx2d(this.buffer);
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.fillStyle = this.colour;
    ctx.font = `${px}px ${family}`;
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
    this.gesture = { tool: "text", start, input, last: { x, y, pressure: 1 }, smooth: { x, y, pressure: 1 }, since: 0, origin: { x, y, pressure: 1 }, dirty: [0, 0, this.size, this.size] };
    this.commitBuffer(false);
    this.endOp([0, 0, this.size, this.size]);
    this.useColour();
    this.records.push({ tool: "text", start, end: Date.now(), input });
    this.gesture = null;
    this.render();
    this.changed();
  }

  /* ---------- selection and move ---------- */

  private path(sel: Selection): Path2D {
    const p = new Path2D();
    if (sel.inverted) p.rect(0, 0, this.size, this.size);
    sel.points.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    return p;
  }

  private clipSelection(ctx: CanvasRenderingContext2D) {
    if (this.selection) ctx.clip(this.path(this.selection), "evenodd");
  }

  private setSelection(sel: Selection | null) {
    const was = this.selection;
    this.selection = sel;
    this.push({ undo: () => { this.selection = was; }, redo: () => { this.selection = sel; } });
    this.render();
    this.changed();
  }

  clearSelection() { if (this.selection) this.setSelection(null); }
  invertSelection() { if (this.selection) this.setSelection({ ...this.selection, inverted: !this.selection.inverted }); }

  /** Starts a move: the selected part (or the whole layer) floats until the finger lifts. */
  private lift() {
    const floating = canvasOf(this.size);
    const fctx = ctx2d(floating);
    fctx.save(); this.clipSelection(fctx); fctx.drawImage(this.layer.canvas, 0, 0); fctx.restore();
    const lctx = ctx2d(this.layer.canvas);
    lctx.save(); this.clipSelection(lctx);
    if (this.selection) { lctx.globalCompositeOperation = "destination-out"; lctx.drawImage(floating, 0, 0); }
    else lctx.clearRect(0, 0, this.size, this.size);
    lctx.restore();
    this.gesture!.floating = floating;
    this.floatOffset = [0, 0];
  }

  private dropFloating() {
    const g = this.gesture!;
    const [dx, dy] = this.floatOffset;
    ctx2d(this.layer.canvas).drawImage(g.floating!, dx, dy);
    if (this.selection && (dx || dy)) {
      const was = this.selection;
      const moved = { ...was, points: was.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
      this.selection = moved;
      this.push({ undo: () => { this.selection = was; }, redo: () => { this.selection = moved; } });
    }
    this.floatOffset = [0, 0];
  }

  /** Flips or turns the selection, or the whole layer. */
  transform(kind: "flipH" | "flipV" | "rotate") {
    if (this.layer.locked) { this.onNotice("The background is locked."); return; }
    this.beginOp();
    const [x0, y0, x1, y1] = this.selection && !this.selection.inverted ? bounds(this.selection.points) : [0, 0, this.size, this.size];
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const part = canvasOf(this.size);
    const pctx = ctx2d(part);
    pctx.save(); this.clipSelection(pctx); pctx.drawImage(this.layer.canvas, 0, 0); pctx.restore();
    const lctx = ctx2d(this.layer.canvas);
    lctx.save(); this.clipSelection(lctx); lctx.globalCompositeOperation = "destination-out"; lctx.drawImage(part, 0, 0); lctx.restore();
    lctx.save();
    lctx.translate(cx, cy);
    if (kind === "flipH") lctx.scale(-1, 1);
    if (kind === "flipV") lctx.scale(1, -1);
    if (kind === "rotate") lctx.rotate(Math.PI / 2);
    lctx.translate(-cx, -cy);
    lctx.drawImage(part, 0, 0);
    lctx.restore();
    this.endOp([0, 0, this.size, this.size]);
    this.render();
    this.changed();
  }

  /* ---------- adjustments ---------- */

  adjust(a: Adjustments) {
    if (this.layer.locked) { this.onNotice("The background is locked. Pick another layer."); return; }
    this.beginOp();
    const src = ctx2d(this.layer.canvas).getImageData(0, 0, this.size, this.size);
    const d = src.data;
    if (a.hue || a.saturation || a.brightness || a.noise) {
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        let r = d[i], g = d[i + 1], b = d[i + 2];
        if (a.hue || a.saturation) {
          const hsl = rgbHsl(r, g, b);
          const out = hslRgb(hsl[0] + a.hue, Math.max(0, Math.min(1, hsl[1] * (1 + a.saturation / 100))), hsl[2]);
          r = out[0]; g = out[1]; b = out[2];
        }
        if (a.brightness) { const k = a.brightness * 2.55; r += k; g += k; b += k; }
        if (a.noise) { const n = (Math.random() - 0.5) * a.noise * 2; r += n; g += n; b += n; }
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
    }
    if (a.blur > 0) boxBlur(d, this.size, this.size, Math.round(a.blur));
    const out = canvasOf(this.size);
    ctx2d(out).putImageData(src, 0, 0);
    const lctx = ctx2d(this.layer.canvas);
    lctx.save();
    this.clipSelection(lctx);
    lctx.clearRect(0, 0, this.size, this.size);
    lctx.drawImage(out, 0, 0);
    lctx.restore();
    this.endOp([0, 0, this.size, this.size]);
    this.render();
    this.changed();
  }

  /* ---------- layers ---------- */

  private makeLayer(name: string): Layer {
    return { id: `l${this.nextId++}`, name, canvas: canvasOf(this.size), visible: true, opacity: 1, blend: "source-over", locked: false, alphaLock: false, clip: false };
  }

  private setLayers(next: Layer[], current: number) {
    const was = this.layers, wasCurrent = this.current;
    this.layers = next; this.current = current;
    this.push({ undo: () => { this.layers = was; this.current = wasCurrent; }, redo: () => { this.layers = next; this.current = current; } });
    this.render();
    this.changed();
  }

  addLayer() {
    if (!this.canAddLayer) { this.onNotice(`Up to ${this.maxLayers} layers.`); return; }
    const l = this.makeLayer(`Layer ${this.nextId - 1}`);
    const next = [...this.layers];
    next.splice(this.current + 1, 0, l);
    this.setLayers(next, this.current + 1);
  }

  duplicateLayer() {
    if (!this.canAddLayer) { this.onNotice(`Up to ${this.maxLayers} layers.`); return; }
    const src = this.layer;
    const l = { ...this.makeLayer(`${src.name} copy`), opacity: src.opacity, blend: src.blend, alphaLock: src.alphaLock, clip: src.clip };
    ctx2d(l.canvas).drawImage(src.canvas, 0, 0);
    const next = [...this.layers];
    next.splice(this.current + 1, 0, l);
    this.setLayers(next, this.current + 1);
  }

  deleteLayer() {
    if (this.layer.locked) { this.onNotice("The background can't be deleted."); return; }
    if (this.layers.length <= 2) { this.onNotice("Keep at least one layer to paint on."); return; }
    const next = this.layers.filter((_, i) => i !== this.current);
    this.setLayers(next, Math.max(1, this.current - 1));
  }

  mergeDown() {
    if (this.current <= 1) { this.onNotice("Nothing to merge into. The background stays separate."); return; }
    const top = this.layer, below = this.layers[this.current - 1];
    const merged = { ...below, id: `l${this.nextId++}`, canvas: canvasOf(this.size) };
    const m = ctx2d(merged.canvas);
    m.drawImage(below.canvas, 0, 0);
    m.globalAlpha = top.opacity;
    m.globalCompositeOperation = top.blend;
    m.drawImage(top.clip ? this.clipped(top.canvas, below.canvas) : top.canvas, 0, 0);
    const next = [...this.layers];
    next.splice(this.current - 1, 2, merged);
    this.setLayers(next, this.current - 1);
  }

  moveLayer(dir: -1 | 1) {
    const to = this.current + dir;
    if (this.layer.locked || to < 1 || to >= this.layers.length) return;
    const next = [...this.layers];
    [next[this.current], next[to]] = [next[to], next[this.current]];
    this.setLayers(next, to);
  }

  selectLayer(i: number) { this.current = i; this.changed(); }

  setLayerProp<K extends "visible" | "opacity" | "blend" | "alphaLock" | "clip" | "name">(i: number, key: K, value: Layer[K]) {
    const l = this.layers[i];
    if (l.locked && key !== "visible") return;
    const was = l[key];
    const id = l.id;
    const apply = (v: Layer[K]) => { const x = this.layers.find((y) => y.id === id); if (x) x[key] = v; };
    apply(value);
    this.push({ undo: () => apply(was), redo: () => apply(value) });
    this.render();
    this.changed();
  }

  /* ---------- undo ---------- */

  private beginOp() {
    const b = ctx2d(this.before);
    b.clearRect(0, 0, this.size, this.size);
    b.drawImage(this.layer.canvas, 0, 0);
  }

  private endOp(dirty: [number, number, number, number]) {
    const x = Math.max(0, Math.floor(dirty[0])), y = Math.max(0, Math.floor(dirty[1]));
    const w = Math.min(this.size, Math.ceil(dirty[2])) - x, h = Math.min(this.size, Math.ceil(dirty[3])) - y;
    if (w <= 0 || h <= 0) return;
    const layerId = this.layer.id;
    const was = ctx2d(this.before).getImageData(x, y, w, h);
    const now = ctx2d(this.layer.canvas).getImageData(x, y, w, h);
    const put = (img: ImageData) => { const l = this.layers.find((z) => z.id === layerId); if (l) ctx2d(l.canvas).putImageData(img, x, y); };
    this.push({ undo: () => put(was), redo: () => put(now) });
  }

  private push(e: Entry) {
    this.undoStack.push(e);
    if (this.undoStack.length > this.undoLimit) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    const e = this.undoStack.pop();
    if (!e || this.gesture) return;
    e.undo();
    this.redoStack.push(e);
    this.current = Math.min(this.current, this.layers.length - 1);
    this.render();
    this.changed();
  }

  redo() {
    const e = this.redoStack.pop();
    if (!e || this.gesture) return;
    e.redo();
    this.undoStack.push(e);
    this.current = Math.min(this.current, this.layers.length - 1);
    this.render();
    this.changed();
  }

  /* ---------- drawing to the screen ---------- */

  private commitBuffer(erase: boolean) {
    const lctx = ctx2d(this.layer.canvas);
    lctx.save();
    this.clipSelection(lctx);
    lctx.globalAlpha = this.brushOpacity;
    lctx.globalCompositeOperation = erase ? "destination-out" : this.layer.alphaLock ? "source-atop" : "source-over";
    lctx.drawImage(this.buffer, 0, 0);
    lctx.restore();
    ctx2d(this.buffer).clearRect(0, 0, this.size, this.size);
  }

  /** The current layer as it would look if the stroke in progress were kept. */
  private liveLayer(): HTMLCanvasElement {
    const g = this.gesture;
    const ctx = ctx2d(this.live);
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.drawImage(this.layer.canvas, 0, 0);
    if (g && (g.tool === "brush" || g.tool === "eraser" || g.tool === "gradient" || g.tool === "shapes")) {
      ctx.save();
      this.clipSelection(ctx);
      ctx.globalAlpha = this.brushOpacity;
      ctx.globalCompositeOperation = g.tool === "eraser" ? "destination-out" : this.layer.alphaLock ? "source-atop" : "source-over";
      ctx.drawImage(this.buffer, 0, 0);
      ctx.restore();
    }
    if (g?.floating) ctx.drawImage(g.floating, this.floatOffset[0], this.floatOffset[1]);
    return this.live;
  }

  private clipped(top: HTMLCanvasElement, below: HTMLCanvasElement): HTMLCanvasElement {
    const s = ctx2d(this.scratch);
    s.save();
    s.globalCompositeOperation = "source-over";
    s.clearRect(0, 0, this.size, this.size);
    s.drawImage(top, 0, 0);
    s.globalCompositeOperation = "destination-in";
    s.drawImage(below, 0, 0);
    s.restore();
    return this.scratch;
  }

  private composite(ctx: CanvasRenderingContext2D, withLive: boolean) {
    ctx.save();
    ctx.clearRect(0, 0, this.size, this.size);
    this.layers.forEach((l, i) => {
      if (!l.visible) return;
      let src = withLive && i === this.current && this.gesture ? this.liveLayer() : l.canvas;
      if (l.clip && i > 0) src = this.clipped(src, this.layers[i - 1].canvas);
      ctx.globalAlpha = l.opacity;
      ctx.globalCompositeOperation = l.blend;
      ctx.drawImage(src, 0, 0);
    });
    ctx.restore();
  }

  /** All visible layers flattened, without selection outlines. */
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
    const lasso = this.gesture?.lasso;
    const pts = lasso ?? this.selection?.points;
    if (pts && pts.length > 1) {
      const [dx, dy] = this.gesture?.floating ? this.floatOffset : [0, 0];
      ctx.save();
      ctx.lineWidth = this.size / 400;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)));
      if (!lasso || this.selectKind === "rect") ctx.closePath();
      ctx.setLineDash([this.size / 120, this.size / 120]);
      ctx.strokeStyle = "#0e0b09"; ctx.stroke();
      ctx.lineDashOffset = this.size / 120;
      ctx.strokeStyle = "#efe3cc"; ctx.stroke();
      ctx.restore();
    }
  }

  private changed() { this.onChange(); }

  /* ---------- drafts ---------- */

  async serialize(): Promise<Draft> {
    const layers = await Promise.all(this.layers.map(async (l) => ({
      name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, locked: l.locked, alphaLock: l.alphaLock, clip: l.clip,
      png: await new Promise<Blob | null>((res) => l.canvas.toBlob(res, "image/png")),
    })));
    return { size: this.size, layers, current: this.current, records: this.records, colour: this.colour, brushId: this.brush.id };
  }

  async restore(d: Draft) {
    if (d.size !== this.size || !d.layers.length) return;
    const layers: Layer[] = [];
    for (const dl of d.layers) {
      const l = { ...this.makeLayer(dl.name), visible: dl.visible, opacity: dl.opacity, blend: dl.blend, locked: dl.locked, alphaLock: dl.alphaLock, clip: dl.clip };
      if (dl.png) {
        const bmp = await createImageBitmap(dl.png);
        ctx2d(l.canvas).drawImage(bmp, 0, 0);
        bmp.close();
      }
      layers.push(l);
    }
    this.layers = layers;
    this.current = Math.min(Math.max(1, d.current), layers.length - 1);
    this.records = d.records ?? [];
    this.colour = d.colour ?? this.colour;
    if (d.brushId) this.setBrush(d.brushId);
    this.undoStack = []; this.redoStack = [];
    this.render();
    this.changed();
  }
}

function bounds(pts: [number, number][]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

function rgbHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Three passes of a box blur, weighted by alpha so transparent edges don't darken. */
function boxBlur(d: Uint8ClampedArray, w: number, h: number, r: number) {
  const n = w * h;
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) { const a = d[i * 4 + 3] / 255; ch[0][i] = d[i * 4] * a; ch[1][i] = d[i * 4 + 1] * a; ch[2][i] = d[i * 4 + 2] * a; ch[3][i] = d[i * 4 + 3]; }
  const tmp = new Float32Array(n);
  const pass = (src: Float32Array) => {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += src[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = sum / (2 * r + 1);
        sum += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        src[y * w + x] = sum / (2 * r + 1);
        sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  };
  for (let k = 0; k < 3; k++) ch.forEach(pass);
  for (let i = 0; i < n; i++) {
    const a = ch[3][i];
    d[i * 4 + 3] = a;
    const inv = a > 0 ? 255 / a : 0;
    d[i * 4] = ch[0][i] * inv; d[i * 4 + 1] = ch[1][i] * inv; d[i * 4 + 2] = ch[2][i] * inv;
  }
}
