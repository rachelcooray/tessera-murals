# tessera-murals

Tessera makes **commissioned hidden mosaics**. A customer uploads a photo and pays. Tessera cuts it into slots, and each contributor gets one colour, never the picture. Friends paint first, Tessera artists fill spare slots for a share of the price, and any slot still empty near the date gets a clearly marked studio fill. Contributed art must be made by people. When the last tile lands, the reveal zooms out from one tile to the whole picture and exports a 9:16 video.

This is still a front-end prototype: data lives in the browser (localStorage), payouts are mocked, and card payments run in test mode until Stripe is set up (see docs/payments.md).

```bash
npm install
npm run dev
npm test        # pool split, ledger, duplicate and AI-metadata checks
```

Live at https://rachelcooray.github.io/tessera-murals/ (static export, deployed by GitHub Actions on every push to main).

## Pages

| Path | What it is |
|---|---|
| `/` | Home: commission a hidden mosaic, sizes |
| `/start` | Customer order: image and permissions, size and date, slot preview and pay |
| `/mosaic?id=` | Customer dashboard: progress, invite link, studio fill, reveal, favourites |
| `/join?m=&i=` | Contributor: get a colour or upload and be placed, tint to fit, send |
| `/challenge` | Colour challenge: open public slots with an "at least" estimate per tile |
| `/artist` | Artist profile, earnings, per-mosaic breakdown, ledger, payout setup |
| `/reveal?id=` | The reveal animation and video export |
| `/tile?m=&s=` | A contributor's tile in the finished piece |
| `/gallery` | Past mosaics (public ones only) |
| `/admin/mosaics` | Tile review, mosaics, payout requests, settings |
| `/wall`, `/seasons`, `/admin` | The original $1 season wall, kept as it was |

## Where things live

- `src/config/mosaic.ts`: every setting (sizes and prices, tint, studio fill timing, pool %, cap, favourites, hold days, payout minimum, rate limit). Change numbers here.
- `src/lib/mosaic/`: pure logic (`colours`, `checks`, `pool`, `ledger`, `payouts`) plus the browser store and image helpers.
- `src/components/mosaic/`: the pages.
- `tests/`: unit tests, run with Node's built-in test runner (no extra packages).

## Not done yet (Phase 2)

- A real database and sign-in. Orders, tiles and the ledger stay in one browser, so test the whole flow in the same browser.
- A real payout provider (the interface is ready in `src/lib/mosaic/payouts.ts`).
- Server-side AI and content checks. Today the AI check only reads the file's own metadata, which is easy to strip, so a person still decides.
- Legal text. Everything marked `[TODO: needs lawyer review]` or `[TODO: needs accountant and legal review]`.
