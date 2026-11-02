"use client";
/**
 * The paint tool: a full painting app for one tile. Phone layout with sheets, tablet and desktop layout
 * with a tool rail and side panels (see .pt rules in globals.css).
 */
import { useCallback, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { mosaicConfig } from "@/config/mosaic";
import { hexToRgb } from "@/lib/colour";
import { averageColour, colourMatch, type SlotColour } from "@/lib/mosaic/colours";
import { pixels, squareCanvas } from "@/lib/mosaic/image";
import { BRUSHES, BRUSH_SETS, hexToHsv, hsvToHex, isHex, paletteFor } from "@/lib/mosaic/paint/brushes";
import { loadDraft, saveDraft } from "@/lib/mosaic/paint/drafts";
import { paintStats, type PaintStats } from "@/lib/mosaic/paint/effort";
import { BLENDS, PaintEngine, type Adjustments, type Blend, type ShapeKind, type Symmetry, type Tool } from "@/lib/mosaic/paint/engine";

export interface PaintResult { canvas: HTMLCanvasElement; stats: PaintStats }

const TOOLS: { id: Tool; label: string; d: string; hint: string }[] = [
  { id: "brush", label: "Brush", d: "M18.4 2.6a2 2 0 0 1 2.9 2.9L11 15.8l-3-3zM8 12.8c-2 0-4 1.6-4 4 0 1.6-1 2.6-2 3.2 4 .8 8-1 8-4.2z", hint: "Pick a brush in the library. Pressure works with a stylus." },
  { id: "smudge", label: "Smudge", d: "M9 11V5a2 2 0 0 1 4 0v6M13 9a2 2 0 0 1 4 0v4c0 4-3 7-7 7a6 6 0 0 1-6-6v-2a2 2 0 0 1 4 0", hint: "Drag through paint to blend it." },
  { id: "eraser", label: "Erase", d: "M16 3l5 5-10 10H6l-3-3zM9 21h12M11 8l5 5", hint: "Erases this layer. Your slot colour shows through from the background." },
  { id: "fill", label: "Fill", d: "M5 11l7-7 8 8-7 7a2 2 0 0 1-2.8 0L5 13.8a2 2 0 0 1 0-2.8zM5 12h15M20 16c0 1.5 1 2.5 1 3.5a1 1 0 0 1-2 0c0-1 1-2 1-3.5z", hint: "Tap an area to fill it." },
  { id: "gradient", label: "Gradient", d: "M4 4h16v16H4zM4 14L14 4M4 20L20 4M10 20L20 10", hint: "Drag across the canvas. The colour fades out along the line." },
  { id: "shapes", label: "Shapes", d: "M3 11h10v10H3zM21 9a6 6 0 1 1-12 0a6 6 0 1 1 12 0", hint: "Drag to draw. Line width follows the brush size." },
  { id: "select", label: "Select", d: "M4 4h16v16H4z", hint: "Draw around an area. Painting then stays inside it." },
  { id: "move", label: "Move", d: "M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3", hint: "Drag to move the selection, or the whole layer." },
  { id: "picker", label: "Picker", d: "M19 3a2.1 2.1 0 0 1 3 3l-3 3-3-3zM16 6L5 17l-1 3 3-1 11-11", hint: "Tap anywhere to pick up that colour." },
  { id: "text", label: "Text", d: "M4 6V4h16v2M12 4v16M9 20h6", hint: "Tap where the text goes." },
  { id: "symmetry", label: "Mirror", d: "M12 2v20M8 7l-4 5 4 5M16 7l4 5-4 5", hint: "Brush, smudge and eraser strokes repeat in a mirror." },
  { id: "adjust", label: "Adjust", d: "M4 6h8M16 6h4M14 4v4M4 12h2M10 12h10M8 10v4M4 18h10M18 18h2M16 16v4", hint: "Changes the whole layer, or just the selection." },
];

const SYMMETRY: { id: Symmetry; label: string }[] = [{ id: "off", label: "Off" }, { id: "vertical", label: "Left and right" }, { id: "horizontal", label: "Top and bottom" }, { id: "quad", label: "Four ways" }, { id: "radial", label: "Radial" }];
const SHAPES: { id: ShapeKind; label: string }[] = [{ id: "line", label: "Line" }, { id: "rect", label: "Rectangle" }, { id: "ellipse", label: "Ellipse" }];
const NO_ADJUST: Adjustments = { hue: 0, saturation: 0, brightness: 0, blur: 0, noise: 0 };

function Svg({ d, dash, size = 20 }: { d: string; dash?: boolean; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash ? "3 3" : undefined} aria-hidden="true"><path d={d} /></svg>;
}

/** A small copy of a layer, redrawn whenever the painting changes (the key changes with it). */
function LayerThumb({ source }: { source: HTMLCanvasElement }) {
  const draw = useCallback((c: HTMLCanvasElement | null) => {
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(source, 0, 0, c.width, c.height);
  }, [source]);
  return <canvas ref={draw} width={88} height={88} className="pt-thumb" aria-hidden="true" />;
}

function Range({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="pt-range">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <output htmlFor={id}>{Math.round(value)}{unit}</output>
    </div>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="pt-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}

export function Paint({ slot, slotNumber, draftId, onBack, onDone }: { slot: SlotColour; slotNumber: number; draftId: string; onBack: () => void; onDone: (r: PaintResult) => void }) {
  const [engine, setEngine] = useState<PaintEngine | null>(null);
  const [tick, setTick] = useState(0);
  const [sheet, setSheet] = useState<null | "brush" | "colour" | "layers">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [match, setMatch] = useState(1);
  const [saved, setSaved] = useState(false);
  const [textAt, setTextAt] = useState<null | { x: number; y: number }>(null);
  const [text, setText] = useState("");
  const [textSize, setTextSize] = useState(96);
  const [textFont, setTextFont] = useState<"sans" | "serif">("serif");
  const [adj, setAdj] = useState<Adjustments>(NO_ADJUST);
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const [hueMemo, setHueMemo] = useState(0);
  const [brushSet, setBrushSet] = useState("Painting");
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastInput = useRef("touch");
  const pinch = useRef<null | { d: number; mx: number; my: number; view: { z: number; x: number; y: number } }>(null);
  const timers = useRef<{ save?: number; match?: number; notice?: number }>({});

  const attach = useCallback((el: HTMLCanvasElement | null) => {
    if (!el || el.dataset.ready) return;
    el.dataset.ready = "1";
    const e = new PaintEngine(el, mosaicConfig.paint.canvasPx, slot.hex, { maxLayers: mosaicConfig.paint.maxLayers, undoLimit: mosaicConfig.paint.undoSteps });
    const measure = () => {
      const small = squareCanvas(e.flatten(), 32);
      setMatch(colourMatch(averageColour(pixels(small).data), hexToRgb(slot.hex)));
    };
    e.onChange = () => {
      setTick((t) => t + 1);
      window.clearTimeout(timers.current.match);
      timers.current.match = window.setTimeout(measure, 250);
      window.clearTimeout(timers.current.save);
      setSaved(false);
      timers.current.save = window.setTimeout(() => { void e.serialize().then((d) => saveDraft(draftId, d)).then((ok) => setSaved(ok !== null)); }, 1500);
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

  const toCanvas = (ev: { clientX: number; clientY: number }, el: HTMLCanvasElement) => {
    const r = el.getBoundingClientRect();
    const size = mosaicConfig.paint.canvasPx;
    return { x: ((ev.clientX - r.left) / r.width) * size, y: ((ev.clientY - r.top) / r.height) * size };
  };
  const pressureOf = (ev: PointerEvent) => (ev.pointerType === "pen" ? ev.pressure || 0.5 : 1);

  function onDown(ev: ReactPointerEvent<HTMLCanvasElement>) {
    if (!engine) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    lastInput.current = ev.pointerType;
    pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.current.size === 2) {
      engine.cancel();
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view };
      return;
    }
    if (pointers.current.size > 2) return;
    engine.down({ ...toCanvas(ev, ev.currentTarget), pressure: pressureOf(ev.nativeEvent) }, ev.pointerType);
  }

  function onMove(ev: ReactPointerEvent<HTMLCanvasElement>) {
    if (!engine || !pointers.current.has(ev.pointerId)) return;
    pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const p = pinch.current;
    if (p && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const z = Math.max(1, Math.min(8, (p.view.z * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, p.d)));
      setView({ z, x: p.view.x + (a.x + b.x) / 2 - p.mx, y: p.view.y + (a.y + b.y) / 2 - p.my });
      return;
    }
    const native = ev.nativeEvent;
    const list = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    const events = list.length ? list : [native];
    const el = ev.currentTarget;
    engine.move(events.map((x) => ({ ...toCanvas(x, el), pressure: pressureOf(x) })));
  }

  function onUp(ev: ReactPointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(ev.pointerId);
    if (pinch.current) { if (pointers.current.size === 0) pinch.current = null; return; }
    engine?.up();
  }

  function onWheel(ev: ReactWheelEvent) {
    setView((v) => ({ ...v, z: Math.max(1, Math.min(8, v.z * (ev.deltaY < 0 ? 1.1 : 0.9))) }));
  }

  const e = engine;
  const tool = TOOLS.find((t) => t.id === (e?.tool ?? "brush"))!;
  const palette = paletteFor(slot);
  const [h0, s0, v0] = hexToHsv(e?.colour ?? slot.hex);
  const hue = s0 === 0 || v0 === 0 ? hueMemo : h0;
  const fontFamily = (k: "sans" | "serif") => getComputedStyle(document.body).getPropertyValue(k === "sans" ? "--sans" : "--serif").trim() || (k === "sans" ? "system-ui, sans-serif" : "Georgia, serif");
  const matchOk = match >= mosaicConfig.minColourMatch;

  function svPick(ev: ReactPointerEvent<HTMLDivElement>) {
    if (!e || (ev.type === "pointermove" && ev.buttons === 0)) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    const v = Math.max(0, Math.min(1, 1 - (ev.clientY - r.top) / r.height));
    e.setColour(hsvToHex(hue, s, v));
  }

  function finish() {
    if (!e) return;
    window.clearTimeout(timers.current.save);
    void e.serialize().then((d) => saveDraft(draftId, d));
    onDone({ canvas: e.flatten(), stats: paintStats(e.records) });
  }

  const brushPanel = e && (
    <section className="pt-panel" data-panel="brush" aria-label="Brushes">
      <div className="pt-panel__head"><h2>Brushes</h2><button type="button" className="pt-close" onClick={() => setSheet(null)}>Close</button></div>
      <div className="pt-brushes">
        <div role="tablist" aria-label="Brush sets" className="pt-sets">
          {BRUSH_SETS.map((s) => <button key={s} type="button" role="tab" aria-selected={brushSet === s} onClick={() => setBrushSet(s)}>{s}</button>)}
        </div>
        <div className="pt-brushlist">
          {BRUSHES.filter((b) => b.set === brushSet).map((b) => (
            <button key={b.id} type="button" aria-pressed={e.brush.id === b.id} onClick={() => { e.setBrush(b.id); if (e.tool !== "brush" && e.tool !== "eraser" && e.tool !== "smudge") e.setTool("brush"); }}>
              <span>{b.name}</span>
              <svg width="100%" height="22" viewBox="0 0 200 22" preserveAspectRatio="none" aria-hidden="true"><path d="M6 15 C 40 4, 80 20, 120 10 S 180 5, 194 12" fill="none" stroke="currentColor" strokeWidth={Math.max(1.5, b.size / 8)} strokeOpacity={b.opacity * (0.4 + b.flow * 0.6)} strokeDasharray={b.texture === "spray" ? "1 3" : b.texture === "scatter" ? "2 2" : b.texture === "grain" ? "1 1" : undefined} strokeLinecap="round" /></svg>
            </button>
          ))}
        </div>
      </div>
      <div className="pt-settings">
        <span className="pt-label">{e.brush.name} settings</span>
        <Range label="Size" value={e.brushSize} min={1} max={240} unit=" px" onChange={(v) => { e.configure({ brushSize: v }); }} />
        <Range label="Opacity" value={e.brushOpacity * 100} min={1} max={100} unit="%" onChange={(v) => { e.configure({ brushOpacity: v / 100 }); }} />
        <Range label="Hardness" value={e.hardness * 100} min={0} max={100} unit="%" onChange={(v) => { e.configure({ hardness: v / 100 }); }} />
        <Range label="Flow" value={e.flow * 100} min={1} max={100} unit="%" onChange={(v) => { e.configure({ flow: v / 100 }); }} />
        <Range label="Smoothing" value={e.smoothing * 100} min={0} max={100} unit="%" onChange={(v) => { e.configure({ smoothing: v / 100 }); }} />
      </div>
    </section>
  );

  const colourPanel = e && (
    <section className="pt-panel" data-panel="colour" aria-label="Colour">
      <div className="pt-panel__head"><h2>Colour</h2><button type="button" className="pt-close" onClick={() => setSheet(null)}>Close</button></div>
      <div className="pt-colour">
        <div className="pt-sv" role="slider" aria-label="Saturation and brightness" aria-valuenow={Math.round(v0 * 100)} aria-valuetext={`${Math.round(s0 * 100)}% saturation, ${Math.round(v0 * 100)}% brightness`} tabIndex={0}
          style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex(hue, 1, 1)})` }}
          onPointerDown={(ev) => { ev.currentTarget.setPointerCapture(ev.pointerId); svPick(ev); }} onPointerMove={svPick}>
          <span style={{ left: `${s0 * 100}%`, top: `${(1 - v0) * 100}%`, background: e.colour }} />
        </div>
        <div className="pt-colour__side">
          <div className="pt-compare"><span style={{ background: e.colour }} /><span style={{ background: slot.hex }} /></div>
          <div className="pt-compare__labels"><span>Now</span><span>Slot</span></div>
          <label className="pt-hex">Hex
            <input key={e.colour} defaultValue={e.colour.toUpperCase()} maxLength={7} onBlur={(ev) => { const v = ev.target.value.trim(); if (isHex(v)) e.setColour(v.startsWith("#") ? v.toLowerCase() : `#${v.toLowerCase()}`); }} onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }} />
          </label>
        </div>
      </div>
      <div className="pt-range pt-range--hue">
        <label htmlFor="pt-hue">Hue</label>
        <input id="pt-hue" type="range" min={0} max={359} value={Math.round(hue)} onChange={(ev) => { const h = Number(ev.target.value); setHueMemo(h); e.setColour(hsvToHex(h, s0 || 0.6, v0 || 0.8)); }} />
        <output htmlFor="pt-hue">{Math.round(hue)}°</output>
      </div>
      <span className="pt-label">Made from your slot colour</span>
      <div className="pt-swatches" role="radiogroup" aria-label="Colours from your slot">
        {palette.map((c) => <button key={c.label} type="button" role="radio" aria-checked={e.colour.toLowerCase() === c.hex.toLowerCase()} aria-label={c.label} style={{ background: c.hex }} onClick={() => e.setColour(c.hex)} />)}
      </div>
      {e.recent.length > 0 && <><span className="pt-label">Recent</span>
        <div className="pt-swatches pt-swatches--small">{e.recent.map((c) => <button key={c} type="button" aria-label={`Recent colour ${c}`} style={{ background: c }} onClick={() => e.setColour(c)} />)}</div></>}
      <p className="pt-note">Any colour is allowed. The meter shows how close the whole tile stays to slot {slotNumber}.</p>
    </section>
  );

  const layersPanel = e && (
    <section className="pt-panel" data-panel="layers" aria-label="Layers">
      <div className="pt-panel__head"><h2>Layers <small>{e.layers.length} of {e.layerLimit}</small></h2><button type="button" className="pt-close" onClick={() => setSheet(null)}>Close</button></div>
      <ol className="pt-layers">
        {e.layers.map((l, i) => ({ l, i })).reverse().map(({ l, i }) => (
          <li key={l.id} aria-current={i === e.current}>
            <button type="button" className="pt-layer" onClick={() => e.selectLayer(i)}>
              <LayerThumb key={`${l.id}-${tick}`} source={l.canvas} />
              <span className="pt-layer__text"><span>{l.name}</span><small>{l.locked ? "Your slot colour · locked" : `${BLENDS.find((b) => b.id === l.blend)?.label} · ${Math.round(l.opacity * 100)}%${l.clip ? " · clipped" : ""}${l.alphaLock ? " · alpha locked" : ""}`}</small></span>
            </button>
            <button type="button" className="pt-eye" aria-pressed={l.visible} aria-label={`${l.visible ? "Hide" : "Show"} ${l.name}`} onClick={() => e.setLayerProp(i, "visible", !l.visible)}>
              <Svg d={l.visible ? "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0" : "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6"} size={18} />
            </button>
          </li>
        ))}
      </ol>
      {!e.layer.locked && <div className="pt-settings">
        <span className="pt-label">{e.layer.name}</span>
        <Range label="Opacity" value={e.layer.opacity * 100} min={0} max={100} unit="%" onChange={(v) => e.setLayerProp(e.current, "opacity", v / 100)} />
        <label className="pt-select">Blend
          <select value={e.layer.blend} onChange={(ev) => e.setLayerProp(e.current, "blend", ev.target.value as Blend)}>{BLENDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>
        </label>
        <div className="pt-checks">
          <label><input type="checkbox" checked={e.layer.alphaLock} onChange={(ev) => e.setLayerProp(e.current, "alphaLock", ev.target.checked)} />Lock alpha</label>
          <label><input type="checkbox" checked={e.layer.clip} onChange={(ev) => e.setLayerProp(e.current, "clip", ev.target.checked)} />Clip to below</label>
        </div>
      </div>}
      <div className="pt-grid3">
        <button type="button" className="pt-btn pt-btn--primary" disabled={!e.canAddLayer} onClick={() => e.addLayer()}>New layer</button>
        <button type="button" className="pt-btn" disabled={!e.canAddLayer || e.layer.locked} onClick={() => e.duplicateLayer()}>Duplicate</button>
        <button type="button" className="pt-btn" disabled={e.current <= 1} onClick={() => e.mergeDown()}>Merge down</button>
        <button type="button" className="pt-btn" disabled={e.layer.locked || e.current >= e.layers.length - 1} onClick={() => e.moveLayer(1)}>Move up</button>
        <button type="button" className="pt-btn" disabled={e.current <= 1} onClick={() => e.moveLayer(-1)}>Move down</button>
        <button type="button" className="pt-btn pt-btn--danger" disabled={e.layer.locked || e.layers.length <= 2} onClick={() => e.deleteLayer()}>Delete</button>
      </div>
    </section>
  );

  const options = e && (() => {
    switch (e.tool) {
      case "fill": return <Range label="Tolerance" value={e.fillTolerance} min={0} max={128} onChange={(v) => { e.configure({ fillTolerance: v }); }} />;
      case "shapes": return <div className="pt-row"><Seg label="Shape" value={e.shape} options={SHAPES} onChange={(v) => { e.configure({ shape: v }); }} /><Seg label="Style" value={e.shapeFill ? "fill" : "line"} options={[{ id: "line", label: "Outline" }, { id: "fill", label: "Filled" }]} onChange={(v) => { e.configure({ shapeFill: v === "fill" }); }} /></div>;
      case "select": return <div className="pt-row"><Seg label="Selection" value={e.selectKind} options={[{ id: "lasso", label: "Lasso" }, { id: "rect", label: "Box" }]} onChange={(v) => { e.configure({ selectKind: v }); }} /><button type="button" className="pt-btn" disabled={!e.selection} onClick={() => e.invertSelection()}>Invert</button><button type="button" className="pt-btn" disabled={!e.selection} onClick={() => e.clearSelection()}>Clear</button></div>;
      case "move": return <div className="pt-row"><button type="button" className="pt-btn" onClick={() => e.transform("flipH")}>Flip ↔</button><button type="button" className="pt-btn" onClick={() => e.transform("flipV")}>Flip ↕</button><button type="button" className="pt-btn" onClick={() => e.transform("rotate")}>Turn 90°</button></div>;
      case "symmetry": return <Seg label="Mirror" value={e.symmetry} options={SYMMETRY} onChange={(v) => { e.configure({ symmetry: v }); }} />;
      case "text": return textAt ? (
        <div className="pt-text">
          <input className="pt-input" autoFocus value={text} maxLength={40} placeholder="Type here" onChange={(ev) => setText(ev.target.value)} aria-label="Text to place" />
          <Seg label="Font" value={textFont} options={[{ id: "serif", label: "Serif" }, { id: "sans", label: "Sans" }]} onChange={setTextFont} />
          <Range label="Text size" value={textSize} min={16} max={400} unit=" px" onChange={setTextSize} />
          <div className="pt-row"><button type="button" className="pt-btn" onClick={() => { setTextAt(null); setText(""); }}>Cancel</button><button type="button" className="pt-btn pt-btn--primary" disabled={!text.trim()} onClick={() => { e.placeText(text, textAt.x, textAt.y, textSize, fontFamily(textFont), lastInput.current); setTextAt(null); setText(""); }}>Place text</button></div>
        </div>) : null;
      case "adjust": return (
        <div className="pt-adjust">
          <Range label="Hue" value={adj.hue} min={-180} max={180} unit="°" onChange={(v) => setAdj({ ...adj, hue: v })} />
          <Range label="Saturation" value={adj.saturation} min={-100} max={100} unit="%" onChange={(v) => setAdj({ ...adj, saturation: v })} />
          <Range label="Brightness" value={adj.brightness} min={-100} max={100} unit="%" onChange={(v) => setAdj({ ...adj, brightness: v })} />
          <Range label="Blur" value={adj.blur} min={0} max={20} unit=" px" onChange={(v) => setAdj({ ...adj, blur: v })} />
          <Range label="Noise" value={adj.noise} min={0} max={60} onChange={(v) => setAdj({ ...adj, noise: v })} />
          <div className="pt-row"><button type="button" className="pt-btn" onClick={() => setAdj(NO_ADJUST)}>Reset</button><button type="button" className="pt-btn pt-btn--primary" disabled={JSON.stringify(adj) === JSON.stringify(NO_ADJUST)} onClick={() => { e.adjust(adj); setAdj(NO_ADJUST); }}>Apply to {e.layer.name}</button></div>
        </div>);
      default: return null;
    }
  })();

  return (
    <div className="pt">
      <header className="pt-head">
        <button type="button" className="pt-icon" aria-label="Back to your slot" onClick={onBack}><Svg d="M15 6l-6 6 6 6" /></button>
        <div className="pt-title"><span>Slot {slotNumber}</span><small>{saved ? "Draft saved on this device" : "Painting"}</small></div>
        <button type="button" className="pt-icon" aria-label="Undo" disabled={!e?.canUndo} onClick={() => e?.undo()}><Svg d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></button>
        <button type="button" className="pt-icon" aria-label="Redo" disabled={!e?.canRedo} onClick={() => e?.redo()}><Svg d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></button>
        <button type="button" className="pt-done" disabled={!e} onClick={finish}>Done</button>
      </header>

      <nav className="pt-tools" role="toolbar" aria-label="Tools">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" aria-pressed={e?.tool === t.id} onClick={() => { e?.setTool(t.id); if (t.id !== "text") setTextAt(null); }}>
            <Svg d={t.d} dash={t.id === "select"} /><span>{t.label}</span>
          </button>
        ))}
      </nav>

      <main className="pt-stage" onWheel={onWheel}>
        <div className="pt-canvas-wrap" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
          <canvas ref={attach} className="pt-canvas" aria-label={`Painting canvas for slot ${slotNumber}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        </div>
        {view.z !== 1 && <button type="button" className="pt-fit" onClick={() => setView({ z: 1, x: 0, y: 0 })}>{Math.round(view.z * 100)}% · Fit</button>}
        {notice && <p className="pt-notice" role="status">{notice}</p>}
      </main>

      <div className="pt-controls">
        <div className="pt-meter" aria-live="polite">
          <span className="pt-mini" aria-hidden="true"><i style={{ background: e?.colour ?? slot.hex }} /></span>
          <span className="pt-meter__bar"><i style={{ width: `${Math.round(match * 100)}%`, background: matchOk ? "#8fb093" : "#e0b070" }} /></span>
          <span style={{ color: matchOk ? "#8fb093" : "#e0b070" }}>Colour match {Math.round(match * 100)}%{matchOk ? "" : ", drifting"}</span>
        </div>
        {e && <>
          <Range label="Size" value={e.brushSize} min={1} max={240} unit=" px" onChange={(v) => { e.configure({ brushSize: v }); }} />
          <Range label="Opacity" value={e.brushOpacity * 100} min={1} max={100} unit="%" onChange={(v) => { e.configure({ brushOpacity: v / 100 }); }} />
          <div className="pt-quick">
            <button type="button" className="pt-chip" onClick={() => setSheet(sheet === "brush" ? null : "brush")}><span>{e.brush.name}</span><small>{e.brush.set}</small></button>
            <button type="button" className="pt-chip pt-chip--colour" aria-label="Colour" onClick={() => setSheet(sheet === "colour" ? null : "colour")}><i style={{ background: e.colour }} /></button>
            <button type="button" className="pt-chip pt-chip--layers" onClick={() => setSheet(sheet === "layers" ? null : "layers")}><Svg d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" size={18} />{e.layers.length}</button>
          </div>
        </>}
        <p className="pt-hint">{tool.hint}</p>
        {options}
      </div>

      <aside className={`pt-aside${sheet ? " is-open" : ""}`} data-sheet={sheet ?? ""}>
        {sheet && <button type="button" className="pt-scrim" aria-label="Close panel" onClick={() => setSheet(null)} />}
        {brushPanel}{colourPanel}{layersPanel}
      </aside>
    </div>
  );
}
