import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeSlots, encodeSlots, packHex, unpackHex } from "../src/lib/mosaic/bits.ts";
import { requestPayout } from "../src/lib/mosaic/ledger.ts";

test("slot bitmaps round-trip at 40,000 slots and stay small", () => {
  const total = 40_000, slots = [0, 7, 8, 9999, 20_001, 39_999];
  const b64 = encodeSlots(slots, total);
  assert.deepEqual(decodeSlots(b64, total), slots);
  assert.ok(b64.length < 7000);
  assert.deepEqual(decodeSlots(encodeSlots([], 10_000), 10_000), []);
  assert.equal(decodeSlots(encodeSlots(Array.from({ length: 10_000 }, (_, i) => i), 10_000), 10_000).length, 10_000);
});

test("packed slot colours round-trip", () => {
  const hexes = ["#b9707a", "#000000", "#FFFFFF", "#4f5f8a"];
  assert.deepEqual(unpackHex(packHex(hexes)), hexes.map((h) => h.toLowerCase()));
  assert.equal(packHex(Array.from({ length: 40_000 }, () => "#123456")).length, 240_000);
});

test("the first payout waits for 20 accepted tiles", () => {
  const now = new Date("2026-11-04T12:00:00Z");
  const early = requestPayout([], "a1", 1000, now, 12, 20);
  assert.equal(typeof early, "string");
  assert.match(early as string, /unlocks after 20 accepted tiles. You have 12/);
  const later = requestPayout([], "a1", 1000, now, 20, 20);
  assert.equal(typeof later, "string");
  assert.doesNotMatch(later as string, /unlocks/);
});
