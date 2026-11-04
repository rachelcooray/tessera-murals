"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { site } from "@/config/site";
import { artDataUrl } from "@/lib/art";
import { tick } from "@/lib/mosaic/store";
import type { Mosaic, MosaicTile } from "@/lib/mosaic/types";
import { rnd } from "@/lib/rng";
import { Icon, Mark } from "../ui";

const NAV = [["/", "Commission"], ["/challenge", "Colour challenge"], ["/gallery", "Past mosaics"], ["/about", "About"]] as const;

/** Runs pool splits and hold releases that are due, once per page view. */
export function useHousekeeping() {
  useEffect(() => { tick(); }, []);
}

export function SiteHeader({ current }: { current?: string }) {
  useHousekeeping();
  return (
    <header className="header">
      <Link href="/" className="wordmark" aria-label="Tessera home"><Mark /><span>TESSERA</span></Link>
      <nav className="nav" aria-label="Main">
        {NAV.map(([href, label]) => <Link key={href} href={href} aria-current={current === href ? "page" : undefined}>{label}</Link>)}
      </nav>
      <div className="header__right">
        <Link href="/artist" className="btn btn--quiet header__cta">For artists</Link>
        <Link href="/start" className="btn btn--primary header__cta">Start a mosaic</Link>
        <details className="menu">
          <summary className="icon-btn" aria-label="Menu"><Icon name="menu" /></summary>
          <div className="menu__panel">
            {NAV.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
            <Link href="/artist">For artists</Link>
            <Link href="/start">Start a mosaic</Link>
          </div>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <span>Tessera · hidden mosaics, made by people. Prototype: data stays in this browser.</span>
      <nav aria-label="More">
        <a href={`mailto:${site.contactEmail}`}>Contact</a>
        <Link href="/about#terms">Terms</Link>
        <Link href="/about#policy">Content policy</Link>
        <Link href="/wall">Season 0 wall</Link>
      </nav>
    </footer>
  );
}

export function Page({ current, children, narrow }: { current?: string; children: ReactNode; narrow?: boolean }) {
  return (
    <div className="page">
      <SiteHeader current={current} />
      <main className="container" style={narrow ? { maxWidth: 760 } : undefined}>{children}</main>
      <SiteFooter />
    </div>
  );
}

export function FlowShell({ step, of, back, title, children, actions }: { step?: number; of?: number; back?: { href: string; label: string }; title: string; children: ReactNode; actions?: ReactNode }) {
  useHousekeeping();
  return (
    <div className="flow">
      <div className="flow__top">
        {back ? <Link className="flow__back" href={back.href}><Icon name="back" size={14} />{back.label}</Link> : <Link href="/" className="wordmark"><Mark size={16} /><span style={{ fontSize: 17 }}>TESSERA</span></Link>}
        <Link href="/" className="icon-btn" aria-label="Leave and go home"><Icon name="close" /></Link>
      </div>
      {step && of ? <div className="flow__progress"><i style={{ width: `${(step / of) * 100}%` }} /></div> : null}
      <main className="flow__main">
        <h1>{title}</h1>
        {children}
      </main>
      {actions ? <div className="flow__actions">{actions}</div> : null}
    </div>
  );
}

/** Background for one cell: an uploaded image, or a soft gradient in the slot colour for generated art. */
export function cellStyle(t: MosaicTile | undefined, slotHex: string, slot: number): CSSProperties {
  if (!t) return {};
  if (t.imageUrl) return { backgroundImage: `url(${t.imageUrl})`, backgroundSize: "cover" };
  const a = Math.floor(rnd(slot * 7 + 3) * 360);
  return { background: `linear-gradient(${a}deg, color-mix(in srgb, ${slotHex} 82%, #fff4e4), ${slotHex} 55%, color-mix(in srgb, ${slotHex} 78%, #000))` };
}

export type GridMode = "tiles" | "slots" | "hidden";

/**
 * The mosaic as a grid.
 *  tiles: placed tiles show their art, open slots are dashed
 *  slots: flat slot colours (owner preview)
 *  hidden: everything dark except the highlighted slot (what a contributor sees)
 */
const tileImages = new Map<string, HTMLImageElement>();

function mixHex(a: string, b: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return "#" + [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, "0")).join("");
}

/** A tile image, loaded once and shared. Calls onReady when it finishes loading. */
function tileImage(url: string, onReady: () => void): HTMLImageElement | null {
  const hit = tileImages.get(url);
  if (hit) return hit.complete && hit.naturalWidth ? hit : null;
  const img = new Image();
  img.onload = onReady;
  img.src = url;
  tileImages.set(url, img);
  return null;
}

/**
 * The mosaic, drawn on a canvas so 10,000 to 40,000 tiles stay fast.
 *  tiles: placed tiles show their art, open slots are dark
 *  slots: flat slot colours (owner preview)
 *  hidden: everything dark except the highlighted slot (what a contributor sees)
 * focus zooms in on one slot and its neighbours.
 */
export function MosaicGrid({ mosaic, tiles, mode = "tiles", highlight, marks, pick, label, maxWidth = 560, focus }: {
  mosaic: Pick<Mosaic, "cols" | "rows" | "slots">; tiles?: Map<number, MosaicTile>; mode?: GridMode; highlight?: number; marks?: number[];
  pick?: (slot: number) => void; label: string; maxWidth?: number; focus?: { slot: number; span: number };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(0);
  const [typed, setTyped] = useState("");
  const { cols, rows } = mosaic;
  const view = useMemo(() => {
    if (!focus) return { x0: 0, y0: 0, w: cols, h: rows };
    const span = Math.min(focus.span, cols, rows), fx = focus.slot % cols, fy = Math.floor(focus.slot / cols);
    return { x0: Math.max(0, Math.min(cols - span, fx - Math.floor(span / 2))), y0: Math.max(0, Math.min(rows - span, fy - Math.floor(span / 2))), w: span, h: span };
  }, [focus, cols, rows]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(maxWidth * dpr), H = Math.round((maxWidth * view.h / view.w) * dpr);
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    const g = c.getContext("2d")!;
    const cs = W / view.w, gap = cs > 10 ? Math.max(1, cs * 0.05) : 0;
    g.fillStyle = "#080605"; g.fillRect(0, 0, W, H);
    const redraw = () => setLoaded((n) => n + 1);
    for (let vy = 0; vy < view.h; vy++) for (let vx = 0; vx < view.w; vx++) {
      const i = (view.y0 + vy) * cols + view.x0 + vx, slot = mosaic.slots[i];
      if (!slot) continue;
      const x = vx * cs + gap / 2, y = vy * cs + gap / 2, w = cs - gap;
      if (mode === "slots") { g.fillStyle = slot.hex; g.fillRect(x, y, w, w); continue; }
      if (mode === "hidden") { g.fillStyle = i === highlight ? slot.hex : "#2a211a"; g.fillRect(x, y, w, w); continue; }
      const t = tiles?.get(i);
      if (!t) { g.fillStyle = "#1d1714"; g.fillRect(x, y, w, w); continue; }
      g.globalAlpha = t.status === "pending" ? 0.5 : 1;
      const img = t.imageUrl ? tileImage(t.imageUrl, redraw) : null;
      if (img) g.drawImage(img, x, y, w, w);
      else if (cs < 6) { g.fillStyle = t.averageHex || slot.hex; g.fillRect(x, y, w, w); }
      else {
        const a = rnd(i * 7 + 3) * Math.PI * 2, r = w / 2, grad = g.createLinearGradient(x + r - Math.cos(a) * r, y + r - Math.sin(a) * r, x + r + Math.cos(a) * r, y + r + Math.sin(a) * r);
        grad.addColorStop(0, mixHex(slot.hex, "#fff4e4", 0.18)); grad.addColorStop(0.55, slot.hex); grad.addColorStop(1, mixHex(slot.hex, "#000000", 0.22));
        g.fillStyle = grad; g.fillRect(x, y, w, w);
      }
      g.globalAlpha = 1;
    }
    const ring = (i: number, colour: string) => {
      const vx = (i % cols) - view.x0, vy = Math.floor(i / cols) - view.y0;
      if (vx < 0 || vy < 0 || vx >= view.w || vy >= view.h) return;
      const x = vx * cs, y = vy * cs, pad = Math.max(0, (Math.max(14 * dpr, cs) - cs) / 2);
      g.lineWidth = Math.max(2 * dpr, cs * 0.12);
      g.strokeStyle = "#080605"; g.strokeRect(x - pad - g.lineWidth, y - pad - g.lineWidth, cs + 2 * (pad + g.lineWidth), cs + 2 * (pad + g.lineWidth));
      g.strokeStyle = colour; g.strokeRect(x - pad, y - pad, cs + 2 * pad, cs + 2 * pad);
    };
    marks?.forEach((m) => ring(m, "#efe3cc"));
    if (highlight !== undefined && highlight >= 0) ring(highlight, "#c9a24f");
  }, [mosaic, tiles, mode, highlight, marks, maxWidth, view, cols, loaded]);

  function onClick(ev: ReactMouseEvent<HTMLCanvasElement>) {
    if (!pick) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const vx = Math.floor(((ev.clientX - r.left) / r.width) * view.w), vy = Math.floor(((ev.clientY - r.top) / r.height) * view.h);
    pick((view.y0 + vy) * cols + view.x0 + vx);
  }

  return (
    <div style={{ maxWidth, width: "100%" }}>
      <canvas ref={ref} role="img" aria-label={label} className="mcanvas" onClick={pick ? onClick : undefined} style={{ aspectRatio: `${view.w} / ${view.h}`, cursor: pick ? "pointer" : undefined }} />
      {pick && (
        <form className="row small" style={{ marginTop: 10, gap: 8 }} onSubmit={(e) => { e.preventDefault(); const n = Number(typed); if (n >= 1 && n <= cols * rows) { pick(n - 1); setTyped(""); } }}>
          <label htmlFor="slot-pick" className="muted">Or type a slot number</label>
          <input id="slot-pick" className="input" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))} style={{ width: 110, padding: "8px 10px", fontSize: 15 }} />
          <button className="btn" type="submit">Select</button>
        </form>
      )}
    </div>
  );
}

/** A single tile at a readable size. */
export function TileArt({ tile, slotHex, size = 240 }: { tile: MosaicTile; slotHex: string; size?: number }) {
  if (tile.imageUrl) return <img src={tile.imageUrl} alt={`Tile by ${tile.name ?? "an anonymous contributor"}`} width={size} height={size} style={{ width: size, height: size, objectFit: "cover", display: "block", boxShadow: "0 0 0 1px var(--line)" }} />;
  return (
    <span style={{ position: "relative", display: "block", width: size, height: size, boxShadow: "0 0 0 1px var(--line)" }}>
      {tile.art && <img src={artDataUrl(tile.art, size)} alt={tile.source === "studio" ? "Studio fill artwork" : "Sample artwork"} width={size} height={size} style={{ display: "block", width: size, height: size }} />}
      <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: slotHex, mixBlendMode: "color", opacity: 0.55 }} />
    </span>
  );
}

export function SourceLabel({ tile }: { tile: MosaicTile }) {
  const text = tile.source === "studio" ? "Studio fill" : tile.source === "sample" ? "Sample" : tile.medium ? `Made by hand · ${tile.medium}` : "Made by hand";
  return <span className="label"><Icon name={tile.source === "studio" || tile.source === "sample" ? "ai" : "hand"} size={13} />{text}</span>;
}

export function Swatch({ hex, size = 16 }: { hex: string; size?: number }) {
  return <span aria-hidden="true" style={{ display: "inline-block", width: size, height: size, background: hex, boxShadow: "0 0 0 1px rgba(0,0,0,.3)", flex: "0 0 auto" }} />;
}

/** Readable text colour on a background colour. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const l = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return l > 140 ? "#0e0b09" : "#efe3cc";
}

export function Todo({ children }: { children: ReactNode }) {
  return <span className="todo">{children}</span>;
}

export function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function baseUrl(): string {
  return `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}`;
}

export function Stat({ k, v, sub }: { k: string; v: ReactNode; sub?: ReactNode }) {
  return (
    <div className="box" style={{ gap: 6 }}>
      <span className="eyebrow" style={{ color: "var(--muted)" }}>{k}</span>
      <span className="serif" style={{ fontSize: 32 }}>{v}</span>
      {sub ? <span className="small faint">{sub}</span> : null}
    </div>
  );
}
