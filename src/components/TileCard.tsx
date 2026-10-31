"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { addReport } from "@/lib/store";
import { REPORT_REASONS, type Tile } from "@/lib/types";
import { VoicePlayer } from "./VoicePlayer";
import { Icon, OriginLabel, placeLabel, shareTile, tileAlt, tileImage } from "./ui";

/** A tile lifted out of the wall. Animates from the tile's rect to the card and back. */
export function TileCard({ tile, from, gift = false, onClose, notify }: { tile: Tile; from: DOMRect | null; gift?: boolean; onClose: () => void; notify: (m: string) => void }) {
  const card = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [inState, setIn] = useState(false);
  const [view, setView] = useState<"main" | "report">("main");
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [note, setNote] = useState("");
  const closing = useRef(false);

  const fromTransform = () => {
    const el = card.current;
    if (!el || !from) return "scale(0.96)";
    const r = el.getBoundingClientRect();
    return `translate(${from.left - r.left}px, ${from.top - r.top}px) scale(${from.width / r.width}, ${from.height / r.height})`;
  };

  useLayoutEffect(() => {
    const el = card.current!;
    el.style.transition = "none";
    el.style.transform = fromTransform();
    el.getBoundingClientRect();
    requestAnimationFrame(() => { el.style.transition = ""; el.style.transform = "none"; setIn(true); });
    closeBtn.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const el = card.current;
    if (el) el.style.transform = fromTransform();
    setIn(false);
    setTimeout(onClose, 520);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = tile.displayName ?? "Anonymous";
  const giftMode = gift && tile.gift;
  const clip = giftMode ? tile.gift!.note : tile.voice;
  const words = giftMode ? tile.gift!.noteTranscript : tile.transcript;

  return (
    <div className={`overlay${inState ? " overlay--in" : ""}`} role="dialog" aria-modal="true" aria-label={`Tile by ${name}`}>
      <button className="overlay__dim" aria-label="Close tile" tabIndex={-1} onClick={close} />
      <div className="card" ref={card}>
        <button ref={closeBtn} className="icon-btn card__close" onClick={close} aria-label="Close tile"><Icon name="close" /></button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="card__art" src={tileImage(tile)} alt={tileAlt(tile)} />
        <div className="card__side">
          {giftMode && (
            <div className="card__gift">
              <span className="eyebrow" style={{ color: "var(--oxblood-ink)" }}>A tile for you</span>
              <h2 style={{ fontSize: 30 }}>{tile.gift!.occasion}, {tile.gift!.recipient}</h2>
              {tile.gift!.from && <span className="small muted">from {tile.gift!.from}</span>}
            </div>
          )}
          {view === "main" ? (
            <div className="card__body">
              <span className="eyebrow">Season {tile.seasonId} · {placeLabel(tile)}</span>
              <h2 className="card__name">{name}</h2>
              <OriginLabel origin={tile.origin} />
              {tile.phrase && <p className="card__phrase">“{tile.phrase}”</p>}
              {clip && <VoicePlayer clip={clip} transcript={words} gift={!!giftMode} autoPlay={!!giftMode} label={giftMode ? `message from ${tile.gift!.from ?? name}` : "voice message"} />}
            </div>
          ) : (
            <form className="card__body" onSubmit={(e) => { e.preventDefault(); addReport(tile.id, reason, note.trim()); notify("Thank you. It will be looked at."); setView("main"); }}>
              <h2 style={{ fontSize: 28 }}>Report this tile</h2>
              <p className="small muted">A person reads every report. Honest labelling mistakes are corrected, not punished.</p>
              <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <legend className="sr-only">Reason</legend>
                {REPORT_REASONS.map((r) => (
                  <label key={r} style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 36, fontSize: 14 }}>
                    <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> {r}
                  </label>
                ))}
              </fieldset>
              <div className="field"><label htmlFor="note">Anything else (optional)</label><textarea id="note" className="textarea" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></div>
              <div style={{ display: "flex", gap: 10 }}><button className="btn btn--primary" type="submit">Send report</button><button className="btn" type="button" onClick={() => setView("main")}>Cancel</button></div>
            </form>
          )}
          {view === "main" && (
            <div className="card__actions">
              <button className="btn" onClick={() => shareTile(tile, notify)}><Icon name="share" size={14} />Share</button>
              <Link className="btn" href={`/t?id=${tile.id}`}>Tile page</Link>
              <button className="btn btn--quiet" style={{ flex: "0 0 auto" }} onClick={() => setView("report")}>Report</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ClaimCard({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  return (
    <div className="overlay overlay--in" role="dialog" aria-modal="true" aria-label="Empty spot">
      <button className="overlay__dim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="box" style={{ position: "relative", background: "var(--card)", width: "min(420px, 92vw)", gap: 16 }}>
        <span className="eyebrow">{placeLabel({ x, y })}</span>
        <h2 style={{ fontSize: 30 }}>This spot is free</h2>
        <p className="small muted">Put something here: a picture you made, or one you describe. It stays on the wall for good.</p>
        <Link className="btn btn--primary" href={`/add?spot=${x},${y}`} autoFocus>Claim this spot</Link>
        <button className="btn btn--quiet" onClick={onClose}>Not now</button>
      </div>
    </div>
  );
}
