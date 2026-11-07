"use client";
/* eslint-disable @next/next/no-img-element -- static export with no image optimiser; these are pre-sized JPEGs in public/campaigns. */
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CAMPAIGNS, campaignAsset, campaignState, currentCampaign, formatDay, formatShortDay, lastOrderDay, urgency, type Campaign } from "@/config/campaigns";
import { mosaicConfig, tileCount } from "@/config/mosaic";
import { formatCents } from "@/lib/mosaic/ledger";
import { Page } from "./common";

/** The time the page loaded in the browser, or null while the static HTML is showing (so it hydrates cleanly). */
const loadedAt = typeof window === "undefined" ? 0 : Date.now();
const noSubscribe = () => () => {};
export function useNow(): number | null {
  return useSyncExternalStore(noSubscribe, () => loadedAt, () => null);
}

const price = (cents: number) => formatCents(cents).replace(".00", "");

/** One page per promotion: the same pictures, Reels, slides and dates as on Instagram. */
export function CampaignPage({ campaign: c }: { campaign: Campaign }) {
  const now = useNow();
  const closed = now !== null && campaignState(c, now) === "closed";
  const listHref = `/list?from=${c.id}`;
  const others = CAMPAIGNS.filter((o) => o.id !== c.id);

  return (
    <Page current="/occasions">
      <section className="cp-hero">
        <span className="eyebrow">{c.eyebrow}</span>
        <h1 className="cp-title">{c.title}</h1>
        <p className="lede cp-lede">{c.lede}</p>
        {(c.orderBy || c.revealOn) && (
          <div className="cp-dates" aria-label="Key dates">
            {c.orderBy && <span className={`cp-date${closed ? " cp-date--past" : ""}`}><b>Order by</b>{formatDay(c.orderBy)}</span>}
            {c.orderBy && lastOrderDay(c) !== c.orderBy && <span className={`cp-date${closed ? " cp-date--past" : ""}`}><b>Last orders</b>{formatDay(lastOrderDay(c)!)}</span>}
            {c.revealOn && <span className="cp-date"><b>Revealed</b>{formatDay(c.revealOn)}</span>}
          </div>
        )}
        {now !== null && urgency(c, now) && <Urgent c={c} now={now} />}
        {closed && <p className="cp-closed" role="status">Orders for {c.eyebrow} have closed. Join the list and we’ll tell you when the next one opens.</p>}
        <div className="row">
          <Link className="btn btn--primary" href={listHref}>Join the founding list</Link>
          {!closed && <Link className="btn" href={`/start?tier=${c.suggestedTier}`}>Start a mosaic</Link>}
        </div>
      </section>

      <figure className="cp-strip">
        <img src={campaignAsset(c, c.strips[0].src)} alt={c.strips[0].alt} width={1800} height={800} />
      </figure>

      <section className="section">
        <h2 className="cp-h2">How it works</h2>
        <ol className="cp-steps">
          {c.steps.map((s, i) => <li key={s.title}><span className="cp-num">{i + 1}</span><h3>{s.title}</h3><p className="small muted">{s.text}</p></li>)}
        </ol>
      </section>

      <WhyDigital campaign={c} />

      <section className="section">
        <div className="split"><h2 className="cp-h2">Watch</h2><span className="small muted">Sound on</span></div>
        <div className="cp-reels">
          {c.reels.map((r) => (
            <figure key={r.src} className="cp-reel">
              <video src={campaignAsset(c, r.src)} poster={campaignAsset(c, r.poster)} controls playsInline preload="none" aria-label={r.title} />
              <figcaption className="small muted">{r.title}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="split"><h2 className="cp-h2">From our Instagram</h2><a className="small" href="https://www.instagram.com/tessera.mosaics/" target="_blank" rel="noreferrer">@tessera.mosaics</a></div>
        {c.posts.map((p) => (
          <div key={p.title} className="cp-post">
            <h3 className="cp-post__title">{p.title} <span className="faint small">{p.slides.length} {p.slides.length === 1 ? "slide" : "slides"}</span></h3>
            <div className="cp-slides" tabIndex={0} aria-label={`${p.title}, swipe for more`}>
              {p.slides.map((s, i) => <img key={s} src={campaignAsset(c, s)} alt={`${p.title}, slide ${i + 1} of ${p.slides.length}`} width={720} height={960} loading="lazy" />)}
            </div>
          </div>
        ))}
        {c.strips.length > 1 && (
          <figure className="cp-strip cp-strip--small">
            <img src={campaignAsset(c, c.strips[1].src)} alt={c.strips[1].alt} width={1800} height={800} loading="lazy" />
          </figure>
        )}
      </section>

      <section className="section">
        <div className="split"><h2 className="cp-h2">Sizes</h2><p className="small muted">The people painting never pay.</p></div>
        <div className="tiers">
          {mosaicConfig.tiers.map((t) => (
            <article key={t.id} className={`tier${t.id === c.suggestedTier ? " tier--on" : ""}`}>
              <div className="split"><h3 style={{ fontSize: 24 }}>{t.name}</h3>{t.id === c.suggestedTier && <span className="eyebrow">For {c.name.toLowerCase()}</span>}</div>
              <div className="serif" style={{ fontSize: 40 }}>{price(t.priceCents)}</div>
              <div className="small muted">{tileCount(t).toLocaleString("en")} squares · {t.fits}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="cp-h2">Questions</h2>
        <div className="cp-faq">
          {c.faqs.map((f) => <details key={f.q}><summary>{f.q}</summary><p className="muted">{f.a}</p></details>)}
        </div>
      </section>

      <section className="section cp-end">
        <h2 className="cp-title" style={{ fontSize: "clamp(32px, 5vw, 48px)" }}>{c.orderBy && !closed ? `Order by ${formatShortDay(c.orderBy)}.` : c.title}</h2>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link className="btn btn--primary" href={listHref}>Join the founding list</Link>
          {!closed && <Link className="btn" href={`/start?tier=${c.suggestedTier}`}>Start a mosaic</Link>}
        </div>
        <p className="faint small">Sample photos: {c.credits.join(" · ")}</p>
        <nav className="row small" aria-label="Other occasions" style={{ justifyContent: "center" }}>
          {others.map((o) => <Link key={o.id} href={o.href}>{o.name}</Link>)}
          <Link href="/occasions">All occasions</Link>
        </nav>
      </section>
    </Page>
  );
}

const lastLabel = (n: number) => (n <= 0 ? "Last orders today" : n === 1 ? "Last orders tomorrow" : `Last orders in ${n} days`);

/** The honest countdown: every day you wait is a day less for everyone to paint. */
function Urgent({ c, now }: { c: Campaign; now: number }) {
  const u = urgency(c, now)!;
  return (
    <>
      <p className="cp-urgent" role="status"><b>Order today and everyone gets {u.paint} days to paint.</b> Every day you wait is a day less, and our studio paints more of it. {lastLabel(u.last)}.</p>
      <div className="cp-sticky"><span><b>{u.paint} days</b> of painting left</span><Link className="btn btn--primary" href={`/start?tier=${c.suggestedTier}`}>Start yours</Link></div>
    </>
  );
}

/** Every occasion, with its strip, as one index page. */
export function OccasionsPage() {
  const now = useNow();
  return (
    <Page current="/occasions">
      <section className="cp-hero">
        <span className="eyebrow">Occasions</span>
        <h1 className="cp-title">One photo. Everyone paints a square.</h1>
        <p className="lede cp-lede">Nobody sees the picture until the reveal. Pick the moment it’s for.</p>
      </section>
      <div className="cp-list">
        {CAMPAIGNS.map((c) => {
          const closed = now !== null && campaignState(c, now) === "closed";
          return (
            <Link key={c.id} href={c.href} className="cp-card">
              <img src={campaignAsset(c, c.strips[0].src)} alt="" width={1800} height={800} loading="lazy" />
              <div className="cp-card__body">
                <span className="eyebrow">{c.eyebrow}</span>
                <h2>{c.title}</h2>
                <span className="small muted">{c.orderBy ? (closed ? "Orders closed. Join the list for next time." : `Order by ${formatShortDay(c.orderBy)}`) : "Any time of year"}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </Page>
  );
}

/** A slim promotion at the top of the home page while a dated campaign is open. */
export function CampaignBanner() {
  const now = useNow();
  const c = now === null ? null : currentCampaign(now);
  if (!c || now === null) return null;
  const u = urgency(c, now);
  return (
    <Link href={c.href} className="cp-banner">
      <img src={campaignAsset(c, c.strips[0].src)} alt="" width={1800} height={800} />
      <span><b>{c.name}:</b> {u ? <>order today and everyone gets <b>{u.paint} days</b> to paint. {lastLabel(u.last)}.</> : <>order by {formatShortDay(c.orderBy!)}, revealed {formatShortDay(c.revealOn!)}.</>}</span>
      <span className="cp-banner__go">Start yours ›</span>
    </Link>
  );
}

/** Why a digital mosaic: the reasons it suits gifts better than something in the post. */
export function WhyDigital({ campaign }: { campaign?: Campaign }) {
  const day = campaign?.revealOn ? `on ${formatShortDay(campaign.revealOn)}` : "on the day you choose";
  const points = [
    { t: "Arrives on the day", d: `Nothing to post, nothing to wrap. It’s revealed ${day}, wherever they live.` },
    { t: "Painted from anywhere", d: "One link works on any phone. Family abroad and friends in other cities all add their square." },
    { t: "Kept for good", d: "Zoom into any square, share the reveal video in one tap, and keep the link for years." },
    { t: "Never too late", d: campaign?.orderBy ? `Order by ${formatShortDay(campaign.orderBy)} for three weeks of painting. Last orders ${formatShortDay(lastOrderDay(campaign)!)}.` : "Order three weeks ahead for the most squares, or as little as a week before." },
  ];
  return (
    <section className="section">
      <h2 className="cp-h2">Why a digital mosaic</h2>
      <ol className="cp-steps cp-why">{points.map((p) => <li key={p.t}><h3>{p.t}</h3><p className="small muted">{p.d}</p></li>)}</ol>
    </section>
  );
}

/** Small cards linking every occasion, for the bottom of the home page. */
export function OccasionCards() {
  return (
    <section className="section">
      <div className="split"><h2 style={{ fontSize: 40 }}>For every occasion</h2><Link className="small" href="/occasions">See all</Link></div>
      <div className="cp-list cp-list--row">
        {CAMPAIGNS.map((c) => (
          <Link key={c.id} href={c.href} className="cp-card">
            <img src={campaignAsset(c, c.strips[0].src)} alt="" width={1800} height={800} loading="lazy" />
            <div className="cp-card__body"><span className="eyebrow">{c.eyebrow}</span><h3>{c.title}</h3></div>
          </Link>
        ))}
      </div>
    </section>
  );
}
