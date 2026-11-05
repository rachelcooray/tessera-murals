import { test } from "node:test";
import assert from "node:assert/strict";
import { curvesLut, recolour } from "../src/lib/mosaic/paint/filters.ts";
import { guardColour, lensAdvice } from "../src/lib/mosaic/paint/brushes.ts";
import { keystone, quadPoint } from "../src/lib/mosaic/paint/warp.ts";
import { colourDistance, hexToRgb } from "../src/lib/colour.ts";

test("curves: flat settings change nothing, and the curve never turns back on itself", () => {
  const flat = curvesLut(0, 0, 0);
  for (let i = 0; i < 256; i++) assert.ok(Math.abs(flat[i] - i) <= 1, `level ${i}`);
  const s = curvesLut(-30, 0, 30);
  assert.ok(s[64] < 64 && s[192] > 192, "an S curve darkens shadows and lifts highlights");
  const wild = curvesLut(64, -64, 64);
  for (let i = 1; i < 256; i++) assert.ok(wild[i] >= wild[i - 1], "monotone");
  assert.equal(wild[0], 0); assert.equal(wild[255], 255);
});

test("recolour keeps the shading: lighter stays lighter", () => {
  const data = new Uint8ClampedArray([100, 50, 50, 255, 140, 90, 90, 255, 10, 10, 10, 255]);
  recolour({ data, width: 3, height: 1 }, new Uint8Array([1, 1, 0]), [100, 50, 50], [40, 80, 160]);
  assert.deepEqual([...data.slice(0, 3)], [40, 80, 160]);
  assert.deepEqual([...data.slice(4, 7)], [80, 120, 200], "the lighter pixel stays 40 lighter");
  assert.deepEqual([...data.slice(8, 11)], [10, 10, 10], "outside the mask is untouched");
});

test("stay in my colour: nearby colours pass, far ones are pulled to the edge", () => {
  const slot = "#b9707a";
  assert.equal(guardColour("#b5707a", slot), "#b5707a");
  const pulled = guardColour("#00ff00", slot, 130);
  const d = colourDistance(hexToRgb(pulled), hexToRgb(slot));
  assert.ok(d <= 131 && d > 110, `pulled to about the limit, got ${d}`);
});

test("lens advice says which way to go", () => {
  assert.match(lensAdvice("#b9707a", "#b9707a", 0.97), /Spot on/);
  assert.match(lensAdvice("#e8b0b8", "#b9707a", 0.8), /darker/);
  assert.match(lensAdvice("#5a2a30", "#b9707a", 0.5), /lighter/);
});

test("perspective: no lean is the square itself, a lean pulls one edge in", () => {
  const q = keystone(100, 0, 0);
  assert.deepEqual(q, [[0, 0], [100, 0], [100, 100], [0, 100]]);
  const back = keystone(100, 0, 40);
  assert.ok(back[0][0] > 0 && back[1][0] < 100, "leaning back narrows the top");
  assert.deepEqual(quadPoint(q, 0.5, 0.5), [50, 50]);
});
