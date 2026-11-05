"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { mosaicConfig } from "@/config/mosaic";
import { site } from "@/config/site";
import { Page, Todo } from "../mosaic/common";

const UPDATED = "5 November 2026";

function Doc({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <Page narrow>
      <article className="legal">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p className="small faint">Last updated {UPDATED}. <Todo>[TODO: needs lawyer review before launch]</Todo></p>
        {children}
        <p className="small muted" style={{ marginTop: 32 }}>Questions? <Link href="/contact">Contact us</Link>.</p>
      </article>
    </Page>
  );
}

const Mail = () => <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>;

export function Contact() {
  const b = site.business;
  return (
    <Doc eyebrow="Contact" title="Talk to us">
      <p>The quickest way to reach us is email: <Mail />. We reply within two working days, usually sooner.</p>
      <h2>Who we are</h2>
      <p>Tessera is run by {b.legalName}.<br />{b.address}<br />{b.country}</p>
      {b.vatRegistered && <p>VAT number: {b.vatNumber}</p>}
      <h2>Something wrong with a tile or a mosaic?</h2>
      <p>Email us with the link to the mosaic or the tile page. If a tile breaks our <Link href="/about#policy">content policy</Link>, we take it down while we look at it.</p>
      <h2>Your data</h2>
      <p>To see, correct or delete what we hold about you, email us. See the <Link href="/privacy">privacy policy</Link>.</p>
    </Doc>
  );
}

export function Refunds() {
  return (
    <Doc eyebrow="Refunds and cancellations" title="Changing your mind">
      <p>A Tessera mosaic is made for you, by the people you invite, over the weeks before your reveal date. Here is what happens if you cancel or something goes wrong.</p>
      <h2>Before anyone paints</h2>
      <p>If you cancel within 14 days of paying and no tile has been sent to your mosaic yet, we refund you in full. Email <Mail /> with your order email.</p>
      <h2>Once painting has started</h2>
      <p>When you share your invite link, you’re asking us to start straight away, during those 14 days. If you then cancel within the 14 days, we refund the price minus a fair amount for the work already done: the share of squares already painted and reviewed. After 14 days the order can’t be cancelled, because the work is under way.</p>
      <h2>If something goes wrong on our side</h2>
      <p>We promise your reveal happens on the date you chose. If it doesn’t, or the finished mosaic is faulty, tell us within 30 days of the reveal. We’ll fix it, or refund you if we can’t. This doesn’t affect your legal rights.</p>
      <h2>Contributors</h2>
      <p>People you invite never pay, so there is nothing to refund for them.</p>
      <h2>How refunds are paid</h2>
      <p>Refunds go back to the card you paid with, within 14 days of us agreeing them. Your bank may take a few more days to show it.</p>
    </Doc>
  );
}

export function Terms() {
  const b = site.business;
  const pool = mosaicConfig.pool;
  return (
    <Doc eyebrow="Terms" title="Terms of sale and use">
      <h2>1. Who we are</h2>
      <p>Tessera (“we”) is run by {b.legalName}, {b.address}, {b.country}. Contact: <Mail />. {b.vatRegistered ? `VAT number ${b.vatNumber}.` : "We are not VAT registered, so prices include no VAT."}</p>
      <h2>2. What you buy</h2>
      <p>A hidden mosaic: we turn your photo into a grid of colour slots, the people you invite (and, if you allow it, Tessera artists) each paint a square in its colour, and the finished picture is revealed on the date you choose. You get the finished mosaic online, a reveal video and a link to every square. Prints are extra, if offered at checkout.</p>
      <p>The sizes, prices and number of squares are shown before you pay. The price you see is the price you pay.</p>
      <h2>3. Your order</h2>
      <p>Your order is accepted when payment goes through and we show your mosaic’s page. You must be 18 or over, and you must own the photo or have permission from the people in it and whoever took it.</p>
      <h2>4. Painting, review and the reveal</h2>
      <p>Every tile is checked by a person before it’s placed. We remove tiles that break our <Link href="/about#policy">content policy</Link>, including anything made with AI image tools. If squares are still open {mosaicConfig.studioFillDaysBefore} days before your date, Tessera finishes them so your reveal happens on time, and they are marked in the finished mosaic.</p>
      <p>Before the reveal only you can see the picture. Guests see only the colour of their own square. After the reveal your mosaic is public or private, as you chose: private ones can be seen by anyone you give the link to.</p>
      <h2>5. Cancelling</h2>
      <p>See <Link href="/refunds">refunds and cancellations</Link>. Your legal rights as a consumer are not affected.</p>
      <h2>6. Tiles and who owns them</h2>
      <p>Everyone who sends a tile keeps the rights to it, and gives Tessera a worldwide, permanent licence to show, print and sell it as part of that mosaic, and to show it in Tessera’s own promotion. You can use your finished mosaic for any personal purpose.</p>
      <h2>7. Tessera artists</h2>
      <p>{pool.shareBps / 100}% of each mosaic’s price goes into an artist pool, shared between the public artists whose tiles are accepted, a week after the reveal. Earnings are held for {pool.holdDays} days, can be requested once you have {pool.firstPayoutTiles} accepted tiles and at least ${(pool.payoutMinimumCents / 100).toFixed(2)} available, and are paid by bank transfer or PayPal. Artists are responsible for their own tax.</p>
      <h2>8. Things you mustn’t do</h2>
      <p>Don’t upload photos you have no right to use, try to see a picture before its reveal, send tiles made with AI image tools, or misuse invite links. We may close accounts or remove mosaics that break these terms, refunding anything owed.</p>
      <h2>9. Our responsibility</h2>
      <p>We take reasonable care and skill. We aren’t responsible for losses we couldn’t have foreseen, or for problems caused by events outside our control. Nothing here limits liability where the law says it can’t be limited.</p>
      <h2>10. The law</h2>
      <p>These terms are governed by the law of England and Wales. If you live elsewhere in the UK, you can also bring a claim in your local courts.</p>
    </Doc>
  );
}

export function Privacy() {
  const b = site.business;
  return (
    <Doc eyebrow="Privacy" title="Privacy policy">
      <p>{b.legalName} (“Tessera”, “we”) is the controller of the personal data described here. Contact: <Mail />, {b.address}, {b.country}.</p>
      <h2>What we collect</h2>
      <ul>
        <li><b>Buyers:</b> your email, the photo you upload, the mosaic’s details, and payment status. Card details go straight to Stripe; we never see or store them.</li>
        <li><b>Contributors:</b> the tiles you send, the name you choose to be credited with (or Anonymous), and a summary of how you painted (number of strokes and time, plus eight small timelapse frames if you paint on Tessera). We don’t ask for your email to paint.</li>
        <li><b>Artists:</b> your artist name, portfolio link if you add one, payout name and country, and your earnings.</li>
        <li><b>Founding list:</b> your email, and your first name and occasion if you give them.</li>
        <li><b>Everyone:</b> a sign-in token kept in your browser so the site knows it’s you, and paint drafts saved on your own device.</li>
      </ul>
      <h2>Why, and on what basis</h2>
      <ul>
        <li>To make and deliver your mosaic and take payment: performing our contract with you.</li>
        <li>To review tiles, stop abuse and keep records for tax: our legitimate interests and legal obligations.</li>
        <li>To email the founding list: your consent, which you can withdraw at any time.</li>
      </ul>
      <h2>Who else handles it</h2>
      <p>We use Supabase (database and file storage, hosted in London), Stripe (payments), Resend (email) and GitHub (hosting the website). They process data only on our instructions. We don’t sell your data or use advertising trackers.</p>
      <h2>How long we keep it</h2>
      <p>Mosaics, their photo and tiles stay for as long as the mosaic is online, so the reveal and tile links keep working. Ask us and we’ll delete yours. Payment and payout records are kept for 6 years for tax. Founding list emails are deleted when you unsubscribe.</p>
      <h2>Your rights</h2>
      <p>You can ask to see, correct, delete or move your data, or object to how we use it. Email <Mail />. If you’re unhappy with our answer, you can complain to the Information Commissioner’s Office (ico.org.uk).</p>
      <h2>Cookies and storage</h2>
      <p>We store your sign-in and paint drafts in your browser so the site works. We don’t use analytics or advertising cookies.</p>
    </Doc>
  );
}
