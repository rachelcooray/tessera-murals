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
import { newTileId, submitTile, useCurrentSeason, useLocalState, useSeasonTiles } from "@/lib/store";
import type { Origin, Tile, VoiceClip } from "@/lib/types";
import { Recorder } from "./Recorder";
import { StripePay } from "./StripePay";
import { closeDate, Icon, useClosesIn } from "./ui";

type Step = "count" | "image" | "origin" | "words" | "voice" | "place" | "name" | "gift" | "pay" | "done";
const LABEL: Record<Step, string> = { count: "Squares", image: "Image", origin: "Origin", words: "Words", voice: "Voice", place: "Place", name: "Name", gift: "Gift", pay: "Pay", done: "Done" };
const PER_TILE: Step[] = ["image", "origin", "words", "voice", "place"];

/** One square being made. Every square in an order gets its own picture, words, voice and spot. */
interface Draft {
  mode: "upload" | "ai"; imageUrl: string | null; art: ArtSpec | null; palette: string[]; prompt: string; attempt: number;
  origin: Origin; phrase: string; title: string; medium: string; note: string; credit: string; voice: VoiceClip | null; spot: Spot | null;
}
const blank = (): Draft => ({ mode: "upload", imageUrl: null, art: null, palette: [], prompt: "", attempt: 0, origin: "hand", phrase: "", title: "", medium: "", note: "", credit: "", voice: null, spot: null });
const creditValid = (c: string) => !c.trim() || /^@?[A-Za-z0-9._]{1,30}$/.test(c.trim());
const preview = (d: Draft) => d.imageUrl ?? (d.art ? artDataUrl(d.art) : "");

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
  const [step, setStep] = useState<Step>("count");
  const [qty, setQty] = useState(1);
  const [other, setOther] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([blank()]);
  const [ti, setTi] = useState(0);
  const [busy, setBusy] = useState(false);
  const [named, setNamed] = useState(true);
  const [name, setName] = useState("");
  const [gift, setGift] = useState(startGift);
  const [recipient, setRecipient] = useState("");
  const [occasion, setOccasion] = useState("");
  const [giftNote, setGiftNote] = useState<VoiceClip | null>(null);
  const [email, setEmail] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [orderId] = useState(() => `o-${Date.now().toString(36)}`);
  const [busyPay, setBusyPay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ids: string[]; status: string } | null>(null);
  const closesIn = useClosesIn(season.closesAt);

  const d = drafts[ti] ?? blank();
  const upd = (patch: Partial<Draft>) => setDrafts((all) => all.map((x, i) => (i === ti ? { ...x, ...patch } : x)));
  const generated = d.mode === "ai" && !!d.art && !d.imageUrl;
  const freeSpots = season.gridSize ** 2 - seasonTiles.length;
  const maxQty = Math.max(1, Math.min(local.prices.maxPerOrder, freeSpots));
  const q = quote(qty, local.prices);
  const many = qty > 1;

  /** Spots for this square: the wall plus spots already picked for the other squares in this order. */
  const taken = useMemo(() => [
    ...seasonTiles,
    ...drafts.filter((x, i) => i !== ti && x.spot).map((x) => ({ x: x.spot!.x, y: x.spot!.y, status: "pending", palette: x.palette, art: x.art } as unknown as Tile)),
  ], [seasonTiles, drafts, ti]);
  const spots = useMemo(() => {
    if (!d.palette.length) return [];
    const s = suggestSpots(taken, d.palette, season.gridSize);
    if (ti === 0 && preferSpot && !taken.some((t) => t.x === preferSpot.x && t.y === preferSpot.y)) {
      return [{ ...preferSpot, score: 1, why: "The spot you chose" }, ...s.filter((o) => o.x !== preferSpot.x || o.y !== preferSpot.y).slice(0, 2)];
    }
    return s;
  }, [taken, d.palette, season.gridSize, preferSpot, ti]);
  const chosen = d.spot && !taken.some((t) => t.x === d.spot!.x && t.y === d.spot!.y) ? d.spot : spots[0] ?? null;

  const go = (dir: 1 | -1) => {
    setError(null);
    window.scrollTo(0, 0);
    if (dir === 1) {
      if (step === "count") { setDrafts((all) => Array.from({ length: qty }, (_, i) => all[i] ?? blank())); setTi(0); setStep("image"); return; }
      if (step === "place") {
        upd({ spot: chosen });
        if (ti < qty - 1) { setTi(ti + 1); setStep("image"); } else setStep("name");
        return;
      }
      if (step === "name") { setStep(gift ? "gift" : "pay"); return; }
      if (step === "gift") { setStep("pay"); return; }
      const i = PER_TILE.indexOf(step);
      if (i >= 0) setStep(PER_TILE[i + 1]);
      return;
    }
    if (step === "image") { if (ti > 0) { setTi(ti - 1); setStep("place"); } else setStep("count"); return; }
    if (step === "name") { setTi(qty - 1); setStep("place"); return; }
    if (step === "gift") { setStep("name"); return; }
    if (step === "pay") { setIntent(null); setStep(gift ? "gift" : "name"); return; }
    const i = PER_TILE.indexOf(step);
    if (i > 0) setStep(PER_TILE[i - 1]);
  };

  // Progress across the whole order.
  const totalUnits = 1 + qty * PER_TILE.length + 1 + (gift ? 1 : 0) + 1;
  const unit = step === "count" ? 1 : PER_TILE.includes(step) ? 2 + ti * PER_TILE.length + PER_TILE.indexOf(step) : step === "name" ? 2 + qty * PER_TILE.length : step === "gift" ? 3 + qty * PER_TILE.length : totalUnits;
  const where = PER_TILE.includes(step) && many ? `Square ${ti + 1} of ${qty} · ${LABEL[step]}` : LABEL[step];

  const generate = () => {
    if (!d.prompt.trim()) return;
    setBusy(true);
    setTimeout(() => {
      const a = promptToArt(d.prompt.trim(), d.attempt);
      upd({ art: a, imageUrl: null, palette: artPalette(a), attempt: d.attempt + 1, origin: "ai", spot: null });
      setBusy(false);
    }, 1300);
  };

  const check = (): boolean => {
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError("Please add an email so we can send your tile links."); return false; }
    const clash = drafts.findIndex((x) => x.spot && seasonTiles.some((t) => t.x === x.spot!.x && t.y === x.spot!.y));
    if (clash >= 0) { setError("Someone has just taken one of your spots. Please pick another."); setTi(clash); upd({ spot: null }); setStep("place"); return false; }
    return true;
  };

  const finalize = (intentId: string | null, amount: number) => {
    const base = newTileId(season.id), now = new Date().toISOString();
    const ids: string[] = [];
    let status = "pending";
    drafts.forEach((x, i) => {
      const isAi = x.mode === "ai" && !!x.art && !x.imageUrl;
      const has = x.title.trim() || x.medium.trim() || x.note.trim() || x.credit.trim();
      const tile: Tile = {
        id: qty > 1 ? `${base}-${i + 1}` : base, seasonId: season.id, x: x.spot!.x, y: x.spot!.y, art: x.imageUrl ? null : x.art, imageUrl: x.imageUrl,
        phrase: x.phrase.trim() || null, voice: x.voice, transcript: null, displayName: named ? name.trim() || null : null,
        details: has ? { title: x.title.trim() || null, medium: x.medium.trim() || null, note: x.note.trim() || null, credit: x.credit.trim() ? "@" + x.credit.trim().replace(/^@/, "") : null } : null,
        origin: isAi ? "ai" : x.origin, prompt: isAi ? x.prompt.trim() : null, palette: x.palette, status: "pending", rejectionReason: null,
        gift: gift ? { recipient: recipient.trim(), occasion: occasion.trim(), from: named ? name.trim() || null : null, note: giftNote, noteTranscript: null } : null,
        createdAt: now, approvedAt: null, flags: mockFlags(x.phrase, x.note), contentCredentials: x.imageUrl ? null : "Generated inside Tessera",
        payment: { kind: "hold", amount, quantity: qty, orderId, ...(intentId ? { intentId } : {}), mock: !intentId }, email,
      };
      ids.push(tile.id);
      status = submitTile(tile);
    });
    setResult({ ids, status });
    setStep("done");
  };

  const pay = async () => {
    setError(null);
    if (!check()) return;
    if (!paymentsLive) { finalize(null, q.total); return; }
    setBusyPay(true);
    try { setIntent(await createIntent(qty, email, orderId)); }
    catch (e) { setError(e instanceof Error ? e.message : "Payments are unavailable right now."); }
    setBusyPay(false);
  };

  const canNext: Partial<Record<Step, boolean>> = {
    image: (!!d.imageUrl || !!d.art) && !busy, words: d.phrase.length <= site.phraseMax && creditValid(d.credit), place: !!chosen,
    name: !named || name.trim().length > 0, gift: recipient.trim().length > 0 && occasion.trim().length > 0,
  };

  return (
    <div className="flow">
      {step !== "done" && (
        <>
          <div className="flow__top">
            {step !== "count" ? <button className="flow__back" onClick={() => go(-1)}><Icon name="back" size={14} />{where}</button>
              : <span className="eyebrow">How many squares</span>}
            <Link href="/wall" className="icon-btn" aria-label="Leave and return to the mural"><Icon name="close" /></Link>
          </div>
          <div className="flow__progress" aria-hidden="true"><i style={{ width: `${(unit / totalUnits) * 100}%` }} /></div>
        </>
      )}

      <main className="flow__main">
        {step === "count" && <>
          <h1>How many squares?</h1>
          {closesIn && closesIn !== "closed" && <p className="urgent">Season {season.number} {closesIn}{season.closesAt ? ` (${closeDate(season.closesAt)})` : ""}. After that it’s frozen for good.</p>}
          <div className="qty" role="group" aria-label="Number of squares">
            {sortedTiers(local.prices).filter((t) => t.n <= maxQty).map((t) => {
              const tq = quote(t.n, local.prices);
              return (
                <button key={t.n} className="choice qty__opt" aria-pressed={!other && qty === t.n} onClick={() => { setOther(false); setQty(t.n); }}>
                  <b>{t.n}</b><span>{money(tq.total)}</span>{tq.savingPct > 0 && <em>save {tq.savingPct}%</em>}
                </button>
              );
            })}
            <button className="choice qty__opt" aria-pressed={other} onClick={() => setOther(true)}><b>Other</b><span>any number</span></button>
          </div>
          {other && (
            <div className="field"><label htmlFor="qty">Squares, up to {maxQty}</label>
              <input id="qty" className="input" type="number" inputMode="numeric" min={1} max={maxQty} value={qty}
                onChange={(e) => setQty(Math.max(1, Math.min(maxQty, Math.floor(Number(e.target.value) || 1))))} /></div>
          )}
          <div className="box" style={{ background: "var(--card)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="serif" style={{ fontSize: 22 }}>{qty} square{many ? "s" : ""}</span>
              <span className="serif" style={{ fontSize: 30 }}>{money(q.total)}</span>
            </div>
            <span className="small muted">{money(q.perSquare)} each{q.saving > 0 ? ` · you save ${money(q.saving)} (${q.savingPct}%)` : ""}</span>
            {many && <span className="small muted">You’ll make all {qty} now, one after another: a picture for each, words and a voice if you like, and where each one goes.</span>}
          </div>
          <ul className="gets">
            <li>{many ? "Your squares" : "Your square"} on the wall for good, kept in the gallery when the season closes</li>
            <li>Your pictures, words and voice, under your name or anonymous</li>
            <li>A page and link for every tile, to share or to send as a gift</li>
          </ul>
        </>}

        {step === "image" && <>
          <h1>{many ? `What goes on square ${ti + 1}?` : "What goes on your tile?"}</h1>
          <div className="choices choices--2">
            <button className="choice" aria-pressed={d.mode === "upload"} onClick={() => upd({ mode: "upload" })}><Icon name="upload" size={22} />Upload a picture I made</button>
            <button className="choice" aria-pressed={d.mode === "ai"} onClick={() => upd({ mode: "ai" })}><Icon name="ai" size={22} />Describe it, let AI make it</button>
          </div>
          {d.mode === "upload" ? (
            <>
              <label className="dropzone">
                {d.imageUrl ? (/* eslint-disable-next-line @next/next/no-img-element */ <img className="preview" src={d.imageUrl} alt="Your picture, cropped to a square" />)
                  : <><span className="serif italic" style={{ fontSize: 22, color: "var(--ink)" }}>Tap to choose a picture</span><span className="small">JPG or PNG. We crop it to a square.</span></>}
                <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  setBusy(true);
                  try { const r = await processUpload(f); upd({ imageUrl: r.url, art: null, palette: r.palette, origin: "hand", spot: null }); }
                  catch { setError("That image could not be read. Try a JPG or PNG."); }
                  setBusy(false);
                  e.target.value = "";
                }} />
              </label>
              <p className="small faint">It must be yours. No logos, no real people without their consent, nothing on the <Link href="/about#policy">content policy</Link> list.</p>
            </>
          ) : (
            <>
              <div className="field"><label htmlFor="prompt">Describe your picture</label>
                <textarea id="prompt" className="textarea" value={d.prompt} maxLength={300} placeholder="A lighthouse at dusk, painted in thick strokes" onChange={(e) => upd({ prompt: e.target.value })} /></div>
              {d.art && !d.imageUrl && (/* eslint-disable-next-line @next/next/no-img-element */ <img className="preview" src={artDataUrl(d.art)} alt={`Generated from: ${d.prompt}`} />)}
              <button className="btn" disabled={busy || !d.prompt.trim() || d.attempt >= 4} onClick={generate}>{busy ? "Making it…" : d.attempt === 0 ? "Generate" : `Try again (${4 - d.attempt} left)`}</button>
              <p className="small faint">Anything made here is labelled “Made with AI” automatically. Prototype: this is a stand-in generator, real AI arrives later.</p>
            </>
          )}
        </>}

        {step === "origin" && <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview(d)} alt="" style={{ width: 120, height: 120, objectFit: "cover", boxShadow: "0 20px 40px rgba(0,0,0,.5)" }} />
          <h1>Did you make this by hand, or with AI?</h1>
          {generated ? <p className="muted">You made this with Tessera’s generator, so it is labelled <strong>Made with AI</strong>.</p> : <>
            <p className="muted small">Both are welcome and shown with the same weight. The label just tells the truth.</p>
            <div className="choices">
              <button className="choice" aria-pressed={d.origin === "hand"} onClick={() => upd({ origin: "hand" })}><b>Made by hand</b>Painted, drawn, photographed or collaged by you</button>
              <button className="choice" aria-pressed={d.origin === "ai"} onClick={() => upd({ origin: "ai" })}><b>Made with AI</b>Generated or substantially edited by an AI tool</button>
            </div>
            <p className="small faint">Honest mistakes are corrected, not punished.</p>
          </>}
        </>}

        {step === "words" && <>
          <h1>A few words, if you like</h1>
          <p className="muted small">Shown under your picture when someone opens your tile. Optional.</p>
          <div className="field"><label htmlFor="phrase">Your phrase</label>
            <input id="phrase" className="input input--serif" value={d.phrase} maxLength={site.phraseMax} placeholder="for the lighthouse keeper I never met" onChange={(e) => upd({ phrase: e.target.value })} />
            <span className="counter">{d.phrase.length} / {site.phraseMax}</span></div>
          <details className="more" open={!!(d.title || d.medium || d.note || d.credit) || undefined}>
            <summary>Add more about this piece <span className="faint">(optional)</span></summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingTop: 16 }}>
              <div className="field"><label htmlFor="title">Title</label><input id="title" className="input" maxLength={site.details.titleMax} value={d.title} placeholder="Low tide" onChange={(e) => upd({ title: e.target.value })} /></div>
              <div className="field"><label htmlFor="medium">Made with</label><input id="medium" className="input" maxLength={site.details.mediumMax} value={d.medium} placeholder="Gouache on paper, or the tool you used" onChange={(e) => upd({ medium: e.target.value })} /></div>
              <div className="field"><label htmlFor="note">The story behind it</label><textarea id="note" className="textarea" maxLength={site.details.noteMax} value={d.note} placeholder="What it is, why you made it, who it’s for" onChange={(e) => upd({ note: e.target.value })} /><span className="counter">{d.note.length} / {site.details.noteMax}</span></div>
              <div className="field"><label htmlFor="credit">Credit, so people can find you</label><input id="credit" className="input" maxLength={site.details.creditMax + 1} value={d.credit} placeholder="@yourname" onChange={(e) => upd({ credit: e.target.value })} />
                {creditValid(d.credit) ? <span className="small faint">Shown as plain text, not a link.</span> : <span className="error">Just a handle, like @yourname. No links.</span>}</div>
            </div>
          </details>
        </>}

        {step === "voice" && <>
          <h1>Say something, in your own voice</h1>
          <p className="muted small">{site.voice.minSeconds} to {site.voice.maxSeconds} seconds. People hear it when they open your tile. Optional.</p>
          <Recorder key={ti} value={d.voice} onChange={(v) => upd({ voice: v })} />
        </>}

        {step === "place" && <>
          <h1>{many ? `Where does square ${ti + 1} belong?` : "Three spots where your tile belongs"}</h1>
          <p className="muted small">The squares with a gold border fit your colours best. Tap one.{many ? " Your other squares show in ivory." : ""} It is held for you while your tiles are reviewed.</p>
          <div className="spotgrid" role="group" aria-label="Season mural with suggested spots">
            {Array.from({ length: season.gridSize ** 2 }, (_, i) => {
              const x = i % season.gridSize, y = Math.floor(i / season.gridSize);
              const k = spots.findIndex((s) => s.x === x && s.y === y);
              if (k >= 0) {
                const on = chosen?.x === x && chosen?.y === y;
                return <button key={i} className="cand" aria-pressed={on} aria-label={`Suggested spot ${k + 1} of ${spots.length}`} onClick={() => upd({ spot: spots[k] })} style={on ? { backgroundImage: `url("${preview(d)}")` } : undefined} />;
              }
              const mine = drafts.findIndex((o, j) => j !== ti && o.spot?.x === x && o.spot?.y === y);
              if (mine >= 0) return <i key={i} className="mine" style={{ backgroundImage: `url("${preview(drafts[mine])}")` }} />;
              const t = seasonTiles.find((v) => v.x === x && v.y === y);
              return <i key={i} className={t ? "" : "free"} style={t ? { background: t.status === "approved" ? t.palette[0] : "rgba(201,162,79,.15)", opacity: 0.8 } : undefined} />;
            })}
          </div>
          <p className="small muted" aria-live="polite">{chosen?.why}</p>
        </>}

        {step === "name" && <>
          <h1>How should the plaque read?</h1>
          {many && <p className="small muted">This goes on all {qty} of your tiles.</p>}
          <div className="choices">
            <button className="choice" aria-pressed={named} onClick={() => setNamed(true)}><b>Show my name</b>In the same serif as everyone else</button>
            {named && <div className="field"><label htmlFor="name">Your name</label><input id="name" className="input input--serif" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></div>}
            <button className="choice" aria-pressed={!named} onClick={() => setNamed(false)}><b>Stay anonymous</b>The plaque reads “Anonymous”. We still email you the links.</button>
          </div>
          <div className="box" style={{ background: "var(--card)", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <div><div className="serif" style={{ fontSize: 20 }}>{many ? "These tiles are a gift" : "This tile is a gift"}</div><div className="small muted">A birthday, an anniversary, a memorial</div></div>
            <button className="switch" role="switch" aria-checked={gift} aria-label="This is a gift" onClick={() => setGift(!gift)} />
          </div>
        </>}

        {step === "gift" && <>
          <h1>Who is this for?</h1>
          <div className="field"><label htmlFor="rcp">Their name</label><input id="rcp" className="input input--serif" maxLength={40} value={recipient} placeholder="Dad" onChange={(e) => setRecipient(e.target.value)} /></div>
          <div className="field"><label htmlFor="occ">The occasion, in a line</label><input id="occ" className="input input--serif" maxLength={40} value={occasion} placeholder="Happy 60th" onChange={(e) => setOccasion(e.target.value)} /></div>
          <div className="field"><span className="lbl">A voice note just for them (optional)</span><Recorder value={giftNote} onChange={setGiftNote} label="note for them" /></div>
          <p className="small faint">Once approved you get a gift link. When they open it, the wall flies to your tile and plays your note.</p>
        </>}

        {step === "pay" && <>
          <h1>Ready to go up</h1>
          <div className="pay-tiles" aria-label="Your tiles">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {drafts.map((x, i) => <img key={i} src={preview(x)} alt={`Square ${i + 1}`} />)}
          </div>
          <div className="box" style={{ background: "var(--card)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="serif" style={{ fontSize: 22 }}>{qty} square{many ? "s" : ""}</span>
              <span className="serif" style={{ fontSize: 30 }}>{money(q.total)}</span>
            </div>
            <span className="small muted">{money(q.perSquare)} each{q.saving > 0 ? ` · you save ${money(q.saving)} (${q.savingPct}%)` : ""}</span>
          </div>
          <div className="field"><label htmlFor="email">Email, for your tile links</label><input id="email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => { setEmail(e.target.value); setIntent(null); }} /></div>
          {paymentsLive
            ? (intent ? <StripePay clientSecret={intent.clientSecret} label={`Hold ${money(intent.amount)} and submit`} onPaid={(id) => finalize(id, intent.amount)} /> : null)
            : <div className="box small faint" style={{ borderStyle: "dashed" }}>Test mode: no card is charged. Stripe switches on once the payments server is set up.</div>}
          <div className="note"><Icon name="lock" />{many ? `Your card is held for ${money(q.total)}, not charged. A person reviews each tile, and you only pay for the ones that are approved, at the price for that many squares. If none are approved, the hold is released.` : "Your card is only held, not charged, until a person approves your tile. If it isn’t approved, the hold is released and you pay nothing."}</div>
          {error && <p className="error" role="alert">{error}</p>}
        </>}

        {step === "done" && result && <Done result={result} gift={gift} previews={drafts.map(preview)} />}
      </main>

      {step !== "done" && (
        <div className="flow__actions">
          {step === "pay" ? (intent ? null : <button className="btn btn--primary btn--block" disabled={busyPay} onClick={pay}>{busyPay ? "Working…" : paymentsLive ? "Continue to payment" : `Hold ${money(q.total)} and submit`}</button>)
            : <button className="btn btn--primary btn--block" disabled={canNext[step] === false} onClick={() => go(1)}>
                {step === "count" ? (many ? `Make my ${qty} tiles` : "Make my tile") : step === "place" && chosen ? (ti < qty - 1 ? `Hold this spot, on to square ${ti + 2}` : "Hold this spot for me") : "Continue"}
              </button>}
          {(step === "words" || step === "voice") && <button className="btn btn--quiet" onClick={() => { if (step === "words") upd({ phrase: "", title: "", medium: "", note: "", credit: "" }); else upd({ voice: null }); go(1); }}>Skip</button>}
          {error && step !== "pay" && <p className="error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}

function Done({ result, gift, previews }: { result: { ids: string[]; status: string }; gift: boolean; previews: string[] }) {
  const live = result.status === "approved";
  const n = result.ids.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center", paddingTop: 40 }}>
      <div className="pay-tiles" style={{ justifyContent: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {previews.map((src, i) => <img key={i} src={src} alt="" />)}
      </div>
      <span className="eyebrow">{live ? "Approved" : "Submitted"}</span>
      <h1>{live ? (n > 1 ? `Your ${n} tiles are on the wall` : "Your tile is on the wall") : n > 1 ? `Your ${n} tiles are being reviewed` : "Your tile is being reviewed"}</h1>
      <p className="muted" style={{ maxWidth: 360, lineHeight: 1.7 }}>
        {live ? "They glow softly for a little while so you can find them." : `Usually within a day. Your ${n > 1 ? "spots are" : "spot is"} held for you. You only pay for tiles that are approved.`}
      </p>
      <div className="box small" style={{ textAlign: "left", width: "100%" }}>
        <strong style={{ fontWeight: 500 }}>Prototype shortcut</strong>
        <span className="muted">No email is sent yet. Approve {n > 1 ? "them" : "it"} yourself in <Link href="/admin">Admin</Link>, then open <Link href={`/t?id=${result.ids[0]}`}>your tile page</Link>{gift ? <> or <Link href={`/t?id=${result.ids[0]}&gift=1`}>the gift link</Link></> : null}.</span>
      </div>
      <Link className="btn btn--primary btn--block" href={live ? `/wall?tile=${result.ids[0]}` : "/wall"}>Back to the mural</Link>
    </div>
  );
}
