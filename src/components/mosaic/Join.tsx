"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { mosaicConfig } from "@/config/mosaic";
import { findNearDuplicate, overRateLimit } from "@/lib/mosaic/checks";
import { bestOpenSlot } from "@/lib/mosaic/colours";
import { averageColour } from "@/lib/mosaic/colours";
import { dHash, greyThumb } from "@/lib/mosaic/checks";
import { ACCEPTED, MAX_BYTES, pixels, prepareUpload, squareCanvas, tinted, type PreparedUpload } from "@/lib/mosaic/image";
import { deleteDraft, draftKey } from "@/lib/mosaic/paint/drafts";
import { durationLabel, effortFlag, type PaintStats } from "@/lib/mosaic/paint/effort";
import { allMosaics, allTiles, artistTileCount, capFor, claimSlot, isSlotOpen, lastSaveFailed, myClaim, nextOpenSlot, releaseClaim, submitMosaicTile, useMosaicState } from "@/lib/mosaic/store";
import { MEDIUMS, type Mosaic, type MosaicTile } from "@/lib/mosaic/types";
import { Icon } from "../ui";
import { FlowShell, Swatch, Todo, dateLabel, inkOn } from "./common";
import { Paint, type PaintResult } from "./Paint";

/** Turns a finished painting into the same shape as an upload, so it goes through the same checks. */
function preparePainting(r: PaintResult): PreparedUpload {
  const base = squareCanvas(r.canvas, mosaicConfig.storage.tilePx);
  const data = pixels(base);
  return { base, average: averageColour(data.data), hash: dHash(greyThumb(data.data, data.width, data.height)), flags: [], contentCredentials: false };
}

export function JoinRoute() {
  const q = useSearchParams();
  const key = `${q.get("m")}-${q.get("slot")}`;
  return <Join key={key} mosaicId={q.get("m") ?? ""} token={q.get("i")} slotParam={q.get("slot")} artist={q.get("artist") === "1"} />;
}

type Step = "start" | "slot" | "paint" | "make" | "done";

function Join({ mosaicId, token, slotParam, artist }: { mosaicId: string; token: string | null; slotParam: string | null; artist: boolean }) {
  const s = useMosaicState();
  const m = useMemo(() => allMosaics(s).find((x) => x.id === mosaicId), [s, mosaicId]);
  const claim = m ? myClaim(s, m.id) : undefined;
  const [rawStep, setStep] = useState<Step>("start");
  // Someone holding a slot (artists arrive from the colour challenge with one) goes straight to it.
  const step: Step = rawStep === "start" && claim ? "slot" : rawStep;
  const [upload, setUpload] = useState<PreparedUpload | null>(null);
  const [painted, setPainted] = useState<PaintStats | null>(null);
  const [, setFitFirst] = useState(false);
  const [error, setError] = useState<string | null>(artist && slotParam !== null && !claim ? "That slot was just taken. Pick another below, or go back to the colour challenge." : null);
  const [done, setDone] = useState<MosaicTile | null>(null);

  if (!m) return <FlowShell title="This link doesn’t work"><p className="muted">The mosaic may have been removed, or the link is incomplete. Ask whoever sent it for a new one.</p></FlowShell>;
  if (m.status !== "collecting") return <FlowShell title="This mosaic is finished"><p className="muted">Every tile is in. <Link href={`/reveal?id=${m.id}`}>Watch the reveal</Link>.</p></FlowShell>;
  if (!artist && token !== m.inviteToken) return <FlowShell title="This invite link isn’t right"><p className="muted">Ask whoever invited you to send the link again.</p></FlowShell>;
  if (artist && !s.artist) return <FlowShell title="Join as a Tessera artist first"><p className="muted">Artists need a short profile so tiles are credited and shares can be paid.</p><Link className="btn btn--primary" href="/artist">Set up my artist profile</Link></FlowShell>;

  const source = artist ? "artist" : "circle";
  const cap = capFor(m);
  const mine = artistTileCount(s, m.id, s.me);
  if (artist && mine >= cap && step !== "done") return <FlowShell title="You’ve reached the limit here"><p className="muted">Each artist can place up to {cap} tiles in this mosaic, so more people get a slot. Try another one in the <Link href="/challenge">colour challenge</Link>.</p></FlowShell>;

  const slot = claim?.slot ?? -1;
  const colour = slot >= 0 ? m.slots[slot] : null;

  if (step === "done" && done) return (
    <FlowShell title="Your tile is being reviewed" actions={<Link className="btn btn--primary btn--block" href={artist ? "/challenge" : "/"}>{artist ? "Back to the colour challenge" : "Done"}</Link>}>
      <div className="big-swatch" style={{ background: m.slots[done.slot].hex }}>{done.imageUrl && <img src={done.imageUrl} alt="Your tile" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.92 }} />}</div>
      <p className="muted" style={{ textAlign: "center" }}>A person checks every tile, usually within a day. Slot {done.slot + 1} is held for you meanwhile. The picture is revealed on {dateLabel(m.revealAt)}.</p>
      {done.flags.length > 0 && <p className="note">We noticed: {done.flags.join("; ")}. The reviewer will take a look.</p>}
      <p className="small faint" style={{ textAlign: "center" }}>Keep this link to see your tile in the finished piece: <Link href={`/tile?m=${m.id}&s=${done.slot}`}>your tile page</Link></p>
    </FlowShell>
  );

  if (step === "start") return (
    <FlowShell title="You are one tile in a hidden picture">
      <p className="muted">{m.cols * m.rows} people, {m.cols * m.rows} colours. Nobody sees the picture until {dateLabel(m.revealAt)}.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="choices">
        <button className="choice" onClick={() => { const n = nextOpenSlot(m.id); if (n < 0 || !claimSlot(m.id, n, source)) { setError("Every slot is taken or in review right now. Try again later."); return; } setStep("slot"); }}>
          <b>Give me a colour</b><span className="faint">You get one slot’s colour and make something in it.</span>
        </button>
        <button className="choice" onClick={() => { setFitFirst(true); setStep("make"); }}>
          <b>I already have a picture</b><span className="faint">Upload it and we’ll find the slot it fits best.</span>
        </button>
      </div>
    </FlowShell>
  );

  if (step === "slot" && colour) return (
    <FlowShell title="Your slot" actions={<>
      <button className="btn btn--primary btn--block" onClick={() => setStep("paint")} style={{ background: colour.hex, borderColor: colour.hex, color: inkOn(colour.hex) }}>Paint it here</button>
      <button className="btn btn--block" onClick={() => { setPainted(null); setUpload(null); setStep("make"); }}>Upload a picture I made</button>
      <button className="btn btn--quiet btn--block" onClick={() => { releaseClaim(m.id); setStep("start"); }}>Not for me, free this slot</button>
    </>}>
      <p className="muted">From {m.title}. It’s held for you for {mosaicConfig.slotHoldHours} hours.</p>
      <div className="big-swatch" role="img" aria-label={`Your slot colour, ${colour.name}, with a lighter and a darker note`} style={{ background: colour.hex }}>
        <span style={{ position: "absolute", right: 12, bottom: 12, display: "flex", gap: 6 }}><Swatch hex={colour.light} size={22} /><Swatch hex={colour.dark} size={22} /></span>
      </div>
      <div style={{ textAlign: "center" }}><div className="serif italic" style={{ fontSize: 26, textTransform: "capitalize" }}>{colour.name}</div><div className="small muted">{colour.hex.toUpperCase()} · slot {slot + 1}</div></div>
      <ol className="small" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
        <li>Paint it here with full brushes, layers and colour tools, or upload a painting, drawing, photo or collage you made. No AI image tools.</li>
        <li>Keep it mostly this colour. Small notes of the two swatches help.</li>
        <li>Close enough is fine. You can tint it gently to fit.</li>
      </ol>
    </FlowShell>
  );

  if (step === "paint" && colour) return (
    <Paint slot={colour} slotNumber={slot + 1} draftId={draftKey(m.id, slot)} onBack={() => setStep("slot")}
      onDone={(r) => { setUpload(preparePainting(r)); setPainted(r.stats); setStep("make"); }} />
  );

  return <MakeTile mosaic={m} slot={slot} fitFirst={slot < 0} source={source} upload={upload} setUpload={setUpload} painted={painted} onRepaint={() => setStep("paint")}
    onPlaced={(n) => { if (!claimSlot(m.id, n, source)) return false; setFitFirst(false); return true; }}
    onDone={(t) => { setDone(t); setStep("done"); }} />;
}

function MakeTile({ mosaic: m, slot, fitFirst, source, upload, setUpload, painted, onRepaint, onPlaced, onDone }: {
  mosaic: Mosaic; slot: number; fitFirst: boolean; source: "circle" | "artist"; upload: PreparedUpload | null; setUpload: (u: PreparedUpload | null) => void;
  painted: PaintStats | null; onRepaint: () => void;
  onPlaced: (slot: number) => boolean; onDone: (t: MosaicTile) => void;
}) {
  const s = useMosaicState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tint, setTint] = useState<number>(painted ? 0 : mosaicConfig.tint.default);
  const [medium, setMedium] = useState<string>(painted ? "Painted on Tessera" : "Painting");
  const [name, setName] = useState(source === "artist" ? s.artist?.name ?? "" : "");
  const [anon, setAnon] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const colour = slot >= 0 ? m.slots[slot] : null;

  const result = useMemo(() => (upload && colour ? tinted(upload.base, colour.hex, tint, mosaicConfig.storage.jpegQuality) : null), [upload, colour, tint]);

  async function onFile(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (!ACCEPTED.split(",").includes(f.type)) { setError("Please choose a JPG, PNG or WebP image."); return; }
    if (f.size > MAX_BYTES) { setError("That file is over 15 MB. Try a smaller copy."); return; }
    setBusy(true);
    try {
      const u = await prepareUpload(f, mosaicConfig.storage.tilePx);
      if (fitFirst) {
        const best = bestOpenSlot(u.average, m.slots, (i) => isSlotOpen(s, m, i, s.me));
        if (best < 0 || !onPlaced(best)) { setError("Every slot is taken or in review right now."); return; }
      }
      setUpload(u);
    } catch {
      setError("We couldn’t read that image. Try another file.");
    } finally { setBusy(false); }
  }

  function submit() {
    if (!upload || !result || slot < 0) return;
    setError(null);
    if (overRateLimit(s.submissions[s.me] ?? [], Date.now(), mosaicConfig.moderation.submissionsPerHour)) { setError("You’ve sent a lot of tiles in the last hour. Please try again a little later."); return; }
    const earlier = allTiles(s).filter((t) => t.contributorId === s.me && t.hash && t.status !== "rejected").map((t) => ({ id: t.id, hash: t.hash! }));
    if (findNearDuplicate(upload.hash, earlier, mosaicConfig.moderation.duplicateHammingMax)) { setError("This looks almost the same as a tile you’ve already sent. Each tile needs to be its own piece."); return; }
    if (source === "artist" && artistTileCount(s, m.id, s.me) >= capFor(m)) { setError(`You’ve reached the ${capFor(m)} tile limit for this mosaic.`); return; }
    const flags = [...upload.flags];
    const effort = painted ? effortFlag(painted, mosaicConfig.paint.minStrokes, mosaicConfig.paint.minSeconds) : null;
    if (effort) flags.push(effort);
    if (result.match < mosaicConfig.minColourMatch) flags.push(`Colour match only ${Math.round(result.match * 100)}%`);
    if (upload.contentCredentials && !upload.flags.length) flags.push("Has Content Credentials (check the source)");
    const t = submitMosaicTile({
      mosaicId: m.id, slot, source, name: anon ? null : name.trim() || null, medium, imageUrl: result.url, art: null,
      averageHex: result.averageHex, match: result.match, tint, hash: upload.hash, flags,
      painted: painted ? { strokes: painted.strokes, activeMs: painted.activeMs, inputs: painted.inputs, tools: painted.tools } : null,
    });
    if (painted) void deleteDraft(draftKey(m.id, slot));
    if (lastSaveFailed) { setError("This browser’s storage is full, so your tile may not be kept."); return; }
    setUpload(null);
    onDone(t);
  }

  return (
    <FlowShell title={painted ? "Check and send" : colour ? "Fit it to your colour" : "Upload your picture"} back={undefined}
      actions={<button className="btn btn--primary btn--block" disabled={!result || !agree || busy} onClick={submit} style={colour ? { background: colour.hex, borderColor: colour.hex, color: inkOn(colour.hex) } : undefined}>{!result ? "Choose your picture" : !agree ? "Tick the box to send" : "Send for review"}</button>}>
      {colour && <p className="small muted row" style={{ gap: 8 }}><Swatch hex={colour.hex} /> Slot {slot + 1} · <span style={{ textTransform: "capitalize" }}>{colour.name}</span></p>}
      <input ref={fileRef} id="tilefile" type="file" accept={ACCEPTED} className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
      {!upload ? (
        <label htmlFor="tilefile" className="dropzone"><Icon name="upload" size={22} /><span className="serif italic" style={{ fontSize: 22, color: "var(--ink)" }}>{busy ? "Reading…" : "Tap to choose your picture"}</span><span className="small">A photo of your painting or drawing works well. Square is best.</span></label>
      ) : (
        <>
          <div className="choices choices--2">
            <figure style={{ margin: 0, display: "grid", gap: 6 }}><img src={upload.base.toDataURL("image/jpeg", 0.85)} alt="Your upload" style={{ width: "100%", aspectRatio: 1, objectFit: "cover", boxShadow: "0 0 0 1px var(--line)" }} /><figcaption className="small faint">{painted ? "Your painting" : "Your upload"}</figcaption></figure>
            <figure style={{ margin: 0, display: "grid", gap: 6 }}>{result && <img src={result.url} alt={`Your upload tinted ${Math.round(tint * 100)} percent toward the slot colour`} style={{ width: "100%", aspectRatio: 1, objectFit: "cover", boxShadow: `0 0 0 1px var(--line), 0 0 40px ${colour?.hex}33` }} />}<figcaption className="small faint">How it sits in slot {slot + 1}</figcaption></figure>
          </div>
          <div className="field">
            <div className="split"><label htmlFor="tint">Tint to fit</label>{result && <span className="small">Colour match {Math.round(result.match * 100)}%</span>}</div>
            <input id="tint" type="range" min={0} max={mosaicConfig.tint.max} step={0.05} value={tint} onChange={(e) => setTint(Number(e.target.value))} style={{ width: "100%", accentColor: colour?.hex ?? "var(--gold)", minHeight: 44 }} />
            <div className="split small faint"><span>Untouched</span><span>Strongest we allow</span></div>
          </div>
          {painted
            ? <><p className="small muted">Painted on Tessera · {painted.strokes} strokes · {durationLabel(painted.activeMs)}</p><button className="btn btn--quiet" onClick={onRepaint}>Keep painting</button></>
            : <button className="btn btn--quiet" onClick={() => fileRef.current?.click()}>Choose a different picture</button>}
        </>
      )}
      <p className="note"><Icon name="hand" size={16} /> Tessera only accepts work made by people. Every tile is checked for AI before it’s placed.</p>
      {!painted && <div className="field"><label htmlFor="medium">What did you make it with?</label>
        <select id="medium" className="input" value={medium} onChange={(e) => setMedium(e.target.value)}>{MEDIUMS.map((x) => <option key={x}>{x}</option>)}</select>
      </div>}
      <div className="field"><label htmlFor="credit">Credit me as</label><input id="credit" className="input" maxLength={40} value={name} disabled={anon} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        <label className="row small" style={{ cursor: "pointer" }}><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--gold)" }} />Show me as Anonymous</label>
      </div>
      <label className="row small" style={{ alignItems: "flex-start", flexWrap: "nowrap", cursor: "pointer" }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 20, height: 20, accentColor: "var(--gold)", flex: "0 0 auto" }} />
        <span>I made this myself, without AI image tools. I’m 18 or older. I keep the rights to my tile, and I give Tessera a worldwide, permanent licence to show, print and sell it as part of this mosaic.<Todo>[TODO: needs lawyer review]</Todo></span>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
    </FlowShell>
  );
}
