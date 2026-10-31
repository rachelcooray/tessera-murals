"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { play, stopAll } from "@/lib/audio";
import { money, singlePrice } from "@/lib/pricing";
import { markCelebrated, useLocalState, useSeasons, useSeasonTiles } from "@/lib/store";
import type { Season, Tile } from "@/lib/types";
import { Mural, type MuralApi } from "./Mural";
import { ClaimCard, TileCard } from "./TileCard";
import { closeDate, Header, Icon, Reasons, Toast, useClosesIn, useToast } from "./ui";

function useAccent(tint: string | null) {
  useEffect(() => { document.documentElement.style.setProperty("--accent", tint ?? "#c9a24f"); }, [tint]);
  useEffect(() => () => { document.documentElement.style.setProperty("--accent", "#c9a24f"); }, []);
}

export function MuralExperience({ seasonId, flyToId = null, gift = false }: { seasonId?: string; flyToId?: string | null; gift?: boolean }) {
  const seasons = useSeasons();
  const local = useLocalState();
  const season: Season = (seasonId ? seasons.find((s) => s.id === seasonId) : seasons.find((s) => s.status === "open")) ?? seasons[0];
  const frozen = season.status === "frozen";
  const tiles = useSeasonTiles(season.id);
  const approved = useMemo(() => tiles.filter((t) => t.status === "approved"), [tiles]);
  const api = useRef<MuralApi | null>(null);
  const [open, setOpen] = useState<{ tile: Tile; rect: DOMRect | null; gift: boolean } | null>(null);
  const [claim, setClaim] = useState<{ x: number; y: number } | null>(null);
  const [tint, setTint] = useState<string | null>(null);
  const [interacted, setInteracted] = useState(false);
  const [ambient, setAmbient] = useState<Tile | null>(null);
  const [toast, notify] = useToast();
  useAccent(open ? null : tint);

  const celebrate = !seasonId && !flyToId ? seasons.find((s) => local.frozen[s.id] && !local.celebrated.includes(s.id)) : undefined;

  // Ambient voices: only after the visitor has interacted, never while a tile is open, and never when muted.
  useEffect(() => {
    if (!interacted || local.ambientMuted || open || frozen) return;
    const voiced = approved.filter((t) => t.voice);
    if (!voiced.length) return;
    let stopTimer: ReturnType<typeof setTimeout>;
    const id = setInterval(() => {
      const t = voiced[Math.floor(Math.random() * voiced.length)];
      setAmbient(t);
      const h = play(t.voice!, { volume: 0.18, maxSeconds: 4 });
      stopTimer = setTimeout(() => { h.stop(); setAmbient(null); }, 4300);
    }, 24000);
    return () => { clearInterval(id); clearTimeout(stopTimer); stopAll(); setAmbient(null); };
  }, [interacted, local.ambientMuted, open, frozen, approved]);

  const onOpen = useCallback((tile: Tile, rect: DOMRect) => { stopAll(); setOpen({ tile, rect, gift: false }); }, []);
  const onArrive = useCallback((tile: Tile, rect: DOMRect) => setOpen({ tile, rect, gift }), [gift]);
  const count = approved.length, total = season.gridSize * season.gridSize;
  const closesIn = useClosesIn(frozen ? null : season.closesAt);

  return (
    <div className="stage">
      <Header current="/" overlay />
      <Mural tiles={tiles} n={season.gridSize} apiRef={api} drift={!flyToId} phoneZoom flyToId={flyToId}
        onOpen={onOpen} onArrive={onArrive} onEmpty={frozen ? undefined : (x, y) => setClaim({ x, y })}
        onTint={setTint} onInteract={() => setInteracted(true)} hiddenId={open?.tile.id ?? null} pulseId={ambient?.id ?? null} />

      <div className="stage__bottom">
        {!frozen && !flyToId && (
          <div className={`intro${interacted ? " intro--gone" : ""}`}>
            <p className="intro__line">Every tile is a person. Add yours.</p>
            <Reasons />
            {closesIn && closesIn !== "closed" && <p className="urgent">The wall {closesIn}. Get your square up there.</p>}
            <div className="intro__actions">
              <Link className="btn btn--primary" href="/add">Add your tile, {money(singlePrice(local.prices))}</Link>
              <button className="btn" onClick={() => { setInteracted(true); api.current?.zoom(2); }}>Explore the mural</button>
            </div>
            <Link href="/about#why" className="small" style={{ color: "var(--muted)" }}>What your dollar does</Link>
          </div>
        )}
        <div className="bar">
          <div>
            <div className="eyebrow">Season {season.number} · {season.name}{frozen ? " · frozen" : ""}</div>
            <div className="serif" style={{ fontSize: 19, marginTop: 4 }}>{count} of {total} tiles{frozen ? "" : " placed"}{closesIn && !frozen ? <span className="urgent-inline"> · {closesIn}{season.closesAt ? `, ${closeDate(season.closesAt)}` : ""}</span> : null}</div>
            <div className="progress" aria-hidden="true"><i style={{ width: `${(count / total) * 100}%` }} /></div>
            {ambient?.phrase && <div className="chip" style={{ marginTop: 10 }}><Icon name="sound" size={13} />a voice, softly: <em>“{ambient.phrase}”</em></div>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {interacted && !frozen && <Link className="btn btn--primary" href="/add" style={{ minHeight: 44 }}>Add yours</Link>}
            <div className="zoom">
              <button className="icon-btn" onClick={() => api.current?.zoom(1 / 1.5)} aria-label="Zoom out"><Icon name="minus" /></button>
              <button className="icon-btn" onClick={() => api.current?.zoom(1.5)} aria-label="Zoom in"><Icon name="plus" /></button>
            </div>
          </div>
        </div>
      </div>

      {open && <TileCard key={open.tile.id} tile={open.tile} from={open.rect} gift={open.gift} notify={notify} onClose={() => setOpen(null)} />}
      {claim && <ClaimCard x={claim.x} y={claim.y} onClose={() => setClaim(null)} />}
      {celebrate && <Celebration season={celebrate} />}
      <Toast msg={toast} />
    </div>
  );
}

function Celebration({ season }: { season: Season }) {
  const tiles = useSeasonTiles(season.id);
  const next = useSeasons().find((s) => s.status === "open");
  return (
    <div className="celebrate" role="dialog" aria-modal="true" aria-label={`Season ${season.number} is complete`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="eyebrow">Season {season.number} · {season.name}</span>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 52px)" }}>Four hundred people. One wall. Finished.</h1>
        <p className="lede">Frozen on {new Date(season.frozenAt!).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. It stays here for good.</p>
      </div>
      <Mural tiles={tiles} n={season.gridSize} interactive={false} pullback label={`The finished Season ${season.number} mural`} />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <Link className="btn" href={`/seasons/${season.id}`} onClick={() => markCelebrated(season.id)}>Explore it in Past seasons</Link>
        {next && <button className="btn btn--primary" onClick={() => markCelebrated(season.id)}>Be one of the first in Season {next.number}</button>}
      </div>
    </div>
  );
}
