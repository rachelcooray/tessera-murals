/**
 * Seasonal and occasion campaigns. Every promotion on Instagram gets a matching page here,
 * so "link in bio" always lands on the same story, dates and pictures people just saw.
 *
 * Images and Reels live in public/campaigns/<id>/. Dates are UK dates (YYYY-MM-DD).
 * Prices are never written here: the pages read them from the live tiers, so they always match checkout.
 */
export interface CampaignPost {
  /** What the Instagram post was about, shown under it. */
  title: string;
  /** Slide image files in public/campaigns/<id>/, cover first. */
  slides: string[];
}

export interface Campaign {
  id: "christmas" | "weddings" | "valentines";
  /** The page address, e.g. /christmas/ */
  href: string;
  name: string;
  eyebrow: string;
  title: string;
  lede: string;
  /** Last day to order for the reveal date. Omit for an occasion that runs all year. */
  orderBy?: string;
  /** The reveal date everyone works towards. Omit when the buyer picks it. */
  revealOn?: string;
  /** When the home page starts promoting it. */
  promoteFrom?: string;
  /** The size we suggest for this occasion. */
  suggestedTier: string;
  steps: { title: string; text: string }[];
  /** Strip images (the joined-up Instagram rows), widest first. */
  strips: { src: string; alt: string }[];
  reels: { src: string; poster: string; title: string }[];
  posts: CampaignPost[];
  faqs: { q: string; a: string }[];
  /** Photo credits for the sample pictures used. */
  credits: string[];
}

const slides = (post: number, count: number) => Array.from({ length: count }, (_, i) => `post${post}-${i + 1}.jpg`);

const COMMON_FAQS = [
  { q: "Do people need an app?", a: "No. Everyone gets one link that opens on any phone or computer." },
  { q: "Do they need to be good at art?", a: "No. Any mark in their colour works: a heart, a scribble, their initials. It takes about a minute." },
  { q: "Can they see the picture?", a: "No. Each person only sees their own colour. Nobody sees the whole picture until the reveal." },
  { q: "What if people don't paint many squares?", a: "The Tessera studio paints every square that's left before the reveal, so your mosaic is always finished on time. Studio squares are marked as studio squares." },
  { q: "Do the people painting pay?", a: "Never. Only the person who orders pays." },
];

export const CAMPAIGNS: Campaign[] = [
  {
    id: "christmas",
    href: "/christmas",
    name: "Christmas",
    eyebrow: "Christmas 2026",
    title: "A Christmas gift the whole family paints together.",
    lede: "Send one family photo. Everyone gets a link and one colour, and paints a square without ever seeing the picture. On Christmas morning, it all comes together.",
    orderBy: "2026-12-04",
    revealOn: "2026-12-25",
    promoteFrom: "2026-11-01",
    suggestedTier: "medium",
    steps: [
      { title: "Upload one family photo", text: "Pick a size and set the reveal for Christmas morning." },
      { title: "Share one link", text: "Grandparents, cousins abroad, the kids. Each person gets one colour. That's all they see." },
      { title: "Everyone paints", text: "Three weeks of squares from wherever your people are. The Tessera studio finishes the rest." },
      { title: "Christmas morning", text: "Everyone sees the picture at once, with a reveal video to share." },
    ],
    strips: [
      { src: "strip1.jpg", alt: "A Christmas tree by the fireplace, made of painted squares" },
      { src: "strip2.jpg", alt: "Red, green and gold Christmas baubles, made of painted squares" },
    ],
    reels: [
      { src: "reel1.mp4", poster: "reel1.jpg", title: "Everyone paints one square" },
      { src: "reel2.mp4", poster: "reel2.jpg", title: "This square could be yours" },
    ],
    posts: [
      { title: "How it works", slides: slides(1, 5) },
      { title: "Order by 4 December", slides: slides(2, 2) },
      { title: "Who it's for", slides: slides(4, 6) },
      { title: "What happens next", slides: slides(5, 2) },
    ],
    faqs: [
      { q: "When do I need to order?", a: "By 4 December. That gives everyone three weeks to paint before the reveal on 25 December." },
      ...COMMON_FAQS,
    ],
    credits: ["Tree by the Fireplace: Mike Cox / Unsplash", "Baubles: Eric Prouzet / Unsplash"],
  },
  {
    id: "weddings",
    href: "/weddings",
    name: "Weddings",
    eyebrow: "Weddings",
    title: "The guest book every guest paints.",
    lede: "Instead of signing a book, every guest paints one square of a photo you choose. Nobody sees the picture until the day you pick: the morning after, the end of the honeymoon, or your first anniversary.",
    suggestedTier: "large",
    steps: [
      { title: "Choose a photo", text: "An engagement photo, the venue, somewhere that matters to you both. Pick any reveal date up to a year away." },
      { title: "Share one link", text: "In the group chat, on your wedding website, or in a speech. Guests open it on their phones." },
      { title: "Guests paint", text: "Each guest gets one colour and paints a square. The Tessera studio finishes the rest before the reveal." },
      { title: "The reveal", text: "Everyone sees it at once, and you get a video to send to every guest." },
    ],
    strips: [{ src: "strip1.jpg", alt: "Cherry blossom trees by a lake, made of painted squares" }],
    reels: [{ src: "reel1.mp4", poster: "reel1.jpg", title: "One guest. One square." }],
    posts: [
      { title: "How it works", slides: slides(1, 5) },
      { title: "Guest questions", slides: slides(2, 3) },
    ],
    faqs: [
      { q: "When is the reveal?", a: "Whenever you choose, from a week to a year after you order. Lots of couples pick their first anniversary." },
      ...COMMON_FAQS,
    ],
    credits: ["Blossoms by the Lake: Mark Tegethoff / Unsplash"],
  },
  {
    id: "valentines",
    href: "/valentines",
    name: "Valentine's Day",
    eyebrow: "Valentine's Day 2027",
    title: "A love letter from everyone who loves you.",
    lede: "One photo of the two of you. Friends and family each paint a square, without ever seeing the picture. Your person sees it all at once on Valentine's morning.",
    orderBy: "2027-01-24",
    revealOn: "2027-02-14",
    promoteFrom: "2026-12-26",
    suggestedTier: "small",
    steps: [
      { title: "Upload a photo of you both", text: "Pick a size. The reveal is set for 14 February." },
      { title: "Share one link", text: "Send it to friends and family, quietly. Your person never sees it." },
      { title: "Everyone paints", text: "Three weeks of squares. The Tessera studio finishes the rest." },
      { title: "Valentine's morning", text: "They see the whole picture at once, with a reveal video to keep." },
    ],
    strips: [{ src: "strip1.jpg", alt: "Red tulips against a blue sky, made of painted squares" }],
    reels: [{ src: "reel1.mp4", poster: "reel1.jpg", title: "Everyone who loves you paints a square" }],
    posts: [
      { title: "A love letter", slides: slides(1, 5) },
      { title: "Order by 24 January", slides: slides(2, 2) },
    ],
    faqs: [
      { q: "When do I need to order?", a: "By 24 January. That gives everyone three weeks to paint before the reveal on Sunday 14 February." },
      ...COMMON_FAQS,
    ],
    credits: ["Red Tulips: Aaron Burden / Unsplash"],
  },
];

export const campaignById = (id: Campaign["id"]) => CAMPAIGNS.find((c) => c.id === id)!;

/** A file in public/campaigns, with the site's base path in front (GitHub Pages serves the site from a folder). */
export const campaignAsset = (c: Campaign, file: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/campaigns/${c.id}/${file}`;

/** End of the order-by day, UK time (close enough to treat as 23:59 London). */
const endOfDay = (d: string) => Date.parse(`${d}T23:59:59Z`);

/** "open" until the order-by date passes, then "closed". Occasions without a date are always open. */
export function campaignState(c: Campaign, now: number): "open" | "closed" {
  return c.orderBy && now > endOfDay(c.orderBy) ? "closed" : "open";
}

/** The dated campaign to promote right now, if any: promotion has started and orders haven't closed. */
export function currentCampaign(now: number): Campaign | null {
  return CAMPAIGNS.find((c) => c.orderBy && c.promoteFrom && now >= Date.parse(`${c.promoteFrom}T00:00:00Z`) && campaignState(c, now) === "open") ?? null;
}

export const formatDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
export const formatShortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
