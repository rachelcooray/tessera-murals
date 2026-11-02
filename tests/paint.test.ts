import { test } from "node:test";
import assert from "node:assert/strict";
import { BRUSHES, BRUSH_SETS, brushById, harmony, hexToHsv, hsvToHex, isHex, paletteFor } from "../src/lib/mosaic/paint/brushes.ts";
import { colourMask, floodMask, maskCount } from "../src/lib/mosaic/paint/fill.ts";
import * as F from "../src/lib/mosaic/paint/filters.ts";
import { SHAPES, curvePoints, shapePath } from "../src/lib/mosaic/paint/shapes.ts";
import { durationLabel, effortFlag, paintStats } from "../src/lib/mosaic/paint/effort.ts";
import { slotColour } from "../src/lib/mosaic/colours.ts";

/** A 10×10 white square with a black vertical wall at x = 5. */
function walled(): number[] {
  const d: number[] = [];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) d.push(...(x === 5 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
  return d;
}

test("flood fill stops at a wall and grows by the edge", () => {
  const d = walled();
  assert.equal(maskCount(floodMask(d, 10, 10, 1, 1, 10, 0)), 50);
  assert.equal(maskCount(floodMask(d, 10, 10, 1, 1, 10, 1)), 60);
  assert.equal(maskCount(floodMask(d, 10, 10, 1, 1, 255, 0)), 100);
  assert.equal(maskCount(floodMask(d, 10, 10, 20, 1, 10, 0)), 0);
});

test("every brush set has brushes and ids are unique", () => {
  assert.equal(BRUSHES.length, 31);
  assert.ok(BRUSHES.some((b) => b.texture === "pixel") && BRUSHES.some((b) => b.texture === "nib") && BRUSHES.some((b) => b.wet > 0));
  assert.equal(new Set(BRUSHES.map((b) => b.id)).size, BRUSHES.length);
  for (const s of BRUSH_SETS) assert.ok(BRUSHES.some((b) => b.set === s));
  assert.equal(brushById("nope").id, BRUSHES[0].id);
});

test("hsv round-trips and the slot palette contains the slot colour", () => {
  for (const hex of ["#b9707a", "#4f5f8a", "#000000", "#ffffff", "#6f8a5a"]) {
    const [h, s, v] = hexToHsv(hex);
    assert.equal(hsvToHex(h, s, v), hex);
  }
  const p = paletteFor(slotColour([185, 112, 122]));
  assert.equal(p.length, 8);
  assert.ok(p.some((c) => c.label === "Your slot colour" && c.hex === "#b9707a"));
  assert.ok(p.every((c) => isHex(c.hex)));
});

test("paint stats cap long pauses and flag tiles with little work", () => {
  const t = 1_000_000;
  const records = [
    { tool: "brush", start: t, end: t + 2000, input: "pen" },
    { tool: "fill", start: t + 3000, end: t + 3100, input: "pen" },
    { tool: "brush", start: t + 600_000, end: t + 605_000, input: "touch" },
  ];
  const s = paintStats(records, 30_000);
  assert.equal(s.strokes, 3);
  assert.equal(s.activeMs, 2000 + 1000 + 100 + 30_000 + 5000);
  assert.deepEqual(s.inputs, ["pen", "touch"]);
  assert.deepEqual(s.tools, ["brush", "fill"]);
  assert.equal(effortFlag(s, 5, 20), "Very little painting (3 strokes, 38 s)");
  assert.equal(effortFlag({ ...s, strokes: 40 }, 5, 20), null);
  assert.equal(durationLabel(192_000), "3 min 12 s");
});

test("non-contiguous fill finds the same colour on both sides of a wall", () => {
  const d = walled();
  assert.equal(maskCount(colourMask(d, 10, 10, 1, 1, 10)), 90);
  assert.equal(maskCount(colourMask(d, 10, 10, 5, 5, 10)), 10);
});

test("every shape fits its box and closed shapes have at least three points", () => {
  for (const { id } of SHAPES) {
    const s = shapePath(id, 10, 20, 110, 220);
    assert.ok(s.points.length >= 2, id);
    if (s.closed) assert.ok(s.points.length >= 3, id);
    for (const [x, y] of s.points) { assert.ok(x >= 9 && x <= 111, `${id} x ${x}`); assert.ok(y >= 19 && y <= 221, `${id} y ${y}`); }
  }
  const c = curvePoints([0, 0], [50, 100], [100, 0]);
  assert.deepEqual(c[0], [0, 0]);
  assert.deepEqual(c[c.length - 1], [100, 0]);
  assert.equal(c[24][1], 50);
});

const px = (pixels: number[][]) => ({ data: new Uint8ClampedArray(pixels.flat()), width: pixels.length, height: 1 });

test("adjustments change colour as expected and leave transparent pixels alone", () => {
  const p = px([[200, 100, 50, 255], [10, 20, 30, 0]]);
  F.invert(p);
  assert.deepEqual([...p.data], [55, 155, 205, 255, 10, 20, 30, 0]);
  const g = px([[255, 0, 0, 255]]);
  F.desaturate(g);
  assert.equal(g.data[0], g.data[1]);
  const t = px([[200, 200, 200, 255], [20, 20, 20, 255]]);
  F.threshold(t, 128);
  assert.deepEqual([t.data[0], t.data[4]], [255, 0]);
  const q = px([[100, 100, 100, 255]]);
  F.posterize(q, 2);
  assert.equal(q.data[0], 0);
  const m = px([[0, 0, 0, 255], [255, 255, 255, 255]]);
  F.gradientMap(m, [10, 20, 30], [200, 210, 220]);
  assert.deepEqual([...m.data.slice(0, 3)], [10, 20, 30]);
  assert.deepEqual([...m.data.slice(4, 7)], [200, 210, 220]);
});

test("blur spreads a single bright pixel and keeps alpha weighting", () => {
  const w = 9, d = new Uint8ClampedArray(w * w * 4);
  const c = (4 * w + 4) * 4;
  d[c] = d[c + 1] = d[c + 2] = d[c + 3] = 255;
  const p = { data: d, width: w, height: w };
  F.boxBlur(p, 1);
  assert.ok(d[c + 3] < 255 && d[c + 3] > 0);
  assert.ok(d[((4 * w + 5) * 4) + 3] > 0);
  assert.equal(d[c], 255);
});

test("dodge lightens and burn darkens the middle of a dab", () => {
  const make = () => ({ data: new Uint8ClampedArray(Array.from({ length: 16 * 16 }, () => [100, 100, 100, 255]).flat()), width: 16, height: 16 });
  const a = make(), b = make();
  F.toneDab(a, "dodge", 1, 0.5);
  F.toneDab(b, "burn", 1, 0.5);
  const mid = (8 * 16 + 8) * 4;
  assert.ok(a.data[mid] > 100);
  assert.ok(b.data[mid] < 100);
  assert.equal(a.data[0], 100);
});

test("colour harmony returns the right number of colours", () => {
  assert.equal(harmony("#b9707a", "complementary").length, 2);
  assert.equal(harmony("#b9707a", "triadic").length, 3);
  assert.equal(harmony("#b9707a", "tetradic").length, 4);
  assert.ok(harmony("#b9707a", "analogous").includes("#b9707a"));
});
