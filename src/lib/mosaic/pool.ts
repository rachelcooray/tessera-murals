/**
 * The artist pool. A share of each order is set aside for public artists and split by accepted tiles
 * when the mosaic is revealed. All money is integer cents; shares round down and the leftover cents
 * go to Tessera.
 */

export interface Contribution {
  artistId: string;
  /** Accepted public-artist tiles in this mosaic. */
  tiles: number;
  /** How many of those tiles the customer favourited. */
  favourites: number;
}

export interface Allocation {
  artistId: string;
  /** Tiles that counted, after the per-artist cap. */
  tilesCounted: number;
  favouritesCounted: number;
  /** tilesCounted plus the favourite bonus. */
  weight: number;
  amountCents: number;
}

export interface Split {
  poolCents: number;
  allocations: Allocation[];
  /** Cents that go to Tessera revenue: rounding leftovers, or the whole pool when no public artist took part. */
  toRevenueCents: number;
}

/** The pool for an order, rounded down. shareBps 3000 = 30%. */
export function poolFor(orderCents: number, shareBps: number): number {
  if (!Number.isInteger(orderCents) || orderCents < 0) throw new Error("orderCents must be whole cents");
  return Math.floor((orderCents * shareBps) / 10000);
}

/**
 * Splits poolCents between artists in proportion to their weight:
 * weight = min(tiles, cap) + favourites × (multiplier − 1), with favourites limited to counted tiles.
 */
export function splitPool(poolCents: number, contributions: Contribution[], opts: { cap: number; favouriteMultiplier: number }): Split {
  if (!Number.isInteger(poolCents) || poolCents < 0) throw new Error("poolCents must be whole cents");
  const bonus = Math.max(0, opts.favouriteMultiplier - 1);
  const merged = new Map<string, Contribution>();
  for (const c of contributions) {
    const prev = merged.get(c.artistId) ?? { artistId: c.artistId, tiles: 0, favourites: 0 };
    merged.set(c.artistId, { artistId: c.artistId, tiles: prev.tiles + Math.max(0, c.tiles), favourites: prev.favourites + Math.max(0, c.favourites) });
  }
  const rows = [...merged.values()]
    .map((c) => {
      const tilesCounted = Math.min(c.tiles, Math.max(0, opts.cap));
      const favouritesCounted = Math.min(c.favourites, tilesCounted);
      return { artistId: c.artistId, tilesCounted, favouritesCounted, weight: tilesCounted + favouritesCounted * bonus };
    })
    .filter((r) => r.weight > 0)
    .sort((a, b) => (a.artistId < b.artistId ? -1 : 1));

  const total = rows.reduce((s, r) => s + r.weight, 0);
  if (total === 0) return { poolCents, allocations: [], toRevenueCents: poolCents };

  const allocations = rows.map((r) => ({ ...r, amountCents: Math.floor((poolCents * r.weight) / total) }));
  const paid = allocations.reduce((s, a) => s + a.amountCents, 0);
  return { poolCents, allocations, toRevenueCents: poolCents - paid };
}

/** "At least" estimate shown on open slots: the pool divided by every slot still open to artists, rounded down. */
export function estimatePerTileCents(poolCents: number, openToPublic: number, acceptedPublic: number): number {
  const slots = openToPublic + acceptedPublic;
  return slots > 0 ? Math.floor(poolCents / slots) : 0;
}
