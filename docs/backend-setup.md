# Going live: database and payments

This turns the site from a demo (everything saved in each visitor's browser) into a real shop: orders, tiles and money live in a database, and buyers pay by card.

- **Database, sign-in and file storage:** Supabase
- **Card payments:** Stripe (UK account)
- **Emails to buyers:** Resend, through Supabase
- **Website:** GitHub Pages, as now

Until step 6 is done the live site stays in demo mode, so nothing breaks while you set this up.

Allow about an hour. The only command-line tool you need is the Supabase CLI (`npm i -g supabase`, or `brew install supabase/tap/supabase`).

---

## 1. Supabase project (10 minutes)

1. Sign up at supabase.com. Create a project:
   - Name: `tessera`
   - Region: **London (eu-west-2)**
   - Save the database password somewhere safe.
2. **Plan:** the Free plan is fine while testing. It pauses after a week without visits and has 1 GB of file storage. Move to **Pro ($25 a month)** before you take real orders.
3. In a terminal, in this repository's folder:

   ```bash
   supabase login
   ```

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

   The project ref is the code in your project's URL: `https://YOUR_PROJECT_REF.supabase.co`.

   ```bash
   supabase db push
   ```

   This creates every table, security rule, function and storage bucket from `supabase/migrations/`.
4. In the Supabase dashboard:
   - **Authentication > Sign In / Providers:**
     - Turn on **Allow anonymous sign-ins**. Guests and buyers are signed in quietly, so the database can tell them apart without asking them to make an account.
     - Keep **Email** on.
     - Keep **Allow new users to sign up** on, because anonymous sign-in needs it. Admin rights come only from the admin list in step 4, never from signing up.
   - **Authentication > URL Configuration:**
     - Site URL: `https://rachelcooray.github.io/tessera-murals/`
     - Redirect URLs: add `https://rachelcooray.github.io/tessera-murals/**`, plus `http://localhost:3000/**` for local work.
   - **Authentication > Attack Protection:** turn on CAPTCHA (Cloudflare Turnstile, free) before launch. It stops bots from creating thousands of guest sessions.

## 2. Email (10 minutes)

Supabase's built-in email only sends to your own team's addresses, a few an hour. Buyers need real email, for example the link that lets them open their mosaic on another device.

1. Sign up at resend.com (the free plan covers 3,000 emails a month). Add and verify your domain, then create an API key.
2. In Supabase, go to **Authentication > Emails > SMTP Settings** and turn on custom SMTP:
   - Host: `smtp.resend.com`
   - Port: `465`
   - User: `resend`
   - Password: your Resend API key
   - Sender: `hello@yourdomain`
3. **Authentication > Emails > Templates:** reword the "Confirm email change" and "Magic link" emails in Tessera's voice, for example "Confirm your email to keep your mosaic".

## 3. Stripe (15 minutes)

1. Sign up at stripe.com as a UK business (a sole trader is fine). Stay in **test mode** (the toggle at the top) until everything works.
2. Go to **Developers > API keys** and copy:
   - the **publishable key** (`pk_test_…`)
   - the **secret key** (`sk_test_…`). It never goes in the website or in Git.
3. Go to **Developers > Webhooks > Add endpoint**:
   - URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/orders/webhook`
   - Events: `payment_intent.succeeded` and `payment_intent.payment_failed`
   - Then copy the **signing secret** (`whsec_…`).
4. **Currency:** prices are charged in US dollars (`ORDER_RULES.currency` in `supabase/functions/_shared/tiers.ts`). If most buyers are in the UK, consider switching to `gbp` and pricing in pounds: Stripe charges a currency conversion fee on USD payments that pay out in GBP. Changing it is one line plus the prices in the same file.
5. **Fees:** check Stripe's UK pricing page. Roughly 1.5% + 20p for standard UK cards, and more for EU and international cards.

## 4. Server functions and secrets (10 minutes)

The functions are the only code that can charge cards and move money.

1. Generate a long random string for the hourly job: `openssl rand -hex 32`.
2. Set the secrets:

   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... CRON_SECRET=the-random-string ALLOWED_ORIGINS=https://rachelcooray.github.io,http://localhost:3000
   ```

3. Deploy the functions:

   ```bash
   supabase functions deploy orders
   ```

   ```bash
   supabase functions deploy money
   ```

4. Make yourself an admin. In the Supabase dashboard:
   - **Authentication > Users > Add user:** your email and a long password, with "Auto confirm" ticked.
   - **SQL Editor:** run

     ```sql
     insert into admins (email) values ('you@example.com');
     ```

     Use lower case. To remove an admin later, delete their row.

## 5. The hourly job (5 minutes)

Every hour, the `money` function does the scheduled work:
- studio fill two days before each reveal date
- reveals on the date
- shares the artist pool a week after each reveal
- releases earnings when their hold ends
- cancels orders that were never paid

To schedule it:

1. **Database > Extensions:** turn on `pg_cron` and `pg_net`.
2. **SQL Editor:** run this, with your project ref and the CRON_SECRET from step 4:

   ```sql
   select cron.schedule('tessera-hourly', '7 * * * *', $$
     select net.http_post(
       url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/money/tick',
       headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', 'the-random-string'),
       body := '{}'::jsonb)
   $$);
   ```

3. Check it the next hour under **Integrations > Cron > Jobs** (or `select * from cron.job_run_details order by start_time desc limit 5;`).

## 6. Switch the website on (5 minutes)

On GitHub, go to the repository's **Settings > Secrets and variables > Actions > Variables** and add these three. They're safe to be public; the database rules decide what anyone can do.

- `SUPABASE_URL` = `https://YOUR_PROJECT_REF.supabase.co`
- `SUPABASE_ANON_KEY` = the **anon public** key, from Supabase **Project Settings > API**
- `STRIPE_PUBLISHABLE_KEY` = `pk_test_…`

Then re-run the Pages workflow (**Actions > Deploy > Run workflow**). The footer's "Demo" note disappears once the site is live.

## 7. Test it end to end (15 minutes)

1. Order a Small mosaic. Pay with Stripe's test card `4242 4242 4242 4242`, any future date, any CVC.
2. On your dashboard, copy the invite link. Open it in a private window, take a colour, and paint or upload a tile.
3. Sign in at `/admin/` and open **Mosaics admin**. Accept the tile.
4. Back on the dashboard: **Finish now with studio fill**, then **Reveal it now**. Open the reveal and make the video.
5. In Stripe, check the payment is **Succeeded**. In Supabase **Table Editor > mosaics**, check the order is `revealed`.

## 8. Go live with real cards

1. In Stripe, complete the account details and switch to **live mode**. Then:
   - Copy the live keys (`pk_live_…`, `sk_live_…`).
   - Add the same webhook in live mode and copy its new `whsec_…` secret.
2. Set the live secret and webhook secret:

   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_...
   ```

   Then change the `STRIPE_PUBLISHABLE_KEY` variable on GitHub to `pk_live_…` and re-run the Pages workflow.
3. Place one real Small order yourself, then refund it from the Stripe dashboard.

---

## How it fits together

- **Buyers and guests** are signed in anonymously the moment they open the site. A buyer who adds an email at checkout gets a confirmation link. Once confirmed, they can sign in from any device at `/mine/`.
- **The hidden picture stays hidden.** The full colour grid is readable only by the buyer and admins. Guests get exactly one slot colour from the server. Tests in `tests/db/` check this.
- **Prices come from the server** (`supabase/functions/_shared/tiers.ts`). The website reads the same file, so what buyers see is what they pay.
- **An order counts only when Stripe says it's paid,** for the right amount. The webhook makes sure of this even if the buyer closes the tab. Unpaid orders are cancelled after 48 hours.
- **Every tile is reviewed by an admin.** Slots, holds, the hourly limit, duplicate checks and artist caps are enforced by the database, not the browser.
- **Artist payouts:** artists request a payout; you pay them by hand (bank transfer, PayPal), then press Approve and enter the reference. No payout provider is connected yet.

## Running it on your computer

You'll need Docker, plus the Supabase CLI.

1. Start Supabase:

   ```bash
   supabase start
   ```

2. Serve the functions. Put `PAYMENTS_TEST_MODE=true` and `CRON_SECRET=anything` in `supabase/functions/.env` (this file isn't committed), then run:

   ```bash
   supabase functions serve
   ```

3. Start the site:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start> npm run dev
   ```

4. Run the tests:

   ```bash
   npm run test:db
   ```

   ```bash
   node tests/e2e/live-order.e2e.mjs path/to/photo.jpg path/to/tile.jpg
   ```

`PAYMENTS_TEST_MODE=true` lets orders through without a card. Never set it on the real project.

## Costs at launch

- **Supabase Pro:** $25 a month. It includes 8 GB of database and 100 GB of file storage. A tile takes about 5 KB of storage and 1 KB of database, so that's millions of tiles.
- **Resend:** free up to 3,000 emails a month.
- **Stripe:** per transaction only, no monthly fee.
- **GitHub Pages:** free.
