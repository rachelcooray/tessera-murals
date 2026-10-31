"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { site } from "@/config/site";
import { artDataUrl, artPalette, type ArtKind, type ArtSpec } from "@/lib/art";
import { extractPalette } from "@/lib/colour";
import { suggestSpots, type Spot } from "@/lib/placement";
import { hashString } from "@/lib/rng";
import { addCredits, newTileId, submitTile, useCurrentSeason, useLocalState, useSeasonTiles } from "@/lib/store";
import type { Origin, Tile, VoiceClip } from "@/lib/types";
import { Recorder } from "./Recorder";
import { Icon, placeLabel } from "./ui";

type Step = "image" | "origin" | "words" | "voice" | "name" | "gift" | "place" | "pay" | "done";
const LABEL: Record<Step, string> = { image: "Image", origin: "Origin", words: "Words", voice: "Voice", name: "Name", gift: "Gift", place: "Place", pay: "Pay", done: "Done" };

/** Mock AI generator for Phase 1: reads kind and colour from the prompt. Gemini replaces it in Phase 4. */
function promptToArt(prompt: string, attempt: number): ArtSpec {
  const p = prompt.toLowerCase();
  const kinds: [RegExp, ArtKind][] = [[/sea|ocean|wave|water|lake|river/, "waves"], [/sun|dawn|dusk|horizon|sunset|sunrise/, "horizon"], [/forest|tree|wood|pine/, "forest"], [/night|star|moon|city|street/, "night"], [/flower|bloom|garden|blossom|rose/, "bloom"], [/hill|mountain|valley|field/, "hills"]];
  const hues: [RegExp, number][] = [[/red|crimson/, 4], [/orange|amber/, 26], [/gold|yellow/, 45], [/green|moss/, 120], [/teal|turquoise/, 175], [/blue|navy/, 215], [/purple|violet/, 270], [/pink|rose/, 335]];
  const seed = hashString(prompt + "#" + attempt);
  const kind = kinds.find(([re]) => re.test(p))?.[1] ?? (["abstract", "horizon", "hills", "bloom"] as ArtKind[])[seed % 4];
  const h = (hues.find(([re]) => re.test(p))?.[1] ?? seed % 360) + ((seed >> 8) % 20) - 10;
  return { kind, seed, h, s: 40 + ((seed >> 4) % 25), l: 34 + ((seed >> 12) % 18) };
}

async function processUpload(file: File): Promise<{ url: string; palette: string[] }> {
  const bmp = await createImageBitmap(file);
  const sz = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas"); c.width = c.height = 768;
  c.getContext("2d")!.drawImage(bmp, (bmp.width - sz) / 2, (bmp.height - sz) / 2, sz, sz, 0, 0, 768, 768);
  const s = document.createElement("canvas"); s.width = s.height = 32;
  const sctx = s.getContext("2d")!; sctx.drawImage(c, 0, 0, 32, 32);
  return { url: c.toDataURL("image/jpeg", 0.82), palette: extractPalette(sctx.getImageData(0, 0, 32, 32).data) };
}

/** Mock moderation for Phase 1. Real image, text and audio checks arrive in Phase 4. */
function mockFlags(phrase: string): string[] {
  return /https?:|www\.|\.com|@|\b(buy|sale|discount|follow me)\b/i.test(phrase) ? ["Phrase: possible link or advert."] : [];
}

export function AddFlow({ preferSpot, startGift }: { preferSpot: { x: number; y: number } | null; startGift: boolean }) {
  const season = useCurrentSeason();
  const seasonTiles = useSeasonTiles(season.id);
  const local = useLocalState();
  const [step, setStep] = useState<Step>("image");
  const [mode, setMode] = useState<"upload" | "ai">("upload");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [art, setArt] = useState<ArtSpec | null>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState<Origin>("hand");
  const [phrase, setPhrase] = useState("");
  const [voice, setVoice] = useState<VoiceClip | null>(null);
  const [named, setNamed] = useState(true);
  const [name, setName] = useState("");
  const [gift, setGift] = useState(startGift);
  const [recipient, setRecipient] = useState("");
  const [occasion, setOccasion] = useState("");
  const [giftNote, setGiftNote] = useState<VoiceClip | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [plan, setPlan] = useState<"single" | "bundle" | "credit">(local.credits > 0 ? "credit" : "single");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; status: string } | null>(null);

  const steps: Step[] = ["image", "origin", "words", "voice", "name", ...(gift ? (["gift"] as Step[]) : []), "place", "pay", "done"];
  const idx = steps.indexOf(step);
  const go = (d: number) => { setError(null); setStep(steps[Math.max(0, Math.min(steps.length - 1, idx + d))]); window.scrollTo(0, 0); };
  const generated = mode === "ai" && !!art && !imageUrl;
  const hasImage = !!imageUrl || !!art;

  const spots = useMemo(() => {
    if (!palette.length) return [];
    const s = suggestSpots(seasonTiles, palette, season.gridSize);
    if (preferSpot && !seasonTiles.some((t) => t.x === preferSpot.x && t.y === preferSpot.y)) {
      return [{ ...preferSpot, score: 1, why: "The spot you chose" }, ...s.filter((o) => o.x !== preferSpot.x || o.y !== preferSpot.y).slice(0, 2)];
    }
    return s;
  }, [palette, seasonTiles, season.gridSize, preferSpot]);
  const chosen = spot ?? spots[0] ?? null;

  const generate = () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setTimeout(() => {
      const a = promptToArt(prompt.trim(), attempt);
      setArt(a); setImageUrl(null); setPalette(artPalette(a)); setAttempt(attempt + 1); setBusy(false); setOrigin("ai");
    }, 1300);
  };

  const submit = () => {
    if (!chosen) return;
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError("Please add an email so we can send your tile link."); return; }
    if (seasonTiles.some((t) => t.x === chosen.x && t.y === chosen.y)) { setError("Someone has just taken that spot. Please pick another."); setSpot(null); setStep("place"); return; }
    const p = local.prices;
    const tile: Tile = {
      id: newTileId(season.id), seasonId: season.id, x: chosen.x, y: chosen.y, art: imageUrl ? null : art, imageUrl,
      phrase: phrase.trim() || null, voice, transcript: null, displayName: named ? name.trim() || null : null,
      origin: generated ? "ai" : origin, prompt: generated ? prompt.trim() : null, palette, status: "pending", rejectionReason: null,
      gift: gift ? { recipient: recipient.trim(), occasion: occasion.trim(), from: named ? name.trim() || null : null, note: giftNote, noteTranscript: null } : null,
      createdAt: new Date().toISOString(), approvedAt: null, flags: mockFlags(phrase), contentCredentials: imageUrl ? null : "Generated inside Tessera",
      payment: { kind: plan === "credit" ? "credit" : "hold", amount: plan === "bundle" ? p.bundlePrice : p.single }, email,
    };
    if (plan === "bundle") addCredits(p.bundleCount - 1);
    if (plan === "credit") addCredits(-1);
    const status = submitTile(tile);
    setResult({ id: tile.id, status });
    setStep("done");
  };

  const canNext: Partial<Record<Step, boolean>> = {
    image: hasImage && !busy, words: phrase.length <= site.phraseMax, name: !named || name.trim().length > 0,
    gift: recipient.trim().length > 0 && occasion.trim().length > 0, place: !!chosen,
  };
  const total = steps.length - 1;

  return (
    <div className="flow">
      {step !== "done" && (
        <>
          <div className="flow__top">
            {idx > 0 ? <button className="flow__back" onClick={() => go(-1)}><Icon name="back" size={14} />Step {idx + 1} of {total} · {LABEL[step]}</button>
              : <span className="eyebrow">Step 1 of {total} · Image</span>}
            <Link href="/" className="icon-btn" aria-label="Leave and return to the mural"><Icon name="close" /></Link>
          </div>
          <div className="flow__progress" aria-hidden="true"><i style={{ width: `${((idx + 1) / total) * 100}%` }} /></div>
        </>
      )}

      <main className="flow__main">
        {step === "image" && <>
          <h1>What goes on your tile?</h1>
          <div className="choices choices--2">
            <button className="choice" aria-pressed={mode === "upload"} onClick={() => setMode("upload")}><Icon name="upload" size={22} />Upload a picture I made</button>
            <button className="choice" aria-pressed={mode === "ai"} onClick={() => setMode("ai")}><Icon name="ai" size={22} />Describe it, let AI make it</button>
          </div>
          {mode === "upload" ? (
            <>
              <label className="dropzone">
                {imageUrl ? (/* eslint-disable-next-line @next/next/no-img-element */ <img className="preview" src={imageUrl} alt="Your picture, cropped to a square" />)
                  : <><span className="serif italic" style={{ fontSize: 22, color: "var(--ink)" }}>Tap to choose a picture</span><span className="small">JPG or PNG. We crop it to a square.</span></>}
                <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  setBusy(true);
                  try { const r = await processUpload(f); setImageUrl(r.url); setArt(null); setPalette(r.palette); setOrigin("hand"); }
                  catch { setError("That image could not be read. Try a JPG or PNG."); }
                  setBusy(false);
                }} />
              </label>
              <p className="small faint">It must be yours. No logos, no real people without their consent, nothing on the <Link href="/about#policy">content policy</Link> list.</p>
            </>
          ) : (
            <>
              <div className="field"><label htmlFor="prompt">Describe your picture</label>
                <textarea id="prompt" className="textarea" value={prompt} maxLength={300} placeholder="A lighthouse at dusk, painted in thick strokes" onChange={(e) => setPrompt(e.target.value)} /></div>
              {art && !imageUrl && (/* eslint-disable-next-line @next/next/no-img-element */ <img className="preview" src={artDataUrl(art)} alt={`Generated from: ${prompt}`} />)}
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn" style={{ flex: 1 }} disabled={busy || !prompt.trim() || attempt >= 4} onClick={generate}>{busy ? "Making it…" : attempt === 0 ? "Generate" : `Try again (${4 - attempt} left)`}</button>
              </div>
              <p className="small faint">Anything made here is labelled “Made with AI” automatically. Prototype: this is a stand-in generator, real AI arrives later.</p>
            </>
          )}
        </>}

        {step === "origin" && <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl ?? (art ? artDataUrl(art) : "")} alt="" style={{ width: 120, height: 120, objectFit: "cover", boxShadow: "0 20px 40px rgba(0,0,0,.5)" }} />
          <h1>Did you make this by hand, or with AI?</h1>
          {generated ? <p className="muted">You made this with Tessera’s generator, so it is labelled <strong>Made with AI</strong>.</p> : <>
            <p className="muted small">Both are welcome and shown with the same weight. The label just tells the truth.</p>
            <div className="choices">
              <button className="choice" aria-pressed={origin === "hand"} onClick={() => setOrigin("hand")}><b>Made by hand</b>Painted, drawn, photographed or collaged by you</button>
              <button className="choice" aria-pressed={origin === "ai"} onClick={() => setOrigin("ai")}><b>Made with AI</b>Generated or substantially edited by an AI tool</button>
            </div>
            <p className="small faint">Honest mistakes are corrected, not punished.</p>
          </>}
        </>}

        {step === "words" && <>
          <h1>A few words, if you like</h1>
          <p className="muted small">Shown under your picture when someone opens your tile. Optional.</p>
          <div className="field"><label htmlFor="phrase">Your phrase</label>
            <input id="phrase" className="input input--serif" value={phrase} maxLength={site.phraseMax} placeholder="for the lighthouse keeper I never met" onChange={(e) => setPhrase(e.target.value)} />
            <span className="counter">{phrase.length} / {site.phraseMax}</span></div>
        </>}

        {step === "voice" && <>
          <h1>Say something, in your own voice</h1>
          <p className="muted small">{site.voice.minSeconds} to {site.voice.maxSeconds} seconds. People hear it when they open your tile. Optional.</p>
          <Recorder value={voice} onChange={setVoice} />
        </>}

        {step === "name" && <>
          <h1>How should the plaque read?</h1>
          <div className="choices">
            <button className="choice" aria-pressed={named} onClick={() => setNamed(true)}><b>Show my name</b>In the same serif as everyone else</button>
            {named && <div className="field"><label htmlFor="name">Your name</label><input id="name" className="input input--serif" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></div>}
            <button className="choice" aria-pressed={!named} onClick={() => setNamed(false)}><b>Stay anonymous</b>The plaque reads “Anonymous”. We still email you the link.</button>
          </div>
          <div className="box" style={{ background: "var(--card)", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <div><div className="serif" style={{ fontSize: 20 }}>This tile is a gift</div><div className="small muted">A birthday, an anniversary, a memorial</div></div>
            <button className="switch" role="switch" aria-checked={gift} aria-label="This tile is a gift" onClick={() => setGift(!gift)} />
          </div>
        </>}

        {step === "gift" && <>
          <h1>Who is this tile for?</h1>
          <div className="field"><label htmlFor="rcp">Their name</label><input id="rcp" className="input input--serif" maxLength={40} value={recipient} placeholder="Dad" onChange={(e) => setRecipient(e.target.value)} /></div>
          <div className="field"><label htmlFor="occ">The occasion, in a line</label><input id="occ" className="input input--serif" maxLength={40} value={occasion} placeholder="Happy 60th" onChange={(e) => setOccasion(e.target.value)} /></div>
          <div className="field"><span className="lbl">A voice note just for them (optional)</span><Recorder value={giftNote} onChange={setGiftNote} label="note for them" /></div>
          <p className="small faint">Once approved you get a gift link. When they open it, the wall flies to your tile and plays your note.</p>
        </>}

        {step === "place" && <>
          <h1>Three spots where your tile belongs</h1>
          <p className="muted small">We compared its colours with the tiles already on the wall. Pick one. It is held for you while your tile is reviewed.</p>
          <div className="spotgrid" role="group" aria-label="Season mural with suggested spots">
            {Array.from({ length: season.gridSize ** 2 }, (_, i) => {
              const x = i % season.gridSize, y = Math.floor(i / season.gridSize);
              const t = seasonTiles.find((v) => v.x === x && v.y === y);
              const k = spots.findIndex((s) => s.x === x && s.y === y);
              if (k >= 0) {
                const on = chosen?.x === x && chosen?.y === y;
                return <button key={i} className="cand" aria-pressed={on} aria-label={`Choose ${placeLabel({ x, y })}`} onClick={() => setSpot(spots[k])} style={on ? { backgroundImage: `url("${imageUrl ?? (art ? artDataUrl(art) : "")}")` } : undefined} />;
              }
              return <i key={i} className={t ? "" : "free"} style={t ? { background: t.status === "approved" ? t.palette[0] : "rgba(201,162,79,.15)", opacity: 0.8 } : undefined} />;
            })}
          </div>
          <div className="choices">
            {spots.map((s) => (
              <button key={`${s.x}-${s.y}`} className="choice" style={{ minHeight: 64 }} aria-pressed={chosen?.x === s.x && chosen?.y === s.y} onClick={() => setSpot(s)}>
                <b style={{ fontSize: 18 }}>{placeLabel(s).replace(/^r/, "R")}</b>{s.why}
              </button>
            ))}
          </div>
        </>}

        {step === "pay" && <>
          <h1>{local.prices.single === 1 ? "One dollar" : `$${local.prices.single}`} for a spot that lasts</h1>
          <div className="choices choices--2">
            {local.credits > 0 && <button className="choice" aria-pressed={plan === "credit"} onClick={() => setPlan("credit")}><b>1 credit</b>You have {local.credits}</button>}
            <button className="choice" aria-pressed={plan === "single"} onClick={() => setPlan("single")}><b>${local.prices.single}</b>This tile</button>
            <button className="choice" aria-pressed={plan === "bundle"} onClick={() => setPlan("bundle")}><b>${local.prices.bundlePrice}</b>{local.prices.bundleCount} tiles as credits, for gifts and friends</button>
          </div>
          <div className="field"><label htmlFor="email">Email, for your tile link</label><input id="email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {plan !== "credit" && <div className="box small faint" style={{ borderStyle: "dashed" }}>Card details go here. Prototype: payment is not taken yet; Stripe arrives in Phase 3.</div>}
          <div className="note"><Icon name="lock" />Your card is only held, not charged, until a person approves your tile. If it isn’t approved, the hold is released and you pay nothing.</div>
          {error && <p className="error" role="alert">{error}</p>}
        </>}

        {step === "done" && result && <Done result={result} gift={gift} preview={imageUrl ?? (art ? artDataUrl(art) : "")} spot={chosen} />}
      </main>

      {step !== "done" && (
        <div className="flow__actions">
          {step === "pay" ? <button className="btn btn--primary btn--block" onClick={submit}>{plan === "credit" ? "Use 1 credit and submit" : plan === "bundle" ? `Pay $${local.prices.bundlePrice} and submit` : `Hold $${local.prices.single} and submit`}</button>
            : <button className="btn btn--primary btn--block" disabled={canNext[step] === false} onClick={() => { if (step === "place" && chosen) setSpot(chosen); go(1); }}>{step === "place" && chosen ? `Hold ${placeLabel(chosen)} for me` : "Continue"}</button>}
          {(step === "words" || step === "voice") && <button className="btn btn--quiet" onClick={() => { if (step === "words") setPhrase(""); else setVoice(null); go(1); }}>Skip</button>}
          {error && step !== "pay" && <p className="error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}

function Done({ result, gift, preview, spot }: { result: { id: string; status: string }; gift: boolean; preview: string; spot: Spot | null }) {
  const live = result.status === "approved";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center", paddingTop: 40 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt="" style={{ width: 150, height: 150, objectFit: "cover", boxShadow: "0 0 0 10px var(--wall), 0 0 0 11px var(--accent), 0 40px 80px rgba(0,0,0,.7)" }} />
      <span className="eyebrow">{live ? "Approved" : "Submitted"}</span>
      <h1>{live ? "Your tile is on the wall" : "Your tile is being reviewed"}</h1>
      <p className="muted" style={{ maxWidth: 340, lineHeight: 1.7 }}>
        {live ? "It glows softly for a little while so you can find it." : `Usually within a day. ${spot ? placeLabel(spot).replace(/^r/, "R") : "Your spot"} is held for you. If it isn’t approved, the hold on your card is released and you won’t be charged.`}
      </p>
      <div className="box small" style={{ textAlign: "left", width: "100%" }}>
        <strong style={{ fontWeight: 500 }}>Prototype shortcut</strong>
        <span className="muted">No email is sent yet. Approve it yourself in <Link href="/admin">Admin</Link>, then open <Link href={`/t?id=${result.id}`}>your tile page</Link>{gift ? <> or <Link href={`/t?id=${result.id}&gift=1`}>the gift link</Link></> : null}.</span>
      </div>
      <Link className="btn btn--primary btn--block" href={live ? `/?tile=${result.id}` : "/"}>Back to the mural</Link>
    </div>
  );
}

