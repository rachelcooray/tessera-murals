"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { site } from "@/config/site";
import { artDataUrl } from "@/lib/art";
import { setAmbientMuted, useLocalState } from "@/lib/store";
import type { Tile } from "@/lib/types";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const paths: Record<string, ReactNode> = {
  play: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
  pause: <path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" stroke="none" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  share: <path d="M4 12v7h16v-7M12 3v12M8 7l4-4 4 4" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  sound: <><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16 9a4 4 0 0 1 0 6" /></>,
  muted: <><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M17 9l4 6M21 9l-4 6" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  hand: <path d="M4 20l4-1 10-10-3-3L5 16l-1 4z" />,
  ai: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  back: <path d="M15 5l-7 7 7 7" />,
  lock: <><rect x="4" y="10" width="16" height="10" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  upload: <path d="M4 16v4h16v-4M12 4v12M8 8l4-4 4 4" />,
  stop: <rect x="6" y="6" width="12" height="12" fill="currentColor" stroke="none" />,
};
export function Icon({ name, size = 18 }: { name: keyof typeof paths | string; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...P}>{paths[name]}</svg>;
}

const MARK = ["#c9a24f", "#6e7f8c", "#8a2e2a", "#4f6b5e", "#c9a24f", "#3f5b7a", "#9a7a4a", "#5b4a6e", "#c9a24f"];
export function Mark({ size = 20 }: { size?: number }) {
  return <span className="mark" style={{ width: size }} aria-hidden="true">{MARK.map((c, i) => <i key={i} style={{ background: c }} />)}</span>;
}

export function Wordmark() {
  return <Link href="/" className="wordmark" aria-label="Tessera, back to the mural"><Mark /><span>TESSERA</span></Link>;
}

const NAV = [["/", "Mural"], ["/seasons", "Past seasons"], ["/about", "About"]] as const;

export function Header({ current, overlay = false }: { current?: string; overlay?: boolean }) {
  const s = useLocalState();
  const muted = s.ambientMuted;
  return (
    <header className={`header${overlay ? " header--overlay" : ""}`}>
      <Wordmark />
      <nav className="nav" aria-label="Main">
        {NAV.map(([href, label]) => <Link key={href} href={href} aria-current={current === href ? "page" : undefined}>{label}</Link>)}
      </nav>
      <div className="header__right">
        <button className="icon-btn" onClick={() => setAmbientMuted(!muted)} aria-pressed={muted} aria-label={muted ? "Turn ambient voices on" : "Mute ambient voices"}>
          <Icon name={muted ? "muted" : "sound"} />
        </button>
        <Link href="/add" className="btn btn--primary header__cta">Add your tile</Link>
        <details className="menu">
          <summary className="icon-btn" aria-label="Menu"><Icon name="menu" /></summary>
          <div className="menu__panel">
            {NAV.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
            <Link href="/add">Add your tile</Link>
          </div>
        </details>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <span>Tessera is made and run by one person. Prototype with sample data.</span>
      <nav aria-label="Legal">
        <a href={`mailto:${site.contactEmail}`}>Contact</a>
        <Link href="/about#terms">Terms</Link>
        <Link href="/about#policy">Content policy</Link>
      </nav>
    </footer>
  );
}

export function OriginLabel({ origin }: { origin: "hand" | "ai" }) {
  return <span className="label"><Icon name={origin === "hand" ? "hand" : "ai"} size={13} />{origin === "hand" ? "Made by hand" : "Made with AI"}</span>;
}

export function tileImage(t: Pick<Tile, "imageUrl" | "art">, size?: number): string {
  return t.imageUrl ?? (t.art ? artDataUrl(t.art, size) : "");
}

export function tileAlt(t: Tile): string {
  return t.prompt ? `Artwork: ${t.prompt}` : `Artwork by ${t.displayName ?? "an anonymous person"}${t.phrase ? `, titled “${t.phrase}”` : ""}`;
}

export function placeLabel(t: { x: number; y: number }) {
  return `row ${t.y + 1}, column ${t.x + 1}`;
}

export function useToast(): [string | null, (m: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(id);
  }, [msg]);
  return [msg, setMsg];
}

export function Toast({ msg }: { msg: string | null }) {
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

export async function shareTile(t: Tile, notify: (m: string) => void) {
  const url = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/t/?id=${t.id}`;
  const title = `${t.displayName ?? "Anonymous"} on Tessera`;
  try {
    if (navigator.share) { await navigator.share({ title, text: t.phrase ?? "A tile on Tessera", url }); return; }
    await navigator.clipboard.writeText(url);
    notify("Link copied");
  } catch {
    /* share sheet dismissed */
  }
}

/** Optional artist extras. The title shows on its own line; the rest folds away. */
export function TileTitle({ t }: { t: Tile }) {
  return t.details?.title ? <span className="serif italic" style={{ fontSize: 22, color: "var(--muted)" }}>{t.details.title}</span> : null;
}

export function AboutPiece({ t, open = false }: { t: Tile; open?: boolean }) {
  const d = t.details;
  if (!d || !(d.medium || d.note || d.credit)) return null;
  return (
    <details className="more" open={open}>
      <summary>About this piece</summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
        {d.medium && <p className="small"><span className="faint">Made with </span>{d.medium}</p>}
        {d.note && <p className="small muted" style={{ whiteSpace: "pre-line" }}>{d.note}</p>}
        {d.credit && <p className="small"><span className="faint">Find the artist </span>{d.credit}</p>}
      </div>
    </details>
  );
}

/** "closes in 6 days", updated live. Renders nothing until mounted so server and browser agree. */
export function useClosesIn(closesAt: string | null): string | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  if (!closesAt || now === null) return null;
  const ms = Date.parse(closesAt) - now;
  if (ms <= 0) return "closed";
  const days = Math.floor(ms / 86400000), hours = Math.floor(ms / 3600000), mins = Math.max(1, Math.floor(ms / 60000));
  if (days >= 1) return `closes in ${days} day${days === 1 ? "" : "s"}`;
  if (hours >= 1) return `closes in ${hours} hour${hours === 1 ? "" : "s"}`;
  return `closes in ${mins} minute${mins === 1 ? "" : "s"}`;
}

export function closeDate(closesAt: string): string {
  return new Date(closesAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" });
}

export const REASONS = ["Declare your love", "Show your talent", "Advertise your art"] as const;

export function Reasons() {
  return <p className="reasons">{REASONS.map((r) => <span key={r}>{r}</span>)}</p>;
}
