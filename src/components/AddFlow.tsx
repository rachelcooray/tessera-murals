"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { site } from "@/config/site";
import { artDataUrl, artPalette, type ArtKind, type ArtSpec } from "@/lib/art";
import { extractPalette } from "@/lib/colour";
import { suggestSpots, type Spot } from "@/lib/placement";
import { createIntent, paymentsLive, type Intent } from "@/lib/payments";
import { money, quote, sortedTiers } from "@/lib/pricing";
import { hashString } from "@/lib/rng";
import { addCredits, newTileId, submitTile, useCurrentSeason, useLocalState, useSeasonTiles } from "@/lib/store";
import type { Origin, Tile, VoiceClip } from "@/lib/types";
import { Recorder } from "./Recorder";
import { StripePay } from "./StripePay";
import { Icon } from "./ui";

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
function mockFlags(phrase: string, note: string): string[] {
  const ad = /https?:|www\.|\.com|@|\b(buy|sale|discount|follow me)\b/i;
  return [...(ad.test(phrase) ? ["Phrase: possible link or advert."] : []), ...(ad.test(note) ? ["Note: possible link or advert."] : [])];
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
  const [more, setMore] = useState(false);
  const [title, setTitle] = useState("");
  const [medium, setMedium] = useState("");
  const [note, setNote] = useState("");
  const [credit, setCredit] = useState("");
  const creditOk = !credit.trim() || /^@?[A-Za-z0-9._]{1,30}$/.test(credit.trim());
  const [named, setNamed] = useState(true);
  const [name, setName] = useState("");
  const [gift, setGift] = useState(startGift);
  const [recipient, setRecipient] = useState("");
  const [occasion, setOccasion] = useState("");
  const [giftNote, setGiftNote] = useState<VoiceClip | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [qty, setQty] = useState(1);
  const [other, setOther] = useState(false);
  const [useCredit, setUseCredit] = useState(false);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [tileId] = useState(() => newTileId(season.id));
  const [busyPay, setBusyPay] = useState(false);
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

  const freeSpots = season.gridSize ** 2 - seasonTiles.length;
  const maxQty = Math.max(1, Math.min(local.prices.maxPerOrder, freeSpots));
  const q = quote(qty, local.prices);
  const paidWithCredit = useCredit && local.credits > 0;

  const check = (): boolean => {
    if (!chosen) return false;
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError("Please add an email so we can send your tile link."); return false; }
    if (seasonTiles.some((t) => t.x === chosen.x && t.y === chosen.y)) { setError("Someone has just taken that spot. Please pick another."); setSpot(null); setStep("place"); return false; }
    return true;
  };

  const finalize = (intentId: string | null, amount: number) => {
    if (!chosen) return;
    const kind = paidWithCredit ? "credit" : qty === 1 ? "hold" : "charge";
    const tile: Tile = {
      id: tileId, seasonId: season.id, x: chosen.x, y: chosen.y, art: imageUrl ? null : art, imageUrl,
      phrase: phrase.trim() || null, voice,
      details: title.trim() || medium.trim() || note.trim() || credit.trim() ? { title: title.trim() || null, medium: medium.trim() || null, note: note.trim() || null, credit: credit.trim() ? "@" + credit.trim().replace(/^@/, "") : null } : null, transcript: null, displayName: named ? name.trim() || null : null,
      origin: generated ? "ai" : origin, prompt: generated ? prompt.trim() : null, palette, status: "pending", rejectionReason: null,
      gift: gift ? { recipient: recipient.trim(), occasion: occasion.trim(), from: named ? name.trim() || null : null, note: giftNote, noteTranscript: null } : null,
      createdAt: new Date().toISOString(), approvedAt: null, flags: mockFlags(phrase, note), contentCredentials: imageUrl ? null : "Generated inside Tessera",
      payment: { kind, amount: paidWithCredit ? 0 : amount, quantity: paidWithCredit ? 1 : qty, ...(intentId ? { intentId } : {}), mock: !intentId && !paidWithCredit }, email,
    };
    if (paidWithCredit) addCredits(-1);
    else if (qty > 1) addCredits(qty - 1);
    const status = submitTile(tile);
    setResult({ id: tile.id, status });
    setStep("done");
  };

  const pay = async () => {
    setError(null);
    if (!check()) return;
    if (paidWithCredit || !paymentsLive) { finalize(null, q.total); return; }
    setBusyPay(true);
    try { setIntent(await createIntent(qty, email, tileId)); }
    catch (e) { setError(e instanceof Error ? e.message : "Payments are unavailable right now."); }
    setBusyPay(false);
  };

  const canNext: Partial<Record<Step, boolean>> = {
    image: hasImage && !busy, words: phrase.length <= site.phraseMax && creditOk, name: !named || name.trim().length > 0,
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
          <details className="more" open={more} onToggle={(e) => setMore((e.target as HTMLDetailsElement).open)}>
            <summary>Add more about this piece <span className="faint">(optional)</span></summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingTop: 16 }}>
              <div className="field"><label htmlFor="title">Title</label><input id="title" className="input" maxLength={site.details.titleMax} value={title} placeholder="Low tide" onChange={(e) => setTitle(e.target.value)} /></div>
              <div className="field"><label htmlFor="medium">Made with</label><input id="medium" className="input" maxLength={site.details.mediumMax} value={medium} placeholder="Gouache on paper, or the tool you used" onChange={(e) => setMedium(e.target.value)} /></div>
              <div className="field"><label htmlFor="note">The story behind it</label><textarea id="note" className="textarea" maxLength={site.details.noteMax} value={note} placeholder="What it is, why you made it, who it’s for" onChange={(e) => setNote(e.target.value)} /><span className="counter">{note.length} / {site.details.noteMax}</span></div>
              <div className="field"><label htmlFor="credit">Credit, so people can find you</label><input id="credit" className="input" maxLength={site.details.creditMax + 1} value={credit} placeholder="@yourname" onChange={(e) => setCredit(e.target.value)} />
                {creditOk ? <span className="small faint">Shown as plain text, not a link.</span> : <span className="error">Just a handle, like @yourname. No links.</span>}</div>
            </div>
          </details>
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
          <p className="muted small">The squares with a gold border fit your colours best. Tap one. It is held for you while your tile is reviewed.</p>
          <div className="spotgrid" role="group" aria-label="Season mural with suggested spots">
            {Array.from({ length: season.gridSize ** 2 }, (_, i) => {
              const x = i % season.gridSize, y = Math.floor(i / season.gridSize);
              const t = seasonTiles.find((v) => v.x === x && v.y === y);
              const k = spots.findIndex((s) => s.x === x && s.y === y);
              if (k >= 0) {
                const on = chosen?.x === x && chosen?.y === y;
                return <button key={i} className="cand" aria-pressed={on} aria-label={`Suggested spot ${k + 1} of ${spots.length}`} onClick={() => setSpot(spots[k])} style={on ? { backgroundImage: `url("${imageUrl ?? (art ? artDataUrl(art) : "")}")` } : undefined} />;
              }
              return <i key={i} className={t ? "" : "free"} style={t ? { background: t.status === "approved" ? t.palette[0] : "rgba(201,162,79,.15)", opacity: 0.8 } : undefined} />;
            })}
          </div>
          <p className="small muted" aria-live="polite">{chosen?.why}</p>
        </>}

        {step === "pay" && <>
          <h1>How many squares?</h1>
          {local.credits > 0 && (
            <div className="choices choices--2">
              <button className="choice" aria-pressed={useCredit} onClick={() => { setUseCredit(true); setIntent(null); }}><b>Use a credit</b>You have {local.credits}</button>
              <button className="choice" aria-pressed={!useCredit} onClick={() => { setUseCredit(false); setIntent(null); }}><b>Buy squares</b>Pay by card</button>
            </div>
          )}
          {!paidWithCredit && <>
            <div className="qty" role="group" aria-label="Number of squares">
              {sortedTiers(local.prices).filter((t) => t.n <= maxQty).map((t) => {
                const tq = quote(t.n, local.prices);
                return (
                  <button key={t.n} className="choice qty__opt" aria-pressed={!other && qty === t.n} onClick={() => { setOther(false); setQty(t.n); setIntent(null); }}>
                    <b>{t.n}</b><span>{money(tq.total)}</span>{tq.savingPct > 0 && <em>save {tq.savingPct}%</em>}
                  </button>
                );
              })}
              <button className="choice qty__opt" aria-pressed={other} onClick={() => { setOther(true); setIntent(null); }}><b>Other</b><span>any number</span></button>
            </div>
            {other && (
              <div className="field"><label htmlFor="qty">Squares, up to {maxQty}</label>
                <input id="qty" className="input" type="number" inputMode="numeric" min={1} max={maxQty} value={qty}
                  onChange={(e) => { setQty(Math.max(1, Math.min(maxQty, Math.floor(Number(e.target.value) || 1)))); setIntent(null); }} /></div>
            )}
            <div className="box" style={{ background: "var(--card)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span className="serif" style={{ fontSize: 22 }}>{qty} square{qty === 1 ? "" : "s"}</span>
                <span className="serif" style={{ fontSize: 30 }}>{money(q.total)}</span>
              </div>
              <span className="small muted">{money(q.perSquare)} each{q.saving > 0 ? ` · you save ${money(q.saving)} (${q.savingPct}%)` : ""}</span>
              {qty > 1 && <span className="small muted">This tile uses one. The other {qty - 1} become credits for later, or to gift.</span>}
            </div>
          </>}
          <div className="field"><label htmlFor="email">Email, for your tile link</label><input id="email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {!paidWithCredit && (paymentsLive
            ? (intent ? <StripePay clientSecret={intent.clientSecret} label={qty === 1 ? `Hold ${money(intent.amount)} and submit` : `Pay ${money(intent.amount)} and submit`} onPaid={(id) => finalize(id, intent.amount)} /> : null)
            : <div className="box small faint" style={{ borderStyle: "dashed" }}>Test mode: no card is charged. Stripe switches on once the payments server is set up.</div>)}
          <div className="note"><Icon name="lock" />{paidWithCredit ? "Your credit is only used once your tile is approved." : qty === 1 ? "Your card is only held, not charged, until a person approves your tile. If it isn’t approved, the hold is released and you pay nothing." : "Squares are charged now. If this tile isn’t approved, its square goes back to you as a credit."}</div>
          {error && <p className="error" role="alert">{error}</p>}
        </>}

        {step === "done" && result && <Done result={result} gift={gift} preview={imageUrl ?? (art ? artDataUrl(art) : "")} />}
      </main>

      {step !== "done" && (
        <div className="flow__actions">
          {step === "pay" ? (intent && !paidWithCredit ? null : <button className="btn btn--primary btn--block" disabled={busyPay} onClick={pay}>{busyPay ? "Working…" : paidWithCredit ? "Use 1 credit and submit" : paymentsLive ? "Continue to payment" : qty === 1 ? `Hold ${money(q.total)} and submit` : `Pay ${money(q.total)} and submit`}</button>)
            : <button className="btn btn--primary btn--block" disabled={canNext[step] === false} onClick={() => { if (step === "place" && chosen) setSpot(chosen); go(1); }}>{step === "place" && chosen ? "Hold this spot for me" : "Continue"}</button>}
          {(step === "words" || step === "voice") && <button className="btn btn--quiet" onClick={() => { if (step === "words") { setPhrase(""); setTitle(""); setMedium(""); setNote(""); setCredit(""); } else setVoice(null); go(1); }}>Skip</button>}
          {error && step !== "pay" && <p className="error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}

function Done({ result, gift, preview }: { result: { id: string; status: string }; gift: boolean; preview: string }) {
  const live = result.status === "approved";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center", paddingTop: 40 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt="" style={{ width: 150, height: 150, objectFit: "cover", boxShadow: "0 0 0 10px var(--wall), 0 0 0 11px var(--accent), 0 40px 80px rgba(0,0,0,.7)" }} />
      <span className="eyebrow">{live ? "Approved" : "Submitted"}</span>
      <h1>{live ? "Your tile is on the wall" : "Your tile is being reviewed"}</h1>
      <p className="muted" style={{ maxWidth: 340, lineHeight: 1.7 }}>
        {live ? "It glows softly for a little while so you can find it." : `Usually within a day. Your spot is held for you. If it isn’t approved, the hold on your card is released and you won’t be charged.`}
      </p>
      <div className="box small" style={{ textAlign: "left", width: "100%" }}>
        <strong style={{ fontWeight: 500 }}>Prototype shortcut</strong>
        <span className="muted">No email is sent yet. Approve it yourself in <Link href="/admin">Admin</Link>, then open <Link href={`/t?id=${result.id}`}>your tile page</Link>{gift ? <> or <Link href={`/t?id=${result.id}&gift=1`}>the gift link</Link></> : null}.</span>
      </div>
      <Link className="btn btn--primary btn--block" href={live ? `/?tile=${result.id}` : "/"}>Back to the mural</Link>
    </div>
  );
}

