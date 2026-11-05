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
