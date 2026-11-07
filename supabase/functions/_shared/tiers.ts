/**
 * The sizes and prices customers can buy, and the order rules the server enforces.
 * This one file is read by the website (src/config/mosaic.ts) and by the orders function,
 * so what a customer sees is always what they are charged. Money is whole cents (or pence).
 */

export interface MosaicTier {
  id: "small" | "medium" | "large" | "grand";
  name: string;
  /** Grid size. Tiles = cols × rows. */
  cols: number;
  rows: number;
  priceCents: number;
  fits: string;
}

/**
 * 10,000 tiles is the minimum: real photos (faces especially) only read clearly from there.
 * See docs/research for the comparison. Faces become recognisable from about 20,000 tiles; the gain flattens past 30,000.
 */
export const TIERS: MosaicTier[] = [
  { id: "small", name: "Small", cols: 100, rows: 100, priceCents: 4500, fits: "Landscapes, pets and silhouettes" },
  { id: "medium", name: "Medium", cols: 142, rows: 142, priceCents: 9500, fits: "One or two faces you can recognise" },
  { id: "large", name: "Large", cols: 174, rows: 174, priceCents: 14500, fits: "Group photos and sharp faces" },
  { id: "grand", name: "Grand", cols: 200, rows: 200, priceCents: 19500, fits: "Big groups and large prints" },
];

export const ORDER_RULES = {
  /** Lower-case ISO currency code charged by Stripe. */
  currency: "usd",
  /** Shortest reveal date a customer can pick, in days from now. */
  minRevealDays: 7,
  /** Furthest reveal date, in days from now. */
  maxRevealDays: 366,
  /** Share of each order set aside for public artists, in basis points (3000 = 30%). */
  poolShareBps: 3000,
};

/**
 * Discount codes. Public codes, shared on Instagram and with the founding list. The server applies them,
 * so the price shown is the price charged, and each one stops working at the end of its last day (UK time).
 * Word them as an offer ("15% off your first mosaic"), never as a "was" price that was never charged.
 */
export interface PromoCode { code: string; percentOff: number; endsOn: string; label: string }
export const PROMO_CODES: PromoCode[] = [
  { code: "FOUNDING15", percentOff: 15, endsOn: "2026-12-31", label: "Founding offer: 15% off" },
  { code: "EARLYBIRD", percentOff: 10, endsOn: "2026-11-22", label: "Early-bird Christmas offer: 10% off" },
];

/** The price after a code, or a message saying why the code doesn't apply. An empty code is no code. */
export function applyPromo(priceCents: number, raw: string | null | undefined, now: number):
  { priceCents: number; code: string | null; percentOff: number; label: string | null } | { error: string } {
  const code = String(raw ?? "").trim().toUpperCase();
  if (!code) return { priceCents, code: null, percentOff: 0, label: null };
  const p = PROMO_CODES.find((x) => x.code === code);
  if (!p) return { error: "That code isn’t recognised. Check the spelling and try again." };
  // End of the last day in London. UK clocks are on GMT in winter and BST in summer, so allow for both.
  const ends = Date.parse(`${p.endsOn}T23:59:59Z`) - (isBst(p.endsOn) ? 3600_000 : 0);
  if (now > ends) return { error: `${p.code} ended on ${new Date(`${p.endsOn}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}.` };
  return { priceCents: Math.round(priceCents * (100 - p.percentOff) / 100), code: p.code, percentOff: p.percentOff, label: p.label };
}

/** British Summer Time runs from the last Sunday in March to the last Sunday in October. */
function isBst(day: string): boolean {
  const d = new Date(`${day}T12:00:00Z`), y = d.getUTCFullYear();
  const lastSunday = (m: number) => { const x = new Date(Date.UTC(y, m + 1, 0)); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x; };
  return d >= lastSunday(2) && d < lastSunday(9);
}

export function findTier(id: string): MosaicTier | undefined {
  return TIERS.find((t) => t.id === id);
}

/** Artist pool and payout rules, used by the money function and shown on the site. */
export const POOL_RULES = {
  /** Each artist can place at most max(minCap, capPercent of the mosaic's tiles) tiles in one mosaic. Keep in step with the settings table. */
  minCap: 10,
  capPercent: 3,
  /** After the reveal the customer has this many days to favourite tiles. The split runs after. */
  favouritesWindowDays: 7,
  favouritesMax: 5,
  /** A favourited tile counts as this many tiles in the split. */
  favouriteMultiplier: 2,
  /** Earnings stay pending this many days after the reveal, for reports and removed tiles. */
  holdDays: 14,
  /** Smallest payout an artist can request, in cents. */
  payoutMinimumCents: 1000,
  /** Accepted tiles an artist needs before their first payout. */
  firstPayoutTiles: 20,
  /** Slots still empty this many days before the reveal are filled and clearly labelled. */
  studioFillDaysBefore: 2,
  /** Unpaid orders are cancelled after this many hours. */
  unpaidOrderHours: 48,
};

export function artistCapFor(totalTiles: number): number {
  return Math.max(POOL_RULES.minCap, Math.floor((totalTiles * POOL_RULES.capPercent) / 100));
}
