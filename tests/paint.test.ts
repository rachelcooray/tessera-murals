import { test } from "node:test";
import assert from "node:assert/strict";
import { BRUSHES, BRUSH_SETS, brushById, hexToHsv, hsvToHex, isHex, paletteFor } from "../src/lib/mosaic/paint/brushes.ts";
import { floodMask, maskCount } from "../src/lib/mosaic/paint/fill.ts";
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
  assert.equal(BRUSHES.length, 21);
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
