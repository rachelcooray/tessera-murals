"use client";
/**
 * The wall. Canvas 2D for Phase 1; thumbnails are baked into one atlas so a frame is
 * at most 400 image blits. Phase 5 moves this to WebGL if mid-range phones need it.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { accentFromRgb, hexToRgb } from "@/lib/colour";
import type { Tile } from "@/lib/types";
import { placeLabel, tileImage } from "./ui";

export interface MuralApi { zoom: (f: number) => void; fit: () => void }
export interface MuralProps {
  tiles: Tile[];
  n?: number;
  onOpen?: (t: Tile, rect: DOMRect) => void;
  onEmpty?: (x: number, y: number, rect: DOMRect) => void;
  onTint?: (hex: string | null) => void;
  onInteract?: () => void;
  onArrive?: (t: Tile, rect: DOMRect) => void;
  hiddenId?: string | null;
  pulseId?: string | null;
  flyToId?: string | null;
  drift?: boolean;
  pullback?: boolean;
  interactive?: boolean;
  phoneZoom?: boolean;
  apiRef?: RefObject<MuralApi | null>;
  label?: string;
}

const TH = 128;
const G = 0.08;
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
type Cam = { cx: number; cy: number; s: number };

export function Mural(props: MuralProps) {
  const { n = 20, interactive = true } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pr = useRef(props);
  const [announce, setAnnounce] = useState("");
  useLayoutEffect(() => { pr.current = props; });

  const m = useRef({
    W: 0, H: 0, dpr: 1, cx: n / 2, cy: n / 2, s: 20, fitS: 20, minS: 10, maxS: 200, ready: false,
    atlas: null as HTMLCanvasElement | null, grid: new Map<number, Tile>(), loaded: new Map<string, number>(), requested: new Set<string>(),
    focus: null as { x: number; y: number } | null, hover: null as { x: number; y: number } | null,
    lastInteract: 0, anim: null as null | { from: Cam; to: Cam; t0: number; dur: number; done?: () => void },
    pointers: new Map<number, { x: number; y: number }>(), downAt: 0, moved: 0, pinch: 0, mid: null as null | { x: number; y: number },
    tintAt: 0, tintKey: "", reduced: false, font: "sans-serif",
  });

  // grid + image loading
  useEffect(() => {
    const st = m.current;
    st.grid = new Map(props.tiles.map((t) => [t.y * n + t.x, t]));
    if (!st.atlas) { st.atlas = document.createElement("canvas"); st.atlas.width = st.atlas.height = TH * n; }
    const actx = st.atlas.getContext("2d")!;
    for (const t of props.tiles) {
      if (t.status !== "approved" || st.requested.has(t.id)) continue;
      st.requested.add(t.id);
      const img = new Image();
      img.onload = () => {
        const sz = Math.min(img.naturalWidth || 512, img.naturalHeight || 512);
        actx.drawImage(img, ((img.naturalWidth || sz) - sz) / 2, ((img.naturalHeight || sz) - sz) / 2, sz, sz, t.x * TH, t.y * TH, TH, TH);
        st.loaded.set(t.id, performance.now() + (st.reduced ? 0 : Math.random() * 1100));
      };
      img.src = tileImage(t, TH);
    }
  }, [props.tiles, n]);

  // camera helpers
  const sx = (wx: number) => (wx - m.current.cx) * m.current.s + m.current.W / 2;
  const sy = (wy: number) => (wy - m.current.cy) * m.current.s + m.current.H / 2;
  const wxOf = (x: number) => (x - m.current.W / 2) / m.current.s + m.current.cx;
  const wyOf = (y: number) => (y - m.current.H / 2) / m.current.s + m.current.cy;
  const clamp = () => {
    const st = m.current;
    st.s = Math.max(st.minS, Math.min(st.maxS, st.s));
    st.cx = Math.max(0, Math.min(n, st.cx));
    st.cy = Math.max(0, Math.min(n, st.cy));
  };
  const cellRect = (x: number, y: number) => {
    const r = canvas.current!.getBoundingClientRect();
    const ps = (1 - G) * m.current.s;
    return new DOMRect(r.left + sx(x + G / 2), r.top + sy(y + G / 2), ps, ps);
  };
  const animTo = (to: Cam, dur: number, done?: () => void) => {
    const st = m.current;
    st.anim = { from: { cx: st.cx, cy: st.cy, s: st.s }, to, t0: performance.now(), dur: st.reduced ? 1 : dur, done };
  };
  const zoomAt = (px: number, py: number, f: number) => {
    const st = m.current;
    const wx = wxOf(px), wy = wyOf(py);
    st.s = Math.max(st.minS, Math.min(st.maxS, st.s * f));
    st.cx = wx - (px - st.W / 2) / st.s;
    st.cy = wy - (py - st.H / 2) / st.s;
    clamp();
  };
  const touch = () => { m.current.lastInteract = performance.now(); m.current.anim = null; pr.current.onInteract?.(); };

  const describe = (x: number, y: number) => {
    const t = m.current.grid.get(y * n + x);
    if (!t) return `Empty spot, ${placeLabel({ x, y })}. Press Enter to claim it.`;
    if (t.status === "pending") return `Reserved spot, ${placeLabel({ x, y })}, waiting for review.`;
    return `${t.displayName ?? "Anonymous"}, ${t.origin === "hand" ? "made by hand" : "made with AI"}, ${placeLabel({ x, y })}${t.phrase ? `: ${t.phrase}` : ""}. Press Enter to open.`;
  };
  const activate = (x: number, y: number) => {
    const t = m.current.grid.get(y * n + x);
    const rect = cellRect(x, y);
    if (t?.status === "approved") pr.current.onOpen?.(t, rect);
    else if (!t) pr.current.onEmpty?.(x, y, rect);
  };

  // sizing, input and render loop
  useEffect(() => {
    const st = m.current, el = wrap.current!, cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    st.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    st.font = getComputedStyle(document.body).fontFamily;

    const resize = () => {
      const r = el.getBoundingClientRect();
      st.W = r.width; st.H = r.height; st.dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(st.W * st.dpr); cv.height = Math.round(st.H * st.dpr);
      const phone = pr.current.phoneZoom && st.W < 700;
      const whole = Math.min(st.W - 32, st.H - (pr.current.phoneZoom ? 230 : 32)) / n;
      st.fitS = phone ? st.W / 9.5 : Math.max(8, whole);
      st.minS = Math.min(st.fitS * 0.7, Math.min(st.W, st.H) / (n + 4));
      st.maxS = Math.min(st.W, st.H) / 2.6;
      if (!st.ready) {
        st.ready = true;
        st.s = st.fitS;
        if (pr.current.phoneZoom && !phone) st.cy = n / 2 + 80 / st.s;
        if (pr.current.pullback) {
          const s0 = st.s;
          st.s = st.maxS * 0.6; st.cx = n * 0.35; st.cy = n * 0.4;
          animTo({ cx: n / 2, cy: n / 2, s: s0 }, 4200);
        }
      }
      clamp();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const p = pr.current;
      if (st.anim) {
        const k = Math.min(1, (now - st.anim.t0) / st.anim.dur), e = ease(k);
        st.cx = st.anim.from.cx + (st.anim.to.cx - st.anim.from.cx) * e;
        st.cy = st.anim.from.cy + (st.anim.to.cy - st.anim.from.cy) * e;
        st.s = st.anim.from.s + (st.anim.to.s - st.anim.from.s) * e;
        if (k >= 1) { const d = st.anim.done; st.anim = null; d?.(); }
      } else if (p.drift && !st.reduced && st.pointers.size === 0 && now - st.lastInteract > 6000) {
        st.cx += Math.sin(now / 9000) * 0.004;
        st.cy += Math.cos(now / 12000) * 0.003;
        clamp();
      }
      const { W, H, s } = st;
      ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const b0x = sx(-0.4), b0y = sy(-0.4), bs = (n + 0.8) * s;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.65)"; ctx.shadowBlur = 60; ctx.shadowOffsetY = 30;
      ctx.fillStyle = "#000000"; ctx.fillRect(b0x, b0y, bs, bs);
      ctx.restore();
      ctx.strokeStyle = "#2c2c2e"; ctx.lineWidth = 1; ctx.strokeRect(b0x + 0.5, b0y + 0.5, bs - 1, bs - 1);

      const x0 = Math.max(0, Math.floor(wxOf(0))), x1 = Math.min(n - 1, Math.floor(wxOf(W)));
      const y0 = Math.max(0, Math.floor(wyOf(0))), y1 = Math.min(n - 1, Math.floor(wyOf(H)));
      const ps = (1 - G) * s;
      const pulse = 0.5 + 0.5 * Math.sin(now / 420);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const t = st.grid.get(y * n + x);
        const px = sx(x + G / 2), py = sy(y + G / 2);
        if (t && t.status === "approved" && t.id !== p.hiddenId) {
          const wake = st.loaded.get(t.id);
          if (wake === undefined || now < wake) { ctx.fillStyle = "rgba(239,227,204,0.025)"; ctx.fillRect(px, py, ps, ps); continue; }
          const a = Math.min(1, (now - wake) / 900);
          ctx.globalAlpha = a;
          ctx.drawImage(st.atlas!, x * TH, y * TH, TH, TH, px, py, ps, ps);
          ctx.globalAlpha = 1;
          const fresh = t.approvedAt && Date.now() - Date.parse(t.approvedAt) < 15 * 60000;
          if (a < 1 || fresh) {
            ctx.save();
            ctx.shadowColor = "rgba(245,245,247,0.9)"; ctx.shadowBlur = 18;
            ctx.strokeStyle = `rgba(221,187,110,${a < 1 ? (1 - a) * 0.7 : 0.35 + 0.4 * pulse})`; ctx.lineWidth = 2;
            ctx.strokeRect(px, py, ps, ps);
            ctx.restore();
          }
        } else if (t && t.status === "pending") {
          ctx.fillStyle = "rgba(245,245,247,0.06)"; ctx.fillRect(px, py, ps, ps);
          ctx.strokeStyle = `rgba(245,245,247,${0.25 + 0.35 * pulse})`; ctx.lineWidth = 1.5;
          ctx.strokeRect(px + 0.75, py + 0.75, ps - 1.5, ps - 1.5);
        } else if (t && t.id === p.hiddenId) {
          ctx.fillStyle = "#050403"; ctx.fillRect(px, py, ps, ps);
        } else {
          ctx.fillStyle = "rgba(239,227,204,0.025)"; ctx.fillRect(px, py, ps, ps);
          if (ps > 9) {
            ctx.setLineDash([3, 3]); ctx.strokeStyle = "rgba(239,227,204,0.12)"; ctx.lineWidth = 1;
            ctx.strokeRect(px + 0.5, py + 0.5, ps - 1, ps - 1); ctx.setLineDash([]);
          }
        }
      }
      const ring = (c: { x: number; y: number } | null, colour: string, w: number) => {
        if (!c) return;
        ctx.strokeStyle = colour; ctx.lineWidth = w;
        ctx.strokeRect(sx(c.x + G / 2) - w, sy(c.y + G / 2) - w, ps + 2 * w, ps + 2 * w);
      };
      if (p.pulseId) {
        const t = [...st.grid.values()].find((v) => v.id === p.pulseId);
        if (t) ring(t, `rgba(239,227,204,${0.3 + 0.5 * pulse})`, 2);
      }
      if (st.hover && interactive) {
        ring(st.hover, "rgba(239,227,204,0.5)", 1);
        if (!st.grid.get(st.hover.y * n + st.hover.x) && ps > 26) {
          ctx.font = `12px ${st.font}`; ctx.fillStyle = "rgba(239,227,204,0.85)"; ctx.textAlign = "center";
          ctx.fillText("Claim this spot", sx(st.hover.x + 0.5), sy(st.hover.y + 1) + 16);
        }
      }
      ring(st.focus, "#f5f5f7", 2);

      if (p.onTint && now - st.tintAt > 400) {
        st.tintAt = now;
        let tint: string | null = null;
        if (st.s > st.fitS * 1.3) {
          let r = 0, g = 0, b = 0, c = 0;
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const t = st.grid.get(y * n + x);
            if (t?.status === "approved" && t.palette[0]) { const [a1, a2, a3] = hexToRgb(t.palette[0]); r += a1; g += a2; b += a3; c++; }
          }
          if (c) tint = accentFromRgb([r / c, g / c, b / c]);
        }
        const key = tint ?? "";
        if (key !== st.tintKey) { st.tintKey = key; p.onTint(tint); }
      }
    };
    raf = requestAnimationFrame(frame);

    if (!interactive) return () => { cancelAnimationFrame(raf); ro.disconnect(); };

    const local = (e: { clientX: number; clientY: number }) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const cellAt = (x: number, y: number) => {
      const wx = wxOf(x), wy = wyOf(y);
      const cx = Math.floor(wx), cy = Math.floor(wy);
      return cx >= 0 && cy >= 0 && cx < n && cy < n ? { x: cx, y: cy } : null;
    };
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      st.pointers.set(e.pointerId, local(e));
      if (st.pointers.size === 1) { st.downAt = performance.now(); st.moved = 0; }
      st.pinch = 0; st.mid = null;
      touch();
    };
    const move = (e: PointerEvent) => {
      const pt = local(e);
      if (!st.pointers.has(e.pointerId)) {
        if (e.pointerType === "mouse") st.hover = cellAt(pt.x, pt.y);
        return;
      }
      const prev = st.pointers.get(e.pointerId)!;
      st.pointers.set(e.pointerId, pt);
      if (st.pointers.size === 1) {
        st.cx -= (pt.x - prev.x) / st.s; st.cy -= (pt.y - prev.y) / st.s;
        st.moved += Math.abs(pt.x - prev.x) + Math.abs(pt.y - prev.y);
        clamp();
      } else if (st.pointers.size === 2) {
        const [a, b] = [...st.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (st.pinch && st.mid) {
          st.cx -= (mid.x - st.mid.x) / st.s; st.cy -= (mid.y - st.mid.y) / st.s;
          zoomAt(mid.x, mid.y, d / st.pinch);
        }
        st.pinch = d; st.mid = mid; st.moved += 100;
      }
      st.lastInteract = performance.now();
    };
    const up = (e: PointerEvent) => {
      if (!st.pointers.has(e.pointerId)) return;
      const pt = st.pointers.get(e.pointerId)!;
      if (st.pointers.size === 1 && st.moved < 8 && performance.now() - st.downAt < 500) {
        const c = cellAt(pt.x, pt.y);
        if (c) { st.focus = null; activate(c.x, c.y); }
      }
      st.pointers.delete(e.pointerId);
      st.pinch = 0; st.mid = null;
    };
    const leave = () => { st.hover = null; };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      touch();
      const pt = local(e);
      const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY));
      if (e.ctrlKey) zoomAt(pt.x, pt.y, Math.exp(-e.deltaY * 0.01));
      else if (mouseWheel) zoomAt(pt.x, pt.y, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)));
      else { st.cx += e.deltaX / st.s; st.cy += e.deltaY / st.s; clamp(); }
    };
    const key = (e: KeyboardEvent) => {
      const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (moves[e.key]) {
        e.preventDefault(); touch();
        const f = st.focus ?? { x: Math.floor(st.cx), y: Math.floor(st.cy) };
        const next = { x: Math.max(0, Math.min(n - 1, f.x + moves[e.key][0])), y: Math.max(0, Math.min(n - 1, f.y + moves[e.key][1])) };
        st.focus = next;
        const px = sx(next.x + 0.5), py = sy(next.y + 0.5), mg = st.s * 1.5;
        if (px < mg || py < mg || px > st.W - mg || py > st.H - mg) animTo({ cx: next.x + 0.5, cy: next.y + 0.5, s: st.s }, 300);
        setAnnounce(describe(next.x, next.y));
      } else if ((e.key === "Enter" || e.key === " ") && st.focus) {
        e.preventDefault(); activate(st.focus.x, st.focus.y);
      } else if (e.key === "+" || e.key === "=") { touch(); animTo({ cx: st.cx, cy: st.cy, s: Math.min(st.maxS, st.s * 1.4) }, 300); }
      else if (e.key === "-" || e.key === "_") { touch(); animTo({ cx: st.cx, cy: st.cy, s: Math.max(st.minS, st.s / 1.4) }, 300); }
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", leave); el.removeEventListener("wheel", wheel); el.removeEventListener("keydown", key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, n]);

  // imperative zoom buttons
  useEffect(() => {
    if (!props.apiRef) return;
    props.apiRef.current = {
      zoom: (f) => { touch(); const st = m.current; animTo({ cx: st.cx, cy: st.cy, s: Math.max(st.minS, Math.min(st.maxS, st.s * f)) }, 350); },
      fit: () => { touch(); animTo({ cx: n / 2, cy: n / 2, s: m.current.fitS }, 900); },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.apiRef, n]);

  // fly to a tile (shared links and gifts)
  useEffect(() => {
    if (!props.flyToId) return;
    let tries = 0;
    const go = () => {
      const st = m.current;
      const t = [...st.grid.values()].find((v) => v.id === props.flyToId);
      if (!t || !st.ready) { if (tries++ < 20) setTimeout(go, 100); return; }
      st.lastInteract = performance.now();
      animTo({ cx: t.x + 0.5, cy: t.y + 0.5, s: st.maxS * 0.55 }, 2200, () => pr.current.onArrive?.(t, cellRect(t.x, t.y)));
    };
    const id = setTimeout(go, 600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.flyToId]);

  return (
    <div ref={wrap} className="mural" tabIndex={interactive ? 0 : -1} role={interactive ? "application" : "img"}
      aria-label={props.label ?? "The mural. Drag or use arrow keys to move between tiles, Enter to open one, plus and minus to zoom."}>
      <canvas ref={canvas} />
      <p className="sr-only" aria-live="polite">{announce}</p>
    </div>
  );
}
