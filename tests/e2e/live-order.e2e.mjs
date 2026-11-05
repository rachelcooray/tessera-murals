/**
 * End-to-end, in a real browser, against a local Supabase in live mode:
 * a buyer orders, a guest paints a tile, an admin approves it, the buyer finishes and reveals,
 * and an outsider can see it only after the reveal.
 *
 *   supabase start && supabase db reset
 *   supabase functions serve --env-file <file with PAYMENTS_TEST_MODE=true and CRON_SECRET>
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key> npx next dev -p 3000
 *   node tests/e2e/live-order.e2e.mjs <target.jpg> <tile.jpg> [screenshot dir]
 */
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

// Playwright may be installed globally rather than in this project.
const { chromium } = createRequire(import.meta.url)("playwright");

const [target, tileImg, shots] = process.argv.slice(2);
const SITE = process.env.SITE ?? "http://localhost:3000";
const URL_ = "http://127.0.0.1:54321";
const SERVICE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });

const step = (s) => console.log(`\n▶ ${s}`);
const ok = (s) => console.log(`  ✓ ${s}`);
function check(cond, msg) { if (!cond) throw new Error(`✗ ${msg}`); ok(msg); }

const browser = await chromium.launch();
const errors = [];
async function ctx(name) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  p.on("dialog", (d) => void d.accept(d.type() === "prompt" ? "Bank transfer ref 1" : undefined));
  return p;
}
const shot = async (p, n) => { if (shots) await p.screenshot({ path: `${shots}/${n}.png`, fullPage: true }); };

try {
  step("Buyer orders a Small mosaic (server in test mode, no card)");
  const buyer = await ctx("buyer");
  await buyer.goto(`${SITE}/start/`);
  await buyer.setInputFiles("#target", target);
  await buyer.getByText("I own this image").click();
  await buyer.getByText("I am 18 or older").click();
  await buyer.getByRole("button", { name: "Continue to size" }).click();
  await buyer.getByRole("radio", { name: /Small · 10,000 tiles/ }).click();
  await buyer.getByRole("button", { name: /Continue with Small/ }).click();
  await buyer.fill("#email", "buyer@example.com");
  await buyer.getByRole("button", { name: /Test mode: create without paying/ }).click();
  await buyer.waitForURL(/\/mosaic\/?\?id=/, { timeout: 30000 });
  const mosaicId = new URL(buyer.url()).searchParams.get("id");
  await buyer.getByText(/0 of 10,000 tiles in/).waitFor({ timeout: 20000 });
  check(Boolean(mosaicId), `mosaic ${mosaicId} created and the dashboard loaded`);
  const { data: row } = await db.from("mosaics").select("status, price_cents, owner_id, payment_mock").eq("id", mosaicId).single();
  check(row.status === "collecting" && row.price_cents === 4500 && row.payment_mock, "saved on the server at the server's price, marked as a test payment");
  const invite = await buyer.getByRole("link", { name: "Try it yourself" }).getAttribute("href");
  await shot(buyer, "1-dashboard");

  step("An outsider with the mosaic link sees only the title and date");
  const outsider = await ctx("outsider");
  await outsider.goto(`${SITE}/mosaic/?id=${mosaicId}`);
  await outsider.getByText(/This picture is still being made/).waitFor({ timeout: 20000 });
  ok("outsider sees the teaser");

  step("A guest opens the invite, gets one colour and sends a tile");
  const guest = await ctx("guest");
  await guest.goto(`${SITE}${invite}`);
  await guest.getByRole("button", { name: /Give me a colour/ }).click();
  await guest.getByRole("heading", { name: "Your slot" }).waitFor({ timeout: 20000 });
  const slotText = await guest.getByText(/· slot \d+/).first().textContent();
  ok(`guest got ${slotText?.trim()}`);
  await shot(guest, "2-guest-slot");
  await guest.getByRole("button", { name: "Upload a picture I made" }).click();
  await guest.setInputFiles("#tilefile", tileImg);
  await guest.getByText("I made this myself").click();
  await guest.getByRole("button", { name: "Send for review" }).click();
  await guest.getByRole("heading", { name: "Your tile is being reviewed" }).waitFor({ timeout: 30000 });
  const { data: tiles } = await db.from("tiles").select("id, status, image_path, thumb").eq("mosaic_id", mosaicId);
  check(tiles.length === 1 && tiles[0].status === "pending" && tiles[0].thumb.startsWith("data:image/jpeg"), "tile saved as pending with a thumbnail");
  const { data: obj } = await db.storage.from("tiles").download(tiles[0].image_path);
  check(obj && obj.size > 1000, `full tile image stored (${obj?.size} bytes)`);
  await shot(guest, "3-guest-sent");

  step("A wrong invite token is refused");
  await guest.goto(`${SITE}/join/?m=${mosaicId}&i=wrongtoken`);
  await guest.getByRole("heading", { name: /invite link isn.t right/ }).waitFor({ timeout: 20000 });
  ok("wrong token refused");

  step("An admin signs in and approves the tile");
  const email = `admin-${Date.now()}@example.com`;
  await db.from("admins").insert({ email });
  await db.auth.admin.createUser({ email, password: "admin-pass-123", email_confirm: true });
  const admin = await ctx("admin");
  await admin.goto(`${SITE}/admin/`);
  await admin.fill("#em", email);
  await admin.fill("#pw", "admin-pass-123");
  await admin.getByRole("button", { name: "Sign in" }).click();
  await admin.waitForTimeout(1500);
  await admin.goto(`${SITE}/admin/mosaics/`);
  await admin.getByRole("heading", { name: "Tile review" }).waitFor({ timeout: 20000 });
  await shot(admin, "4-admin-review");
  const slotNo = slotText.match(/slot (\d+)/)[1];
  await admin.locator("article").filter({ hasText: `Untitled mosaic · slot ${slotNo}` }).getByRole("button", { name: "Accept" }).click();
  await admin.getByText("Accepted and placed").waitFor({ timeout: 20000 });
  const { data: t2 } = await db.from("tiles").select("status").eq("id", tiles[0].id).single();
  check(t2.status === "approved", "tile approved in the database");

  step("A guest can't use the admin page");
  await guest.goto(`${SITE}/admin/mosaics/`);
  await guest.getByText(/Admin sign-in|Sign in on the main admin page/).first().waitFor({ timeout: 20000 });
  ok("guest sees the sign-in prompt, no data");

  step("The buyer finishes with studio fill and reveals");
  await buyer.reload();
  await buyer.getByText(/1 of 10,000 tiles in/).waitFor({ timeout: 20000 });
  await buyer.getByRole("button", { name: "Finish now with studio fill" }).click();
  await buyer.getByText(/9,999 slots filled/).waitFor({ timeout: 30000 });
  await buyer.getByRole("button", { name: "Reveal it now" }).click();
  await buyer.getByRole("link", { name: /Watch and download the reveal/ }).waitFor({ timeout: 30000 });
  ok("revealed");
  await shot(buyer, "5-revealed-dashboard");

  step("The reveal page renders, and the outsider can now see the finished piece");
  await outsider.goto(`${SITE}/reveal/?id=${mosaicId}`);
  await outsider.getByRole("button", { name: "Play" }).waitFor({ timeout: 30000 });
  await outsider.waitForFunction(() => !document.querySelector("button.btn--primary")?.hasAttribute("disabled"), null, { timeout: 30000 });
  ok("reveal ready to play");
  await shot(outsider, "6-reveal");
  await outsider.goto(`${SITE}/tile/?m=${mosaicId}&s=${Number(slotText.match(/slot (\d+)/)[1]) - 1}`);
  await outsider.getByText(/This one is slot/).waitFor({ timeout: 20000 });
  ok("the guest's tile page works for anyone with the link");
  await shot(outsider, "7-tile-page");

  step("My mosaics lists the order for the buyer only");
  await buyer.goto(`${SITE}/mine/`);
  await buyer.getByRole("link", { name: "Untitled mosaic" }).waitFor({ timeout: 20000 });
  ok("buyer sees their mosaic");
  await outsider.goto(`${SITE}/mine/`);
  await outsider.getByText(/No mosaics on this device yet/).waitFor({ timeout: 20000 });
  ok("outsider sees none");

  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  console.log("\nALL PASSED");
} catch (e) {
  console.error(e.message);
  if (errors.length) console.error("Page errors:", errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
