/**
 * Every setting for commissioned hidden mosaics, in one place.
 * Money is always whole cents. Change a number here and the whole site follows.
 * The payments server keeps its own copy of the tier prices (MOSAIC_TIERS), because that is what actually charges.
 */

export interface MosaicTier {
  id: "small" | "medium" | "large";
  name: string;
  /** Grid size. Tiles = cols × rows. */
  cols: number;
  rows: number;
  priceCents: number;
  fits: string;
}

export const mosaicConfig = {
  /**
   * Sizes customers can buy. 10,000 tiles is the minimum: real photos (faces especially) only read clearly from there.
   * See docs/research for the comparison. Prices are placeholders: decide them with the artist pool in mind.
   */
  tiers: [
    { id: "small", name: "Small", cols: 100, rows: 100, priceCents: 4900, fits: "A family, a birthday or a small team" },
    { id: "medium", name: "Medium", cols: 150, rows: 150, priceCents: 14900, fits: "A wedding or a big anniversary" },
    { id: "large", name: "Large", cols: 200, rows: 200, priceCents: 29900, fits: "A company or a community" },
  ] as MosaicTier[],

  /** Reveal date options offered at checkout, in days from today. */
  revealOptionsDays: [21, 42],
  /** Shortest reveal date a customer can pick by hand. */
  minRevealDays: 7,

  /** How long a claimed slot is held for one contributor before it is offered to someone else. */
  slotHoldHours: 48,

  /** Tint: how strongly an upload is pulled toward its slot colour. 0 = untouched, 1 = flat colour. */
  tint: { default: 0.35, max: 0.6 },
  /** Below this colour match (0 to 1) a tile is flagged for the reviewer. */
  minColourMatch: 0.55,

  /** Studio fill: slots still empty this many days before the reveal are filled and clearly labelled. */
  studioFillDaysBefore: 2,

  /** Contributed art must be made by people. AI-generated uploads are rejected. */
  humanMadeOnly: true,

  /** Duplicate and spam checks. */
  moderation: {
    /** Two uploads from the same person closer than this (perceptual hash bits, out of 64) count as near-identical. */
    duplicateHammingMax: 6,
    /** Submissions per contributor per rolling hour. */
    submissionsPerHour: 20,
  },

  /** Artist pool: the share of each order paid to public artists, split by accepted tiles. */
  pool: {
    /** Share of the order price set aside for public artists, in basis points (3000 = 30%). */
    shareBps: 3000,
    /** Each artist can place at most max(minCap, capPercent of the mosaic's tiles) tiles in one mosaic. */
    minCap: 10,
    capPercent: 3,
    /** After the reveal the customer has this many days to favourite tiles. The split runs after. */
    favouritesWindowDays: 7,
    /** How many tiles a customer can favourite. */
    favouritesMax: 5,
    /** A favourited tile counts as this many tiles in the split. */
    favouriteMultiplier: 2,
    /** Earnings stay pending this many days after the reveal, for reports and removed tiles. */
    holdDays: 14,
    /** Smallest payout an artist can request, in cents. Smaller balances roll over. */
    payoutMinimumCents: 1000,
    /** Accepted tiles an artist needs before their first payout. Earnings build up from the first tile. */
    firstPayoutTiles: 20,
  },

  /**
   * Voice clips from the season wall. Off for mosaics. The recorder and player code is kept
   * (src/components/Recorder.tsx, VoicePlayer.tsx) so it can return as an add-on for private group boards.
   */
  features: { voiceClips: false },

  /** The in-browser paint tool. */
  paint: {
    /** Working canvas size in pixels. The saved tile is downscaled to storage.tilePx until Phase 2 adds server storage. */
    canvasPx: 1024,
    maxLayers: 10,
    undoSteps: 40,
    /** A painted tile with fewer strokes or less time than this is flagged for the reviewer. */
    minStrokes: 5,
    minSeconds: 20,
  },

  /** Image sizes kept in the browser while there is no server storage. */
  storage: { targetPx: 400, tilePx: 128, jpegQuality: 0.78 },
} as const;

export function tierById(id: string): MosaicTier {
  return mosaicConfig.tiers.find((t) => t.id === id) ?? mosaicConfig.tiers[1];
}

export function tileCount(t: Pick<MosaicTier, "cols" | "rows">): number {
  return t.cols * t.rows;
}

/** Most tiles one artist may place in a mosaic of this size. */
export function artistCap(totalTiles: number): number {
  return Math.max(mosaicConfig.pool.minCap, Math.floor((totalTiles * mosaicConfig.pool.capPercent) / 100));
}
