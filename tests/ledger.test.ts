import { test } from "node:test";
import assert from "node:assert/strict";
import { balances, openRequests, releaseDue, requestPayout, reverseTile, settleRequest, type LedgerEntry } from "../src/lib/mosaic/ledger.ts";

const day = 86400_000;
const t0 = new Date("2026-11-01T00:00:00Z");
const at = (d: number) => new Date(t0.getTime() + d * day);

function share(id: string, amount: number, weight: number, releaseDay = 14): LedgerEntry {
  return { id, artistId: "a", mosaicId: "m1", kind: "share", amountCents: amount, at: t0.toISOString(), releaseAt: at(releaseDay).toISOString(), tiles: weight, favourites: 0, weight };
}

test("a share starts pending", () => {
  const b = balances([share("s1", 240, 10)], "a");
  assert.deepEqual([b.pendingCents, b.availableCents, b.lifetimeCents], [240, 0, 240]);
});

test("nothing is released before the hold ends, then it becomes available", () => {
  const entries = [share("s1", 240, 10)];
  assert.equal(releaseDue(entries, at(13)).length, 0);
  const rel = releaseDue(entries, at(14));
  assert.equal(rel.length, 1);
  const b = balances([...entries, ...rel], "a");
  assert.deepEqual([b.pendingCents, b.availableCents], [0, 240]);
  // Releasing twice adds nothing.
  assert.equal(releaseDue([...entries, ...rel], at(20)).length, 0);
});

test("a tile removed during the hold reduces pending and the later release", () => {
  const entries: LedgerEntry[] = [share("s1", 180, 9)];
  const rev = reverseTile(entries, "s1", 1, at(5), "Tile removed")!;
  assert.equal(rev.amountCents, 20);
  entries.push(rev);
  assert.equal(balances(entries, "a").pendingCents, 160);
  entries.push(...releaseDue(entries, at(14)));
  const b = balances(entries, "a");
  assert.deepEqual([b.pendingCents, b.availableCents, b.lifetimeCents], [0, 160, 160]);
});

test("a reversal after release comes out of available", () => {
  const entries: LedgerEntry[] = [share("s1", 100, 4)];
  entries.push(...releaseDue(entries, at(14)));
  entries.push(reverseTile(entries, "s1", 1, at(20), "Late report")!);
  const b = balances(entries, "a");
  assert.deepEqual([b.pendingCents, b.availableCents], [0, 75]);
});

test("reversals never exceed the share", () => {
  const entries: LedgerEntry[] = [share("s1", 10, 3)];
  entries.push(reverseTile(entries, "s1", 3, at(1), "x")!);
  assert.equal(reverseTile(entries, "s1", 1, at(2), "y"), null);
});

test("payouts need the minimum, then move through requested to paid", () => {
  const entries: LedgerEntry[] = [share("s1", 900, 10), share("s2", 300, 3)];
  entries.push(...releaseDue(entries, at(14)));
  assert.equal(typeof requestPayout(entries.slice(0, 1), "a", 1000, at(15)), "string");
  const req = requestPayout(entries, "a", 1000, at(15)) as LedgerEntry;
  assert.equal(req.amountCents, 1200);
  entries.push(req);
  assert.equal(typeof requestPayout(entries, "a", 1000, at(15)), "string"); // one at a time
  assert.equal(openRequests(entries).length, 1);
  entries.push(settleRequest(entries, req.id, "paid", at(16))!);
  const b = balances(entries, "a");
  assert.deepEqual([b.availableCents, b.requestedCents, b.paidCents], [0, 0, 1200]);
  assert.equal(settleRequest(entries, req.id, "paid", at(17)), null); // no double pay
  assert.equal(openRequests(entries).length, 0);
});

test("a rejected request returns to available", () => {
  const entries: LedgerEntry[] = [share("s1", 1500, 10)];
  entries.push(...releaseDue(entries, at(14)));
  const req = requestPayout(entries, "a", 1000, at(15)) as LedgerEntry;
  entries.push(req);
  entries.push(settleRequest(entries, req.id, "returned", at(16))!);
  const b = balances(entries, "a");
  assert.deepEqual([b.availableCents, b.requestedCents, b.paidCents], [1500, 0, 0]);
});

test("balances only count the given artist", () => {
  const other: LedgerEntry = { ...share("s9", 500, 1), artistId: "b" };
  assert.equal(balances([share("s1", 100, 1), other], "a").pendingCents, 100);
});
