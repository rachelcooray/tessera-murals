# Admin sign-in (Supabase Auth)

Until the settings below are in place, `/admin` stays open to anyone with the link and says so at the top. Everything there only changes that one browser, so nobody can affect the real wall, but switch sign-in on before you share the site widely.

## 1. Supabase project
1. Create a project at supabase.com (the same one the payments server uses).
2. Authentication > Sign In / Providers: keep **Email** on and turn **Allow new users to sign up** off. Only people you add can sign in.
3. Authentication > Users > **Add user**: your email and a long password, with "Auto confirm" ticked.
4. Authentication > URL Configuration: set Site URL to `https://rachelcooray.github.io/tessera-murals/` and add `https://rachelcooray.github.io/tessera-murals/admin/` (plus `http://localhost:3000/admin/` for local work) under Redirect URLs, so password reset links work.
5. Project Settings > API: copy the **Project URL** and the **anon public** key.

## 2. Tell the site
GitHub repo > Settings > Secrets and variables > Actions > **Variables**:
- `SUPABASE_URL` = Project URL
- `SUPABASE_ANON_KEY` = anon public key (safe to be public; it can't do anything your Supabase rules don't allow)
- `ADMIN_EMAILS` = your admin email, comma-separated if more than one

Re-run the Pages workflow. Locally, use `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_ADMIN_EMAILS`.

## 3. Tell the payments server
Approving and rejecting send your session to the payments server, which checks it against its own list:

```bash
supabase secrets set ADMIN_EMAILS=you@example.com
```

## What this protects today
- Only your accounts can open the admin screens.
- Only a signed-in admin can capture or release card holds.
- Tiles, reports and prices still live in each browser until Phase 2 moves them to the database with row-level security.
