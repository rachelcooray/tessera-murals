import { test } from "node:test";
import assert from "node:assert/strict";
import { estimatePerTileCents, poolFor, splitPool } from "../src/lib/mosaic/pool.ts";

const opts = { cap: 10, favouriteMultiplier: 2 };

test("pool is a share of the order, rounded down", () => {
  assert.equal(poolFor(14900, 3000), 4470);
  assert.equal(poolFor(4999, 3000), 1499); // 1499.7 rounds down
  assert.throws(() => poolFor(10.5, 3000));
});

test("split is proportional to accepted tiles", () => {
  const s = splitPool(1000, [{ artistId: "a", tiles: 3, favourites: 0 }, { artistId: "b", tiles: 1, favourites: 0 }], opts);
  assert.deepEqual(s.allocations.map((a) => a.amountCents), [750, 250]);
  assert.equal(s.toRevenueCents, 0);
});

test("rounding goes down and leftover cents go to revenue", () => {
  const s = splitPool(100, [{ artistId: "a", tiles: 1, favourites: 0 }, { artistId: "b", tiles: 1, favourites: 0 }, { artistId: "c", tiles: 1, favourites: 0 }], opts);
  assert.deepEqual(s.allocations.map((a) => a.amountCents), [33, 33, 33]);
  assert.equal(s.toRevenueCents, 1);
  const total = s.allocations.reduce((t, a) => t + a.amountCents, 0) + s.toRevenueCents;
  assert.equal(total, 100);
});

test("per-artist cap limits counted tiles", () => {
  const s = splitPool(1200, [{ artistId: "a", tiles: 25, favourites: 0 }, { artistId: "b", tiles: 2, favourites: 0 }], opts);
  assert.equal(s.allocations[0].tilesCounted, 10);
  assert.deepEqual(s.allocations.map((a) => a.amountCents), [1000, 200]);
});

test("favourites count as extra tiles, only up to counted tiles", () => {
  const s = splitPool(900, [{ artistId: "a", tiles: 2, favourites: 1 }, { artistId: "b", tiles: 3, favourites: 0 }], opts);
  // a: 2 + 1 = 3, b: 3. Equal halves.
  assert.deepEqual(s.allocations.map((a) => a.amountCents), [450, 450]);
  const t = splitPool(100, [{ artistId: "a", tiles: 1, favourites: 5 }], opts);
  assert.equal(t.allocations[0].favouritesCounted, 1);
  assert.equal(t.allocations[0].weight, 2);
});

test("multiplier is configurable", () => {
  const s = splitPool(1000, [{ artistId: "a", tiles: 1, favourites: 1 }, { artistId: "b", tiles: 1, favourites: 0 }], { cap: 10, favouriteMultiplier: 4 });
  // a: 1 + 3 = 4, b: 1 → 800 / 200
  assert.deepEqual(s.allocations.map((a) => a.amountCents), [800, 200]);
});

test("no public artists: the whole pool returns to revenue", () => {
  const s = splitPool(4470, [], opts);
  assert.equal(s.allocations.length, 0);
  assert.equal(s.toRevenueCents, 4470);
  const z = splitPool(4470, [{ artistId: "a", tiles: 0, favourites: 0 }], opts);
  assert.equal(z.toRevenueCents, 4470);
});

test("contributions for the same artist are merged", () => {
  const s = splitPool(100, [{ artistId: "a", tiles: 1, favourites: 0 }, { artistId: "a", tiles: 1, favourites: 0 }], opts);
  assert.equal(s.allocations.length, 1);
  assert.equal(s.allocations[0].tilesCounted, 2);
  assert.equal(s.allocations[0].amountCents, 100);
});

test("per-tile estimate is a floor", () => {
  assert.equal(estimatePerTileCents(4470, 152, 84), 18);
  assert.equal(estimatePerTileCents(4470, 0, 0), 0);
});
