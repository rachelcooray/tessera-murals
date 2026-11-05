"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { joinFoundingList } from "@/lib/mosaic/actions";
import { OCCASIONS, type Occasion } from "@/lib/mosaic/types";
import { Page } from "./common";

/** The founding list: where "link in bio" lands until orders open. */
export function FoundingList() {
  const q = useSearchParams();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [wants, setWants] = useState<"order" | "paint" | "both">(q.get("artist") === "1" ? "paint" : "order");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Please enter your email."); return; }
    if (!agree) { setError("Please tick the box so we can email you."); return; }
    setBusy(true);
    try {
      await joinFoundingList({ email: email.trim(), name: name.trim(), occasion, wants, source: q.get("from") ?? q.get("utm_source") ?? "site" });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work. Please try again.");
    } finally { setBusy(false); }
  }

  if (done) return (
    <Page narrow>
      <span className="eyebrow">You’re on the list</span>
      <h1 style={{ fontSize: 44, margin: "10px 0 16px" }}>Thank you{name.trim() ? `, ${name.trim()}` : ""}.</h1>
      <p className="lede" style={{ marginBottom: 24 }}>We’ll email {email.trim()} as soon as founding mosaics open{wants !== "order" ? ", and when slots open for artists" : ""}. Nothing else, and you can unsubscribe from any email.</p>
      <div className="row"><Link className="btn btn--primary" href="/reveal?id=sample-dusk">Watch a reveal</Link><Link className="btn" href="/">See how it works</Link></div>
    </Page>
  );

  return (
    <Page narrow>
      <span className="eyebrow">Founding mosaics</span>
      <h1 style={{ fontSize: "clamp(36px, 6vw, 52px)", lineHeight: 1.04, margin: "10px 0 14px" }}>Your photo, painted square by square by everyone who loves you.</h1>
      <p className="lede" style={{ marginBottom: 28 }}>A digital mosaic: everyone paints one square, and nobody sees the picture until the reveal. Join the list and we’ll tell you the moment orders open.</p>
      <form onSubmit={(e) => void submit(e)} style={{ display: "grid", gap: 18, maxWidth: 520 }}>
        <div className="field"><label htmlFor="fl-email">Your email</label><input id="fl-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
        <div className="field"><label htmlFor="fl-name">First name <span className="faint">(optional)</span></label><input id="fl-name" className="input" autoComplete="given-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><span className="lbl">I want to</span>
          <div className="choices choices--2" role="radiogroup" aria-label="I want to">
            {([["order", "Order a mosaic", "For a wedding, birthday, anniversary…"], ["paint", "Paint as an artist", "Take open squares and share each mosaic’s artist pool"]] as const).map(([id, t, sub]) => (
              <button key={id} type="button" role="radio" className="choice" aria-checked={wants === id || wants === "both"} onClick={() => setWants(wants === "both" ? (id === "order" ? "paint" : "order") : wants === id ? id : "both")}><b>{t}</b><span className="faint">{sub}</span></button>
            ))}
          </div>
        </div>
        {wants !== "paint" && <div className="field"><span className="lbl">What’s it for? <span className="faint">(optional)</span></span>
          <div className="row">{OCCASIONS.map((o) => <button key={o.id} type="button" className="btn" style={{ minHeight: 40, ...(occasion === o.id ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}) }} aria-pressed={occasion === o.id} onClick={() => setOccasion(occasion === o.id ? null : o.id)}>{o.label}</button>)}</div>
        </div>}
        <label className="row small" style={{ alignItems: "flex-start", flexWrap: "nowrap", cursor: "pointer" }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 20, height: 20, accentColor: "var(--gold)", flex: "0 0 auto" }} />
          <span>Email me when founding mosaics open. I can unsubscribe at any time. See the <Link href="/privacy">privacy policy</Link>.</span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn--primary btn--block" disabled={busy}>{busy ? "Joining…" : "Join the founding list"}</button>
      </form>
    </Page>
  );
}
