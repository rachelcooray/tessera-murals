"use client";
import Link from "next/link";
import { useEffect, type CSSProperties, type ReactNode } from "react";
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
export function MosaicGrid({ mosaic, tiles, mode = "tiles", highlight, marks, pick, label, maxWidth = 560 }: {
  mosaic: Mosaic; tiles?: Map<number, MosaicTile>; mode?: GridMode; highlight?: number; marks?: number[]; pick?: (slot: number) => void; label: string; maxWidth?: number;
}) {
  const cells = mosaic.cols * mosaic.rows;
  const gap = mosaic.cols > 24 ? 1 : 2;
  return (
    <div role={pick ? undefined : "img"} aria-label={label} className="mgrid" style={{ gridTemplateColumns: `repeat(${mosaic.cols}, minmax(0, 1fr))`, gap, maxWidth }}>
      {Array.from({ length: cells }, (_, i) => {
        const slot = mosaic.slots[i];
        const t = tiles?.get(i);
        let style: CSSProperties;
        let cls = "mcell";
        if (mode === "slots") style = { background: slot.hex };
        else if (mode === "hidden") style = i === highlight ? { background: slot.hex } : {};
        else style = t ? cellStyle(t, slot.hex, i) : {};
        if (mode !== "slots" && !(mode === "hidden" && i === highlight) && !t) cls += " mcell--open";
        if (t?.status === "pending" && mode === "tiles") cls += " mcell--pending";
        if (i === highlight || marks?.includes(i)) cls += " mcell--hl";
        if (pick) return <button key={i} type="button" className={cls} style={style} onClick={() => pick(i)} aria-pressed={marks ? marks.includes(i) : undefined} aria-label={`Slot ${i + 1}${t ? `, ${t.name ?? "Anonymous"}` : ""}`} />;
        return <i key={i} className={cls} style={style} />;
      })}
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
