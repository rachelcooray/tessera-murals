# Payments setup (Stripe)

Until the two public settings in step 4 are set, the site runs in **test mode**: no card is charged and orders are marked "(test)" in Admin.

## How charging works
- **One square:** the card is *held* (Stripe manual capture). Admin approval captures it; rejection releases it. Holds expire after about 7 days, which is why Admin flags anything pending over 5.
- **More than one square:** charged straight away. The tile uses one square; the rest become credits.
- **Prices:** `src/lib/pricing.ts` sets what visitors see. The server charges from its own `PRICE_TIERS` setting, so keep the two in step.

## 1. Stripe
1. Create a Stripe account and stay in **test mode** while you try it.
2. Developers > API keys: copy the **publishable key** (`pk_test_…`) and the **secret key** (`sk_test_…`). The secret key never goes in the site or in Git.

## 2. Payments server (Supabase Edge Function)
Install the Supabase CLI, create a project, then from this folder:

```bash
supabase login
```

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_... ADMIN_EMAILS=you@example.com
```

```bash
supabase functions deploy payments --no-verify-jwt
```

The function's address is `https://YOUR_PROJECT_REF.supabase.co/functions/v1/payments`.

Optional secrets:
- `ALLOWED_ORIGINS`: sites allowed to call it. Defaults to the GitHub Pages site plus localhost.
- `PRICE_TIERS`: JSON like `[{"n":1,"price":1},{"n":10,"price":7}]` to change prices without a redeploy.
- `MAX_PER_ORDER`: defaults to 20.
- `CURRENCY`: defaults to `usd`.

## 3. Webhook (optional for now)
Stripe > Developers > Webhooks > add endpoint `…/functions/v1/payments/webhook`, events `payment_intent.*`.

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

Events are logged now; Phase 2 stores them against tiles.

## 4. Switch the site on
GitHub repo > Settings > Secrets and variables > Actions > **Variables** (not secrets; both are safe to be public):
- `PAYMENTS_URL` = the function address from step 2
- `STRIPE_PUBLISHABLE_KEY` = `pk_test_…`

Push or re-run the Pages workflow. For local runs, put the same two values in `.env.local` as `NEXT_PUBLIC_PAYMENTS_URL` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

## 5. Test
- Card `4242 4242 4242 4242`, any future date, any CVC.
- One square: Stripe dashboard shows "Uncaptured". Sign in to Admin (see admin-signin.md), approve, and it becomes "Succeeded". Reject and it becomes "Canceled".

## Known gaps until Phase 2
- Credits live in the buyer's browser, so they can be lost or edited. Phase 2 moves them to the database.
