import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPromo } from "../supabase/functions/_shared/tiers.ts";

const at = (iso: string) => Date.parse(iso);

test("a code takes its percentage off, rounded to the cent", () => {
  const r = applyPromo(9500, "founding15", at("2026-11-10T12:00:00Z"));
  assert.ok(!("error" in r));
  assert.equal(r.priceCents, 8075);
  assert.equal(r.code, "FOUNDING15");
});

test("no code means the full price", () => {
  assert.deepEqual(applyPromo(4500, "  ", at("2026-11-10T12:00:00Z")), { priceCents: 4500, code: null, percentOff: 0, label: null });
});

test("unknown and expired codes are refused with a reason", () => {
  assert.match((applyPromo(4500, "NOPE", at("2026-11-10T12:00:00Z")) as { error: string }).error, /recognised/);
  assert.match((applyPromo(4500, "EARLYBIRD", at("2026-11-23T00:00:01Z")) as { error: string }).error, /ended on 22 November/);
});

test("a code works until the end of its last day in London", () => {
  assert.ok(!("error" in applyPromo(4500, "EARLYBIRD", at("2026-11-22T23:59:00Z"))));
  assert.ok(!("error" in applyPromo(4500, "FOUNDING15", at("2026-12-31T23:59:00Z"))));
  assert.ok("error" in applyPromo(4500, "FOUNDING15", at("2027-01-01T00:00:30Z")));
});
