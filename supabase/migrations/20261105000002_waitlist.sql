-- The founding list: people who want to hear when orders open (buyers) or when slots open (artists).
-- Anyone can join through join_waitlist(); only admins can read the list.

create table public.waitlist (
  email text primary key check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and char_length(email) <= 200),
  name text check (char_length(name) <= 60),
  occasion text check (occasion in ('wedding', 'birthday', 'portrait', 'company', 'memorial', 'other')),
  wants text not null default 'order' check (wants in ('order', 'paint', 'both')),
  source text check (char_length(source) <= 40),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;
create policy "admins read the list" on public.waitlist for select using (public.is_admin());

create function public.join_waitlist(p_email text, p_name text default null, p_occasion text default null, p_wants text default 'order', p_source text default null, p_consent boolean default false)
returns text
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email));
begin
  if not p_consent then raise exception 'Please tick the box so we can email you.' using errcode = 'P0001'; end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(e) > 200 then raise exception 'That email doesn''t look right.' using errcode = 'P0001'; end if;
  insert into waitlist (email, name, occasion, wants, source)
  values (e, nullif(left(trim(coalesce(p_name, '')), 60), ''), p_occasion, coalesce(p_wants, 'order'), left(p_source, 40))
  on conflict (email) do update set
    name = coalesce(excluded.name, waitlist.name),
    occasion = coalesce(excluded.occasion, waitlist.occasion),
    wants = case when waitlist.wants <> excluded.wants then 'both' else waitlist.wants end,
    consent_at = now();
  return 'ok';
end $$;
revoke all on function public.join_waitlist(text, text, text, text, text, boolean) from public;
grant execute on function public.join_waitlist(text, text, text, text, text, boolean) to anon, authenticated;
