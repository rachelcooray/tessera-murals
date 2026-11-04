# Tessera pricing and profitability

Prices and grid sizes live in `src/config/mosaic.ts` (what the site shows) and in the payments server's `MOSAIC_TIERS` secret (what actually charges). Keep them in step.

## Price list

| Size | Tiles | Grid | Price | Best for |
|---|---|---|---|---|
| Small | 10,000 | 100 × 100 | $45 | Landscapes, pets and silhouettes |
| Medium | 20,164 | 142 × 142 | $95 | One or two faces you can recognise |
| Large | 30,276 | 174 × 174 | $145 | Group photos and sharp faces |
| Grand | 40,000 | 200 × 200 | $195 | Big groups and large prints |

Every size includes the private invite link, the paint tool, review of every tile, the reveal video and a link to every tile. A print is an add-on at checkout (price to be set once a print partner is chosen).

The payments server secret:

```bash
supabase secrets set MOSAIC_TIERS='{"small":4500,"medium":9500,"large":14500,"grand":19500}'
```

## What each order leaves after direct costs

Assumptions: card fees of 2.9% + $0.30 (Stripe's standard rate for domestic cards; international cards and currency conversion add up to about 2.5% more), the full 30% artist pool paid out, and $1 to $2.50 of storage and bandwidth per mosaic for the tiles people actually paint.

| Size | Price | Card fee | Artist pool (30%) | Hosting | **Left per order** | Margin |
|---|---|---|---|---|---|---|
| Small | $45 | $1.60 | $13.50 | $1.00 | **$28.89** | 64% |
| Medium | $95 | $3.06 | $28.50 | $1.50 | **$61.95** | 65% |
| Large | $145 | $4.50 | $43.50 | $2.00 | **$95.00** | 66% |
| Grand | $195 | $5.96 | $58.50 | $2.50 | **$128.04** | 66% |

This is before your own time and before advertising.

## Advertising

Each sale that comes from paid ads costs something to win. Left per order after ad cost:

| Ad cost per sale | Small | Medium | Large | Grand |
|---|---|---|---|---|
| $10 | $18.89 | $51.95 | $85.00 | $118.05 |
| $20 | $8.89 | $41.95 | $75.00 | $108.05 |
| $30 | **−$1.10** | $31.95 | $65.00 | $98.05 |

Small only works with cheap or organic customers. Ads should push Medium and up.

## Monthly fixed costs

About $25 for the Supabase Pro plan, plus a domain and email (a few dollars). Two Small orders, or one Medium, a month cover them.

## What artists earn

The pool is shared among the artists who paint on a mosaic, by accepted tile (favourites count double). Per tile, depending on how many tiles artists paint on that mosaic:

| Size | Pool | If artists paint 500 tiles | If artists paint 2,000 tiles |
|---|---|---|---|
| Small | $13.50 | 2.7¢ a tile | 0.7¢ a tile |
| Medium | $28.50 | 5.7¢ | 1.4¢ |
| Large | $43.50 | 8.7¢ | 2.2¢ |
| Grand | $58.50 | 11.7¢ | 2.9¢ |

With a $10 minimum payout, an artist needs between about 85 and 1,500 accepted tiles to cash out, depending on the mosaic. The 20-tile rule is easy to reach; the $10 minimum is the real wall. Consider lowering the minimum (for example to $5) once payouts are live.

## The fallback

Squares nobody paints are filled by Tessera. The cost depends on how:

| Size | Squares left if people paint 1,000 | Hand-painting at 1 minute each | At $10 an hour |
|---|---|---|---|
| Small | 9,000 | 150 hours | $1,500 |
| Medium | 19,164 | 319 hours | $3,194 |
| Large | 29,276 | 488 hours | $4,879 |
| Grand | 39,000 | 650 hours | $6,500 |

Hand-painting the leftovers costs far more than any order brings in. Generated studio fill costs nothing. So the claim "every square is painted by a person" only holds if people really paint them all; otherwise use "hand-painted by your people and Tessera artists".
