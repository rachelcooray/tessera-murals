/**
 * Every setting for commissioned hidden mosaics, in one place.
 * Money is always whole cents. Change a number here and the whole site follows.
 * Tier prices and order rules come from supabase/functions/_shared/tiers.ts, which the server charges from.
 */

import { ORDER_RULES, POOL_RULES, TIERS, artistCapFor, type MosaicTier } from "../../supabase/functions/_shared/tiers.ts";
export { PROMO_CODES, applyPromo, type PromoCode } from "../../supabase/functions/_shared/tiers.ts";

export type { MosaicTier };

export const mosaicConfig = {
  /** Sizes customers can buy. Defined in supabase/functions/_shared/tiers.ts, shared with the server that charges. */
  tiers: TIERS,

  /** Reveal date options offered at checkout, in days from today. */
  revealOptionsDays: [21, 42],
  /** Shortest reveal date a customer can pick by hand. */
  minRevealDays: ORDER_RULES.minRevealDays,

  /** How long a claimed slot is held for one contributor before it is offered to someone else. */
  slotHoldHours: 48,

  /** Tint: how strongly an upload is pulled toward its slot colour. 0 = untouched, 1 = flat colour. */
  tint: { default: 0.35, max: 0.6 },
  /** Below this colour match (0 to 1) a tile is flagged for the reviewer. */
  minColourMatch: 0.55,

  /** Studio fill: slots still empty this many days before the reveal are filled and clearly labelled. */
  studioFillDaysBefore: POOL_RULES.studioFillDaysBefore,

  /** Contributed art must be made by people. AI-generated uploads are rejected. */
  humanMadeOnly: true,

  /** Duplicate and spam checks. */
  moderation: {
    /** Two uploads from the same person closer than this (perceptual hash bits, out of 64) count as near-identical. */
    duplicateHammingMax: 6,
    /** Submissions per contributor per rolling hour. */
    submissionsPerHour: 20,
  },

  /** Artist pool: the share of each order paid to public artists, split by accepted tiles. Rules live in _shared/tiers.ts. */
  pool: { shareBps: ORDER_RULES.poolShareBps, ...POOL_RULES },


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
export const artistCap = artistCapFor;
