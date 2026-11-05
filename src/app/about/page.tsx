import Link from "next/link";
import type { Metadata } from "next";
import { Page } from "@/components/mosaic/common";
import { mosaicConfig } from "@/config/mosaic";
import { site } from "@/config/site";
import { formatCents } from "@/lib/mosaic/ledger";

export const metadata: Metadata = { title: "About" };

const p = mosaicConfig.pool;

export default function About() {
  return (
    <Page current="/about">
      <section style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 760, padding: "24px 0 56px" }}>
        <span className="eyebrow">About</span>
        <h1 style={{ fontSize: "clamp(38px, 6vw, 56px)", lineHeight: 1.05 }}>A tessera is one small tile in a mosaic.</h1>
        <p className="lede">Tessera turns one picture into hundreds of small artworks by different people, each painting a colour without knowing what it belongs to. The picture only appears when every tile is in.</p>
        <p className="small muted">It belongs to an old tradition: the Surrealists’ “exquisite corpse”, where artists added to a drawing without seeing the rest, and art projects that split one image between thousands of hands. Tessera makes that a gift anyone can start from a phone.</p>
      </section>

      <section className="section" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 36 }}>
        <div className="box"><h2 style={{ fontSize: 22 }}>The picture stays hidden</h2><p className="small muted">Contributors see one colour, never the image. Only the customer and our reviewers see it before the reveal, and the customer decides whether the finished piece is public or private.</p></div>
        <div className="box"><h2 style={{ fontSize: 22 }}>Contributors never pay</h2><p className="small muted">The customer pays for the mosaic. {p.shareBps / 100}% of the price goes to the public artists whose tiles make it in, shared by tile. A tile the customer favourites counts {p.favouriteMultiplier === 2 ? "twice" : `${p.favouriteMultiplier} times`}.</p></div>
        <div className="box"><h2 style={{ fontSize: 22 }}>Made by people</h2><p className="small muted">Every contributed tile is painted, drawn or photographed by a person. We don’t accept AI-generated art. If a slot is still empty {mosaicConfig.studioFillDaysBefore} days before the reveal, we finish it with a studio fill that is clearly marked on the tile, so a mosaic always arrives on time.</p></div>
        <div className="box"><h2 style={{ fontSize: 22 }}>A person checks every tile</h2><p className="small muted">Nothing is placed until a reviewer accepts it. We also catch repeated uploads and slow down floods of submissions, so one person can’t crowd out everyone else.</p></div>
      </section>

      <section className="section" style={{ maxWidth: 760 }}>
        <h2 style={{ fontSize: 34 }}>Questions</h2>
        <dl style={{ margin: 0, display: "grid", gap: 22 }}>
          <div><dt className="serif" style={{ fontSize: 20 }}>Who owns my tile?</dt><dd className="small muted" style={{ margin: "6px 0 0" }}>You do. You give Tessera a licence to show, print and sell it as part of the mosaic. <span className="todo" style={{ display: "inline" }}>[TODO: needs lawyer review]</span></dd></div>
          <div><dt className="serif" style={{ fontSize: 20 }}>When do artists get paid?</dt><dd className="small muted" style={{ margin: "6px 0 0" }}>Shares are worked out {p.favouritesWindowDays} days after the reveal, held until {p.holdDays} days after it in case a tile is reported, then become available. Your first payout unlocks once {p.firstPayoutTiles} of your tiles have been accepted, and after that you can request a payout from {formatCents(p.payoutMinimumCents)}.</dd></div>
          <div><dt className="serif" style={{ fontSize: 20 }}>What if my tile is off colour?</dt><dd className="small muted" style={{ margin: "6px 0 0" }}>Close is fine. You can tint it gently to sit in its slot, and you see a preview before you send it.</dd></div>
          <div><dt className="serif" style={{ fontSize: 20 }}>Can I use any photo as the picture?</dt><dd className="small muted" style={{ margin: "6px 0 0" }}>Only one you own or have permission to use, and you must be 18 or older. <span className="todo" style={{ display: "inline" }}>[TODO: needs lawyer review]</span></dd></div>
        </dl>
      </section>

      <section className="section" id="policy" style={{ maxWidth: 760 }}>
        <h2 style={{ fontSize: 28 }}>Content policy</h2>
        <ul className="small" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
          <li>AI-generated images. Tiles must be made by people.</li>
          <li>Sexual content or nudity. Anything sexual involving minors is blocked and reported.</li>
          <li>Violence, gore, or promotion of self-harm.</li>
          <li>Hate symbols, slurs, or attacks on any group.</li>
          <li>Real people without their consent, harassment, or anyone’s personal details.</li>
          <li>Copyrighted characters and brand logos (except a customer’s own logo as the picture).</li>
          <li>Spam, links, QR codes, or disguised adverts.</li>
        </ul>
        <p className="small muted">Automatic checks only raise flags. A person makes every decision, and honest mistakes are corrected, not punished.</p>
      </section>

      <section className="section" id="terms" style={{ maxWidth: 760 }}>
        <h2 style={{ fontSize: 28 }}>Terms</h2>
        <p className="small muted">Read the <Link href="/terms">terms of sale and use</Link>, the <Link href="/privacy">privacy policy</Link> and <Link href="/refunds">refunds and cancellations</Link>. <span className="todo" style={{ display: "inline" }}>[TODO: needs lawyer review]</span> Contact: <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.</p>
      </section>
    </Page>
  );
}
