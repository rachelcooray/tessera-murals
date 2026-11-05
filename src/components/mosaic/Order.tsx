"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { mosaicConfig, tierById, tileCount } from "@/config/mosaic";
import { sampleGrid, type SlotColour } from "@/lib/mosaic/colours";
import { ACCEPTED, MAX_BYTES, loadImage, pixels, readAsDataUrl, squareCanvas } from "@/lib/mosaic/image";
import { formatCents } from "@/lib/mosaic/ledger";
import { confirmOrder, live, placeOrder, rememberEmail } from "@/lib/mosaic/actions";
import { packHex } from "@/lib/mosaic/bits";
import { OCCASIONS, type Mosaic, type Occasion } from "@/lib/mosaic/types";
import { STRIPE_PK } from "@/lib/payments";
import { StripePay } from "../StripePay";
import { Icon } from "../ui";
import { FlowShell, MosaicGrid, Todo } from "./common";

const DAY = 86400_000;
/** Card payments run only against the live database, with Stripe's public key set. */
const paymentsLive = live && Boolean(STRIPE_PK);

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

export function OrderFlow() {
  const q = useSearchParams();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [target, setTarget] = useState<{ url: string; canvas: HTMLCanvasElement; name: string } | null>(null);
  const [title, setTitle] = useState("");
  const [occasion, setOccasion] = useState<Occasion>("wedding");
  const [own, setOwn] = useState(false);
  const [adult, setAdult] = useState(false);
  const [startNow, setStartNow] = useState(false);
  const [tierId, setTierId] = useState(q.get("tier") ?? "medium");
  const [dateMode, setDateMode] = useState<number | "pick">(1);
  // eslint-disable-next-line react-hooks/purity -- a default date, read once when the page opens
  const [opened] = useState(() => Date.now());
  const [picked, setPicked] = useState(() => isoDate(new Date(opened + 30 * DAY)));
  const [visibility, setVisibility] = useState<Mosaic["visibility"]>("public");
  const [openToArtists, setOpenToArtists] = useState(true);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<{ clientSecret: string; mosaicId: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const tier = tierById(tierId);
  const slots: SlotColour[] = useMemo(() => {
    if (!target) return [];
    const d = pixels(target.canvas);
    return sampleGrid(d.data, d.width, d.height, tier.cols, tier.rows);
  }, [target, tier]);

  const revealAt = useMemo(() => {
    if (dateMode === "pick") return new Date(`${picked}T18:00:00`);
    return new Date(opened + mosaicConfig.revealOptionsDays[dateMode] * DAY);
  }, [dateMode, picked, opened]);
  const minDate = isoDate(new Date(opened + mosaicConfig.minRevealDays * DAY));
  const dateOk = revealAt.getTime() >= Date.parse(minDate);

  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  async function onFile(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (!ACCEPTED.split(",").includes(f.type)) { setError("Please choose a JPG, PNG or WebP image."); return; }
    if (f.size > MAX_BYTES) { setError("That file is over 15 MB. Try a smaller copy."); return; }
    try {
      const img = await loadImage(await readAsDataUrl(f));
      if (Math.min(img.naturalWidth, img.naturalHeight) < 200) { setError("That image is too small. Use one at least 200 pixels across."); return; }
      const canvas = squareCanvas(img, mosaicConfig.storage.targetPx);
      setTarget({ url: canvas.toDataURL("image/jpeg", 0.85), canvas, name: f.name });
    } catch {
      setError("We couldn’t read that image. Try another file.");
    }
  }

  async function finish(mosaicId: string) {
    // Live: a confirmed email lets the buyer reach their mosaic from any device. Failing this mustn't block them.
    if (live) await rememberEmail(email.trim()).catch(() => null);
    router.push(`/mosaic?id=${mosaicId}&new=1`);
  }

  async function pay() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError("Please add an email so we can send your links."); return; }
    setBusy(true);
    try {
      const r = await placeOrder({
        tierId: tier.id, title: title.trim() || "Untitled mosaic", occasion, email: email.trim(), revealAt: revealAt.toISOString(), visibility, openToArtists,
        slotsPacked: packHex(slots.map((x) => x.hex)), target: target!.canvas, targetUrl: target!.url, priceCents: tier.priceCents, cols: tier.cols, rows: tier.rows, slots,
      });
      if (r.clientSecret) setIntent({ clientSecret: r.clientSecret, mosaicId: r.mosaicId });
      else await finish(r.mosaicId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your order could not start.");
    } finally { setBusy(false); }
  }

  async function paid() {
    // The webhook marks the order paid too; this just makes it instant.
    if (intent) { await confirmOrder(intent.mosaicId).catch(() => null); await finish(intent.mosaicId); }
  }

  if (step === 1) return (
    <FlowShell step={1} of={3} back={{ href: "/", label: "Step 1 of 3 · Your image" }} title="The picture only you know"
      actions={<button className="btn btn--primary btn--block" disabled={!target || !own || !adult} onClick={() => setStep(2)}>{!target ? "Choose an image to continue" : !own || !adult ? "Tick both boxes to continue" : "Continue to size"}</button>}>
      <p className="small muted">Contributors never see it. They get one colour each, and the picture appears at the reveal.</p>
      <input ref={fileRef} type="file" accept={ACCEPTED} className="sr-only" id="target" onChange={(e) => void onFile(e.target.files?.[0])} />
      {target ? (
        <div className="row" style={{ alignItems: "stretch", gap: 14, padding: 12, border: "1px solid var(--line2)", background: "var(--card)" }}>
          <img src={target.url} alt="Your chosen image, cropped square" width={128} height={128} style={{ width: 128, height: 128, objectFit: "cover" }} />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8, minWidth: 0, flex: 1 }}>
            <div><div className="serif" style={{ fontSize: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{target.name}</div><div className="small muted">Square crop from the centre</div></div>
            <button className="btn" style={{ minHeight: 40 }} onClick={() => fileRef.current?.click()}>Replace</button>
          </div>
        </div>
      ) : (
        <label htmlFor="target" className="dropzone"><Icon name="upload" size={22} /><span className="serif italic" style={{ fontSize: 22, color: "var(--ink)" }}>Tap to choose a picture</span><span className="small">JPG, PNG or WebP. Faces and strong shapes read best.</span></label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="field"><label htmlFor="title">What should we call it?</label><input id="title" className="input" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Amaya and Dev" /></div>
      <div className="field"><span className="lbl">What is it for?</span>
        <div className="row">{OCCASIONS.map((o) => <button key={o.id} className="btn" style={{ minHeight: 40, ...(occasion === o.id ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}) }} aria-pressed={occasion === o.id} onClick={() => setOccasion(o.id)}>{o.label}</button>)}</div>
        <span className="small faint">Artists see this, never the picture, so they can choose what they take part in.</span>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 14 }}>
        <legend className="eyebrow" style={{ marginBottom: 12 }}>Before you continue</legend>
        <label className="row small" style={{ alignItems: "flex-start", flexWrap: "nowrap", cursor: "pointer" }}><input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} style={{ width: 20, height: 20, accentColor: "var(--gold)", flex: "0 0 auto" }} /><span>I own this image, or I have permission from the people in it and whoever took it.<Todo>[TODO: needs lawyer review]</Todo></span></label>
        <label className="row small" style={{ alignItems: "flex-start", flexWrap: "nowrap", cursor: "pointer" }}><input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} style={{ width: 20, height: 20, accentColor: "var(--gold)", flex: "0 0 auto" }} /><span>I am 18 or older.<Todo>[TODO: needs lawyer review]</Todo></span></label>
      </fieldset>
    </FlowShell>
  );

  if (step === 2) return (
    <FlowShell step={2} of={3} title="How many hands?" actions={<>
      <button className="btn btn--primary btn--block" disabled={!dateOk} onClick={() => setStep(3)}>Continue with {tier.name}, {formatCents(tier.priceCents)}</button>
      <button className="btn btn--quiet btn--block" onClick={() => setStep(1)}>Back</button>
    </>}>
      <div className="row" style={{ flexWrap: "nowrap", gap: 14 }}>
        <div style={{ width: 132, flex: "0 0 auto" }}><MosaicGrid mosaic={{ cols: tier.cols, rows: tier.rows, slots }} mode="slots" maxWidth={132} label={`Your image at ${tileCount(tier).toLocaleString()} tiles`} /></div>
        <p className="small muted">Your image at {tileCount(tier).toLocaleString()} tiles. Only you see this preview. More tiles, more detail, more people.</p>
      </div>
      <div className="choices" role="radiogroup" aria-label="Mosaic size">
        {mosaicConfig.tiers.map((t) => (
          <button key={t.id} role="radio" aria-checked={t.id === tier.id} className="choice" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 64 }} onClick={() => setTierId(t.id)}>
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 19 }}>{t.name} · {tileCount(t).toLocaleString()} tiles</b><span className="faint">{t.fits}</span></span>
            <b>{formatCents(t.priceCents).replace(".00", "")}</b>
          </button>
        ))}
      </div>
      <div className="field"><span className="lbl">Reveal date</span>
        <div className="row">
          {mosaicConfig.revealOptionsDays.map((d, i) => <button key={d} className="btn" style={{ flex: "1 1 0", ...(dateMode === i ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}) }} aria-pressed={dateMode === i} onClick={() => setDateMode(i)}>{d / 7} weeks</button>)}
          <button className="btn" style={{ flex: "1 1 0", ...(dateMode === "pick" ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}) }} aria-pressed={dateMode === "pick"} onClick={() => setDateMode("pick")}>Pick a date</button>
        </div>
        {dateMode === "pick" && <input type="date" className="input" min={minDate} value={picked} onChange={(e) => setPicked(e.target.value)} aria-label="Reveal date" />}
        <span className="small faint">Reveal on {revealAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. {mosaicConfig.studioFillDaysBefore} days before, any empty slot gets a clearly marked studio fill, so the reveal never slips.</span>
        {!dateOk && <p className="error">Pick a date at least {mosaicConfig.minRevealDays} days away.</p>}
      </div>
      <div className="field"><span className="lbl">After the reveal</span>
        <div className="choices choices--2">
          <button className="choice" aria-pressed={visibility === "public"} onClick={() => setVisibility("public")}><b>Public</b><span className="faint">Joins Past mosaics for anyone to see</span></button>
          <button className="choice" aria-pressed={visibility === "private"} onClick={() => setVisibility("private")}><b>Private</b><span className="faint">Only people with your link</span></button>
        </div>
      </div>
    </FlowShell>
  );

  return (
    <FlowShell step={3} of={3} title={`${tileCount(tier).toLocaleString()} slots, ${tileCount(tier).toLocaleString()} colours`} actions={intent ? null : <>
      <button className="btn btn--primary btn--block" disabled={busy || !startNow} onClick={() => void pay()}>{busy ? "Working…" : !startNow ? "Tick the box above to continue" : paymentsLive ? `Continue to payment, ${formatCents(tier.priceCents)}` : `Test mode: create without paying`}</button>
      <button className="btn btn--quiet btn--block" onClick={() => setStep(2)}>Back</button>
    </>}>
      <p className="small muted">Each square is one person’s tile. This is all a contributor gets: the colour of their square.</p>
      <MosaicGrid mosaic={{ cols: tier.cols, rows: tier.rows, slots }} mode="slots" label="Your image split into flat colour slots" />
      <div className="row" style={{ flexWrap: "nowrap", justifyContent: "space-between", padding: "10px 14px", border: "1px solid var(--line2)" }}>
        <span style={{ display: "flex", flexDirection: "column", gap: 3 }}><span className="small" style={{ color: "var(--ink)" }}>Open spare slots to Tessera artists</span><span className="small faint">Your circle goes first. Unclaimed slots join the colour challenge.</span></span>
        <button className="switch" role="switch" aria-checked={openToArtists} aria-label="Open spare slots to Tessera artists" onClick={() => setOpenToArtists(!openToArtists)} />
      </div>
      <div className="field"><label htmlFor="email">Your email</label><input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /><span className="small faint">For your receipt, your links and the reveal.</span></div>
      <dl className="small" style={{ margin: 0, display: "grid", gap: 8 }}>
        <div className="split"><dt className="muted">{tier.name}, {tileCount(tier).toLocaleString()} tiles</dt><dd style={{ margin: 0 }}>{formatCents(tier.priceCents)}</dd></div>
        <div className="split"><dt className="muted">Reveal date</dt><dd style={{ margin: 0 }}>{revealAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</dd></div>
        <div className="split"><dt className="muted">After the reveal</dt><dd style={{ margin: 0 }}>{visibility === "public" ? "Public" : "Private"}</dd></div>
        <div className="split" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}><dt className="serif" style={{ fontSize: 18 }}>Total</dt><dd className="serif" style={{ margin: 0, fontSize: 18 }}>{formatCents(tier.priceCents)}</dd></div>
      </dl>
      <p className="small muted">This is a digital mosaic. Nothing is posted: you get the finished mosaic online, a reveal video and a link to keep.</p>
      <label className="row small" style={{ alignItems: "flex-start", flexWrap: "nowrap", cursor: "pointer" }}><input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} style={{ width: 20, height: 20, accentColor: "var(--gold)", flex: "0 0 auto" }} /><span>Please start my mosaic straight away. I understand that once the first square is painted I lose my right to cancel for a full refund within 14 days. See <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/refunds/`} target="_blank" rel="noreferrer">refunds</a>.</span></label>
      {!paymentsLive && <p className="note">Payments are in test mode, so no card is charged. {live ? "The mosaic is saved on Tessera’s server." : "Your mosaic is created in this browser."}</p>}
      {intent && <StripePay clientSecret={intent.clientSecret} label={`Pay ${formatCents(tier.priceCents)} and get your invite link`} onPaid={() => void paid()} />}
      {error && <p className="error" role="alert">{error}</p>}
    </FlowShell>
  );
}
