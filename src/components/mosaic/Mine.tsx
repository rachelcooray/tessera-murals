"use client";
import Link from "next/link";
import { useState } from "react";
import { formatCents } from "@/lib/mosaic/ledger";
import { live, loadMine, signInByEmail, useLoad } from "@/lib/mosaic/actions";
import { useMosaicState } from "@/lib/mosaic/store";
import type { Mosaic } from "@/lib/mosaic/types";
import { Page, dateLabel } from "./common";

const STATUS: Record<Mosaic["status"], string> = { awaiting_payment: "Waiting for payment", collecting: "Collecting tiles", revealed: "Revealed", cancelled: "Cancelled" };

/** The buyer's mosaics. Live: whatever this sign-in owns, plus a way to sign in by email on a new device. */
export function MyMosaics() {
  const s = useMosaicState();
  const loaded = useLoad("mine", loadMine);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list: Mosaic[] = live ? loaded.data ?? [] : s.mosaics.filter((m) => s.owned[m.id] === m.ownerKey);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setSent("Please enter the email you ordered with."); return; }
    setBusy(true);
    const err = await signInByEmail(email.trim());
    setBusy(false);
    setSent(err ?? `If ${email.trim()} has a confirmed order, a sign-in link is on its way. Open it on this device.`);
  }

  return (
    <Page narrow>
      <span className="eyebrow">Your orders</span>
      <h1 style={{ fontSize: 44, margin: "10px 0 24px" }}>My mosaics</h1>
      {loaded.loading ? <p className="muted" role="status">Loading…</p> : loaded.error ? <p className="error">{loaded.error}</p> : list.length === 0 ? (
        <p className="muted">No mosaics on this device yet. <Link href="/start">Start one</Link>.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
          {list.map((m) => (
            <li key={m.id} className="box" style={{ gap: 6 }}>
              <div className="split"><Link className="serif" style={{ fontSize: 22 }} href={`/mosaic?id=${m.id}`}>{m.title}</Link><span className="small muted">{STATUS[m.status]}</span></div>
              <span className="small faint">{(m.cols * m.rows).toLocaleString()} tiles · {formatCents(m.priceCents)}{m.payment.mock ? " (test)" : ""} · {m.status === "revealed" && m.revealedAt ? `revealed ${dateLabel(m.revealedAt)}` : `reveal ${dateLabel(m.revealAt)}`}</span>
            </li>
          ))}
        </ul>
      )}
      {live && (
        <form onSubmit={(e) => void send(e)} style={{ display: "grid", gap: 12, marginTop: 40, maxWidth: 460 }}>
          <h2 style={{ fontSize: 24 }}>On a different device?</h2>
          <p className="small muted">Enter the email you ordered with. Once you’ve confirmed it from your order email, we’ll send a link that signs you in here.</p>
          <div className="field"><label htmlFor="mine-email">Email</label><input id="mine-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <button className="btn btn--primary" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
          {sent && <p className="note" role="status">{sent}</p>}
        </form>
      )}
    </Page>
  );
}
