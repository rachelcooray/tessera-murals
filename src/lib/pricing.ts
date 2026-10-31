/**
 * Square pricing. A buyer picks how many squares they want; the price comes from the
 * tier table. Counts between tiers pay the per-square rate of the tier below them.
 * The same table lives in the payments server function, which is what actually charges.
 */
export interface Tier { n: number; price: number }
export interface Prices { tiers: Tier[]; maxPerOrder: number }

/** Your prices. */
export const DEFAULT_TIERS: Tier[] = [
  { n: 1, price: 1 }, { n: 2, price: 1.9 }, { n: 3, price: 2.7 }, { n: 4, price: 3.6 }, { n: 5, price: 4.5 }, { n: 10, price: 7 },
];

/** A smoother ladder: every step saves a little more, and every pack nets more per square than a single after card fees. */
export const SUGGESTED_TIERS: Tier[] = [
  { n: 1, price: 1 }, { n: 2, price: 1.9 }, { n: 3, price: 2.7 }, { n: 4, price: 3.5 }, { n: 5, price: 4.25 }, { n: 10, price: 7.5 },
];

export const DEFAULT_PRICES: Prices = { tiers: DEFAULT_TIERS, maxPerOrder: 20 };

/** Stripe standard card pricing in the US. Check your own Stripe dashboard; international cards cost more. */
export const STRIPE_FEE = { percent: 0.029, fixed: 0.3 };

const round2 = (v: number) => Math.round(v * 100) / 100;

export function sortedTiers(p: Prices): Tier[] {
  return [...p.tiers].filter((t) => t.n >= 1 && t.price > 0).sort((a, b) => a.n - b.n);
}

export function priceFor(n: number, p: Prices): number {
  const tiers = sortedTiers(p);
  const exact = tiers.find((t) => t.n === n);
  if (exact) return round2(exact.price);
  const below = [...tiers].reverse().find((t) => t.n <= n) ?? tiers[0];
  return round2((below.price / below.n) * n);
}

export function singlePrice(p: Prices): number {
  return priceFor(1, p);
}

export interface Quote { n: number; total: number; perSquare: number; full: number; saving: number; savingPct: number; fee: number; net: number; netPerSquare: number }

export function quote(n: number, p: Prices): Quote {
  const total = priceFor(n, p), single = singlePrice(p), full = round2(single * n);
  const fee = round2(total * STRIPE_FEE.percent + STRIPE_FEE.fixed);
  return {
    n, total, perSquare: round2(total / n), full,
    saving: round2(full - total), savingPct: full > 0 ? Math.round((1 - total / full) * 100) : 0,
    fee, net: round2(total - fee), netPerSquare: round2((total - fee) / n),
  };
}

export function money(v: number): string {
  return "$" + v.toFixed(2).replace(/\.00$/, "");
}
