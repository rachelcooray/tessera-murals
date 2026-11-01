import type { Metadata } from "next";
import { Footer, Header } from "@/components/ui";
import { site } from "@/config/site";
import { DEFAULT_PRICES, money, quote } from "@/lib/pricing";

export const metadata: Metadata = { title: "About" };

export default function About() {
  return (
    <div className="page">
      <Header current="/about" />
      <main className="container" style={{ display: "flex", flexWrap: "wrap", gap: 56 }}>
        <article style={{ flex: "1 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
          <span className="eyebrow">A note from the person who made this</span>
          <h1 style={{ fontSize: "clamp(38px, 6vw, 54px)", lineHeight: 1.05 }}>A small, permanent place to leave a mark</h1>
          <div className="serif" style={{ display: "flex", flexDirection: "column", gap: 18, fontSize: 20, lineHeight: 1.6 }}>
            <p>Most of what we make online disappears in a scroll. I wanted the opposite: one wall, four hundred small squares, each one a person. You claim a square for a dollar, put something on it, say a few words in your own voice, and it stays.</p>
            <p>Seen from far away it is one artwork. Up close it is hundreds of tiny human moments. Nobody plans the picture; it arranges itself as people arrive, because each new tile is placed beside the ones it belongs with.</p>
            <p>Some tiles are painted by hand. Some are made with AI. Both are welcome, both are labelled honestly, and neither is second-class. This is a shared, playful wall, not a verdict on what counts as art.</p>
            <p>Tessera is a creative project and a small business, not a charity. The dollar keeps it running and lets it grow. It is run by me, and you can reach me below.</p>
          </div>
          <div>
            <div className="serif italic" style={{ fontSize: 26 }}>{site.creatorName}</div>
            <div className="small muted"><a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a></div>
          </div>
        </article>
        <section id="why" style={{ flex: "1 1 100%", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 28, order: -1 }}>
          <div className="box">
            <span className="eyebrow">Three reasons people add a tile</span>
            <h2 style={{ fontSize: 26 }}>Declare your love</h2>
            <p className="small muted">A tile for your partner, your mum, someone you miss. Add a voice note and send it as a gift; the wall flies straight to it when they open the link.</p>
            <h2 style={{ fontSize: 26 }}>Show your talent</h2>
            <p className="small muted">Paint it, draw it, photograph it. Your work sits inside one big picture made by hundreds of people, under your name.</p>
            <h2 style={{ fontSize: 26 }}>Advertise your art</h2>
            <p className="small muted">Add a title, the story behind it and your handle, so people who love your tile can find you. No links or brand logos, just your work.</p>
          </div>
          <div className="box">
            <span className="eyebrow">What you get</span>
            <ul className="small" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
              <li>Your square on the wall for good. When the season closes it is frozen and kept in the gallery, still openable.</li>
              <li>Your picture, your words and your voice, under your name or anonymous.</li>
              <li>A page and link for your tile, to share or to send as a gift.</li>
              <li>If your tile isn’t approved, you pay nothing.</li>
            </ul>
          </div>
          <div className="box">
            <span className="eyebrow">Where your money goes</span>
            <ul className="small" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
              <li>Keeping the wall online, and storing every picture and voice.</li>
              <li>A person reviewing every tile before it goes up.</li>
              <li>Making pictures for people who describe theirs to the AI.</li>
              <li>Card fees. They hit small payments hardest, which is why more squares cost less each.</li>
              <li>Building the next season.</li>
            </ul>
            <p className="small muted">Tessera is a small creative business run by one person, not a charity.</p>
          </div>
        </section>
        <aside style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 28 }}>
          <section className="box">
            <h2 style={{ fontSize: 26 }}>How it works</h2>
            <ol className="small muted" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
              <li>Choose a picture you made, or describe one and let AI make it.</li>
              <li>Add a phrase and a {site.voice.minSeconds} to {site.voice.maxSeconds} second voice message, if you like.</li>
              <li>Pick one of three spots where it fits best.</li>
              <li>Pay {money(quote(1, DEFAULT_PRICES).total)} for one square, or buy more for less each: {money(quote(10, DEFAULT_PRICES).total)} for ten. You make a tile for every square you buy. Your card is only held until each one is reviewed, and you only pay for the ones that are approved.</li>
              <li>When the season closes, or all 400 squares are taken, it is frozen for good and a new one begins.</li>
            </ol>
          </section>
          <section className="box" id="policy">
            <h2 style={{ fontSize: 26 }}>Content policy</h2>
            <p className="small muted">Applies to pictures, phrases and voice messages alike. Not allowed:</p>
            <ul className="small" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
              <li>Sexual content or nudity. Anything sexual involving minors is blocked and reported.</li>
              <li>Violence, gore, or promotion of self-harm.</li>
              <li>Hate symbols, slurs, or attacks on any group.</li>
              <li>Real people without their consent, harassment, or anyone’s personal details.</li>
              <li>Copyrighted characters and brand logos.</li>
              <li>Spam, links, QR codes, or disguised adverts.</li>
            </ul>
            <p className="small muted">Every tile is reviewed by a person before it appears, and rejected tiles are never charged. You declare whether your tile is made by hand or with AI. We never use AI detectors to accuse anyone; honest mistakes are corrected, not punished.</p>
          </section>
          <section className="box" id="terms">
            <h2 style={{ fontSize: 26 }}>Terms</h2>
            <p className="small muted">[Terms of use and privacy notice to be written before launch.] Tessera is run by one person, {site.location}.</p>
          </section>
        </aside>
      </main>
      <Footer />
    </div>
  );
}
