-- Tessera hidden mosaics: tables, security rules and server functions.
--
-- The one rule everything here protects: before the reveal, nobody but the buyer (and admins)
-- can see the picture. The full slot colour grid IS the picture, so guests never read the
-- mosaics table. They go through the functions below, which hand out one slot colour at a time.
--
-- Clients only ever write through these functions or the Edge Functions (which use the service role).

-- ---------------------------------------------------------------- settings

create table public.settings (
  key text primary key,
  value jsonb not null
);
insert into public.settings (key, value) values
  ('slot_hold_hours', '48'),
  ('submissions_per_hour', '20'),
  ('duplicate_hamming_max', '6'),
  ('artist_min_cap', '10'),
  ('artist_cap_percent', '3'),
  ('favourites_max', '5');

create function public.setting_int(k text) returns int
language sql stable security definer set search_path = public as $$
  select (value #>> '{}')::int from settings where key = k
$$;

-- ---------------------------------------------------------------- admins

create table public.admins (
  email text primary key check (email = lower(email))
);

-- True for a signed-in, non-anonymous user whose (verified) email is on the admin list.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and exists (select 1 from admins a where a.email = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;

-- ---------------------------------------------------------------- mosaics

create table public.mosaics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete restrict,
  email text not null check (email ~ '^\S+@\S+\.\S+$'),
  title text not null check (char_length(title) between 1 and 60),
  occasion text not null check (occasion in ('wedding', 'birthday', 'portrait', 'company', 'memorial', 'other')),
  tier_id text not null,
  cols int not null check (cols between 10 and 400),
  rows int not null check (rows between 10 and 400),
  price_cents int not null check (price_cents >= 0),
  currency text not null default 'usd',
  pool_cents int not null default 0 check (pool_cents >= 0),
  created_at timestamptz not null default now(),
  reveal_at timestamptz not null,
  visibility text not null check (visibility in ('public', 'private')),
  open_to_artists boolean not null default true,
  invite_token text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  -- Path in the "targets" bucket. Only the owner and admins can read it.
  target_path text not null,
  -- One "rrggbb" per slot, row by row. This is the picture: never readable by guests.
  slots_packed text not null,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'collecting', 'revealed', 'cancelled')),
  revealed_at timestamptz,
  favourites int[] not null default '{}',
  split_at timestamptz,
  -- Base64 bitmap of studio-filled slots (same format as src/lib/mosaic/bits.ts).
  studio_slots text,
  studio_at timestamptz,
  payment_intent_id text unique,
  payment_mock boolean not null default false,
  paid_at timestamptz,
  check (char_length(slots_packed) = cols * rows * 6),
  check (slots_packed ~ '^[0-9a-f]*$')
);
create index mosaics_owner on public.mosaics (owner_id);
create index mosaics_status on public.mosaics (status);

-- ---------------------------------------------------------------- tiles

create table public.tiles (
  id uuid primary key default gen_random_uuid(),
  mosaic_id uuid not null references public.mosaics (id) on delete cascade,
  slot int not null check (slot >= 0),
  contributor_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('circle', 'artist')),
  name text check (char_length(name) <= 40),
  medium text check (char_length(medium) <= 40),
  -- A tiny copy (about 24 px) for drawing the whole grid; the full tile is in Storage.
  thumb text not null check (thumb like 'data:image/%' and char_length(thumb) < 6000),
  image_path text not null,
  average_hex text not null check (average_hex ~ '^#[0-9a-f]{6}$'),
  match real not null,
  tint real not null,
  hash text check (hash ~ '^[0-9a-f]{16}$'),
  flags text[] not null default '{}',
  painted jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
-- At most one live tile per slot, enforced by the database rather than by care.
create unique index tiles_one_live_per_slot on public.tiles (mosaic_id, slot) where status in ('pending', 'approved');
create index tiles_contributor on public.tiles (contributor_id, created_at);
create index tiles_mosaic_status on public.tiles (mosaic_id, status);

-- ---------------------------------------------------------------- claims

create table public.claims (
  mosaic_id uuid not null references public.mosaics (id) on delete cascade,
  slot int not null,
  contributor_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('circle', 'artist')),
  at timestamptz not null default now(),
  primary key (mosaic_id, contributor_id)
);
create unique index claims_one_per_slot on public.claims (mosaic_id, slot);

-- ---------------------------------------------------------------- artists and money

create table public.artists (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  portfolio text not null default '' check (char_length(portfolio) <= 200),
  joined_at timestamptz not null default now(),
  payout_method text not null default 'unset' check (payout_method in ('bank', 'paypal', 'payoneer', 'unset')),
  payout_name text not null default '' check (char_length(payout_name) <= 120),
  country text not null default '' check (char_length(country) <= 60)
);

-- Append-only earnings ledger, written only by the money Edge Function (see _shared/ledger.ts).
create table public.ledger (
  id text primary key,
  artist_id uuid not null references auth.users (id),
  mosaic_id uuid references public.mosaics (id),
  kind text not null check (kind in ('share', 'release', 'reversal', 'request', 'paid', 'returned')),
  amount_cents int not null check (amount_cents >= 0),
  at timestamptz not null default now(),
  release_at timestamptz,
  tiles int,
  favourites int,
  weight int,
  ref text,
  note text,
  tile_id uuid
);
create index ledger_artist on public.ledger (artist_id);

create table public.revenue (
  id text primary key,
  mosaic_id uuid references public.mosaics (id),
  cents int not null,
  reason text not null,
  at timestamptz not null default now()
);

-- Stripe webhook events already handled, so a retried event never applies twice.
create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- row level security

alter table public.settings enable row level security;
alter table public.admins enable row level security;
alter table public.mosaics enable row level security;
alter table public.tiles enable row level security;
alter table public.claims enable row level security;
alter table public.artists enable row level security;
alter table public.ledger enable row level security;
alter table public.revenue enable row level security;
alter table public.stripe_events enable row level security;

create policy "settings readable" on public.settings for select using (true);

create policy "owner or admin reads mosaic" on public.mosaics for select
  using (owner_id = auth.uid() or public.is_admin());

create policy "contributor, owner or admin reads tile" on public.tiles for select
  using (
    contributor_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.mosaics m where m.id = mosaic_id and m.owner_id = auth.uid())
  );

create policy "own claims" on public.claims for select using (contributor_id = auth.uid());

create policy "own artist profile" on public.artists for select using (id = auth.uid() or public.is_admin());
create policy "create own artist profile" on public.artists for insert with check (id = auth.uid());
create policy "edit own artist profile" on public.artists for update using (id = auth.uid()) with check (id = auth.uid());

create policy "own ledger" on public.ledger for select using (artist_id = auth.uid() or public.is_admin());
create policy "admin revenue" on public.revenue for select using (public.is_admin());
-- admins and stripe_events: no client access at all.

-- ---------------------------------------------------------------- helpers

create function public._slot_hex(m public.mosaics, s int) returns text
language sql immutable as $$ select '#' || substr(m.slots_packed, s * 6 + 1, 6) $$;

create function public._studio_has(m public.mosaics, s int) returns boolean
language sql immutable as $$
  select m.studio_slots is not null and get_bit(decode(m.studio_slots, 'base64'), s) = 1
$$;

create function public._studio_count(m public.mosaics) returns int
language sql immutable as $$
  select coalesce(bit_count(decode(m.studio_slots, 'base64'))::int, 0)
$$;

create function public._artist_cap(m public.mosaics) returns int
language sql stable as $$
  select greatest(public.setting_int('artist_min_cap'), (m.cols * m.rows * public.setting_int('artist_cap_percent')) / 100)
$$;

create function public._drop_expired_claims(p_mosaic uuid) returns void
language sql security definer set search_path = public as $$
  delete from claims where mosaic_id = p_mosaic and at < now() - make_interval(hours => public.setting_int('slot_hold_hours'))
$$;

-- Slots that are not free: a live tile, studio fill, or someone else's active claim.
create function public._taken_slots(m public.mosaics, p_for uuid) returns table (slot int)
language sql stable security definer set search_path = public as $$
  select t.slot from tiles t where t.mosaic_id = m.id and t.status in ('pending', 'approved')
  union
  select c.slot from claims c where c.mosaic_id = m.id and c.contributor_id is distinct from p_for
    and c.at >= now() - make_interval(hours => public.setting_int('slot_hold_hours'))
  union
  select s from generate_series(0, m.cols * m.rows - 1) s where m.studio_slots is not null and public._studio_has(m, s)
$$;

-- Can this caller take part, and as what? Raises a friendly error if not.
create function public._check_access(m public.mosaics, p_token text, p_source text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please reload the page and try again.' using errcode = '28000'; end if;
  if m.id is null then raise exception 'This link doesn''t work.' using errcode = 'P0002'; end if;
  if m.status <> 'collecting' then raise exception 'This mosaic isn''t collecting tiles.' using errcode = 'P0001'; end if;
  if p_source = 'circle' then
    if p_token is distinct from m.invite_token then raise exception 'This invite link isn''t right.' using errcode = '28000'; end if;
  elsif p_source = 'artist' then
    if not m.open_to_artists then raise exception 'This mosaic isn''t open to Tessera artists.' using errcode = '28000'; end if;
    if not exists (select 1 from artists a where a.id = auth.uid()) then raise exception 'Set up your artist profile first.' using errcode = '28000'; end if;
  else
    raise exception 'Unknown source' using errcode = '22023';
  end if;
end $$;

create function public._artist_tiles(p_mosaic uuid, p_uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from tiles where mosaic_id = p_mosaic and contributor_id = p_uid and source = 'artist' and status in ('pending', 'approved')
$$;

-- ---------------------------------------------------------------- guest functions

-- What a guest may know about a mosaic: never the slot grid or the target.
create function public.join_info(p_mosaic uuid, p_token text default null, p_source text default 'circle') returns jsonb
language plpgsql security definer set search_path = public as $$
declare m mosaics; c claims;
begin
  select * into m from mosaics where id = p_mosaic;
  if m.id is null then return null; end if;
  if m.status = 'revealed' or m.status = 'collecting' and (
       (p_source = 'circle' and p_token = m.invite_token) or (p_source = 'artist' and m.open_to_artists)) then
    perform _drop_expired_claims(m.id);
    select * into c from claims where mosaic_id = m.id and contributor_id = auth.uid();
    return jsonb_build_object(
      'id', m.id, 'title', m.title, 'occasion', m.occasion, 'cols', m.cols, 'rows', m.rows,
      'revealAt', m.reveal_at, 'status', m.status, 'openToArtists', m.open_to_artists,
      'claim', case when c.slot is null then null else jsonb_build_object('slot', c.slot, 'hex', _slot_hex(m, c.slot), 'source', c.source, 'at', c.at) end,
      'artistTiles', _artist_tiles(m.id, auth.uid()),
      'artistCap', _artist_cap(m),
      'isArtist', exists (select 1 from artists a where a.id = auth.uid())
    );
  end if;
  -- Wrong token: say only that it exists and its state.
  return jsonb_build_object('id', m.id, 'status', case when m.status = 'collecting' then 'locked' else m.status end);
end $$;

-- Claim a slot: a given one (artists from the challenge), the closest colour to p_hex
-- ("I already have a picture"), or a random free one. Returns the slot and its colour.
create function public.claim_slot(p_mosaic uuid, p_token text default null, p_source text default 'circle', p_slot int default null, p_hex text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m mosaics; chosen int; n int;
begin
  -- Lock the mosaic so two people can't be handed the same slot.
  select * into m from mosaics where id = p_mosaic for update;
  perform _check_access(m, p_token, p_source);
  if p_source = 'artist' and _artist_tiles(m.id, auth.uid()) >= _artist_cap(m) then
    raise exception 'You''ve reached the % tile limit for this mosaic.', _artist_cap(m) using errcode = 'P0001';
  end if;
  perform _drop_expired_claims(m.id);
  delete from claims where mosaic_id = m.id and contributor_id = auth.uid();
  n := m.cols * m.rows;

  if p_slot is not null then
    if p_slot < 0 or p_slot >= n or p_slot in (select slot from _taken_slots(m, auth.uid())) then
      raise exception 'That slot was just taken.' using errcode = 'P0001';
    end if;
    chosen := p_slot;
  elsif p_hex is not null then
    if p_hex !~ '^#[0-9a-f]{6}$' then raise exception 'Bad colour' using errcode = '22023'; end if;
    -- Same weighting as colourDistance in src/lib/colour.ts. The grid is decoded once and the maths
    -- done inline: a function call per slot was ~400x slower on a 40,000-slot mosaic.
    with px as (select decode(m.slots_packed, 'hex') as b),
         want as (select ('x' || substr(p_hex, 2, 2))::bit(8)::int as r, ('x' || substr(p_hex, 4, 2))::bit(8)::int as g,
                         ('x' || substr(p_hex, 6, 2))::bit(8)::int as bl),
         c as (select s, get_byte(px.b, s * 3) as r, get_byte(px.b, s * 3 + 1) as g, get_byte(px.b, s * 3 + 2) as bl
               from px, generate_series(0, n - 1) s
               where s not in (select slot from _taken_slots(m, auth.uid())))
    select c.s into chosen from c, want w
      order by (2 + (c.r + w.r) / 512.0) * (c.r - w.r) ^ 2 + 4 * (c.g - w.g) ^ 2 + (2 + (255 - (c.r + w.r) / 2.0) / 256) * (c.bl - w.bl) ^ 2
      limit 1;
  else
    select s into chosen from generate_series(0, n - 1) s
      where s not in (select slot from _taken_slots(m, auth.uid()))
      order by random() limit 1;
  end if;
  if chosen is null then raise exception 'Every slot is taken or in review right now. Try again later.' using errcode = 'P0001'; end if;

  insert into claims (mosaic_id, slot, contributor_id, source) values (m.id, chosen, auth.uid(), p_source);
  return jsonb_build_object('slot', chosen, 'hex', _slot_hex(m, chosen), 'source', p_source, 'at', now());
end $$;

create function public.release_claim(p_mosaic uuid) returns void
language sql security definer set search_path = public as $$
  delete from claims where mosaic_id = p_mosaic and contributor_id = auth.uid()
$$;

-- Turns a tiles row into the shape the website uses (MosaicTile in src/lib/mosaic/types.ts).
create function public._tile_json(t public.tiles) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', t.id, 'mosaicId', t.mosaic_id, 'slot', t.slot, 'contributorId', t.contributor_id, 'source', t.source,
    'name', t.name, 'medium', t.medium, 'imageUrl', t.thumb, 'imagePath', t.image_path, 'art', null,
    'averageHex', t.average_hex, 'match', t.match, 'tint', t.tint, 'hash', t.hash, 'flags', to_jsonb(t.flags),
    'painted', t.painted, 'status', t.status, 'rejectionReason', t.rejection_reason,
    'createdAt', t.created_at, 'reviewedAt', t.reviewed_at)
$$;

create function public.submit_tile(
  p_mosaic uuid, p_token text, p_source text, p_slot int,
  p_name text, p_medium text, p_thumb text, p_image_path text,
  p_average_hex text, p_match real, p_tint real, p_hash text, p_flags text[], p_painted jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m mosaics; c claims; t tiles; recent int; dup int;
begin
  select * into m from mosaics where id = p_mosaic for update;
  perform _check_access(m, p_token, p_source);
  select * into c from claims where mosaic_id = m.id and contributor_id = auth.uid()
    and at >= now() - make_interval(hours => setting_int('slot_hold_hours'));
  if c.slot is null or c.slot <> p_slot then
    raise exception 'Your hold on this slot ran out. Go back and pick a colour again.' using errcode = 'P0001';
  end if;
  select count(*) into recent from tiles where contributor_id = auth.uid() and created_at > now() - interval '1 hour';
  if recent >= setting_int('submissions_per_hour') then
    raise exception 'You''ve sent a lot of tiles in the last hour. Please try again a little later.' using errcode = 'P0001';
  end if;
  if p_source = 'artist' and _artist_tiles(m.id, auth.uid()) >= _artist_cap(m) then
    raise exception 'You''ve reached the % tile limit for this mosaic.', _artist_cap(m) using errcode = 'P0001';
  end if;
  if p_hash is not null then
    select count(*) into dup from tiles
      where contributor_id = auth.uid() and hash is not null and status <> 'rejected'
        and bit_count(('x' || hash)::bit(64) # ('x' || p_hash)::bit(64)) <= setting_int('duplicate_hamming_max');
    if dup > 0 then
      raise exception 'This looks almost the same as a tile you''ve already sent. Each tile needs to be its own piece.' using errcode = 'P0001';
    end if;
  end if;
  if p_image_path is null or split_part(p_image_path, '/', 1) <> auth.uid()::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'tiles' and o.name = p_image_path) then
    raise exception 'Your tile image didn''t upload. Please try again.' using errcode = 'P0001';
  end if;

  insert into tiles (mosaic_id, slot, contributor_id, source, name, medium, thumb, image_path, average_hex, match, tint, hash, flags, painted)
  values (m.id, p_slot, auth.uid(), p_source, nullif(trim(p_name), ''), p_medium, p_thumb, p_image_path, lower(p_average_hex),
          p_match, p_tint, p_hash, coalesce(p_flags, '{}'), p_painted)
  returning * into t;
  delete from claims where mosaic_id = m.id and contributor_id = auth.uid();
  return _tile_json(t);
end $$;

-- ---------------------------------------------------------------- owner functions

create function public._owned(p_id uuid) returns public.mosaics
language plpgsql security definer set search_path = public as $$
declare m mosaics;
begin
  select * into m from mosaics where id = p_id for update;
  if m.id is null or (m.owner_id <> auth.uid() and not is_admin()) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  return m;
end $$;

create function public.set_open_to_artists(p_id uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _owned(p_id);
  update mosaics set open_to_artists = p_on where id = p_id;
end $$;

create function public.toggle_favourite(p_id uuid, p_slot int) returns text
language plpgsql security definer set search_path = public as $$
declare m mosaics;
begin
  m := _owned(p_id);
  if m.status <> 'revealed' then return 'Favourites open after the reveal.'; end if;
  if m.split_at is not null then return 'The artist pool has already been shared out.'; end if;
  if p_slot = any (m.favourites) then
    update mosaics set favourites = array_remove(favourites, p_slot) where id = p_id;
  elsif cardinality(m.favourites) >= setting_int('favourites_max') then
    return format('You can favourite up to %s tiles.', setting_int('favourites_max'));
  else
    update mosaics set favourites = favourites || p_slot where id = p_id;
  end if;
  return null;
end $$;

-- Fills every slot without a live tile. Pending tiles keep their slot. Returns how many were filled.
create function public._studio_fill(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare m mosaics; n int; before int; bitmap bytea;
begin
  select * into m from mosaics where id = p_id for update;
  if m.status <> 'collecting' then return 0; end if;
  n := m.cols * m.rows;
  before := _studio_count(m);
  select decode(string_agg(lpad(to_hex(b.v), 2, '0'), '' order by b.i), 'hex') into bitmap
  from (
    select s / 8 as i, sum(case when public._studio_has(m, s) or live.slot is null then 1 << (s % 8) else 0 end)::int as v
    from generate_series(0, n - 1) s
    left join (select slot from tiles where mosaic_id = m.id and status in ('pending', 'approved')) live on live.slot = s
    group by s / 8
  ) b;
  update mosaics set studio_slots = encode(bitmap, 'base64'), studio_at = now() where id = m.id;
  delete from claims where mosaic_id = m.id;
  select * into m from mosaics where id = p_id;
  return _studio_count(m) - before;
end $$;
revoke execute on function public._studio_fill(uuid) from public, anon, authenticated;

create function public.studio_fill(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
begin
  perform _owned(p_id);
  return _studio_fill(p_id);
end $$;

create function public._is_complete(m public.mosaics) returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from tiles where mosaic_id = m.id and status = 'approved') + _studio_count(m) >= m.cols * m.rows
$$;

create function public._reveal(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare m mosaics;
begin
  select * into m from mosaics where id = p_id for update;
  if m.status <> 'collecting' then return 'This mosaic isn''t collecting.'; end if;
  if not _is_complete(m) then return 'Some slots are still empty or in review.'; end if;
  update mosaics set status = 'revealed', revealed_at = now() where id = p_id;
  delete from claims where mosaic_id = p_id;
  return null;
end $$;
revoke execute on function public._reveal(uuid) from public, anon, authenticated;

create function public.reveal_now(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform _owned(p_id);
  return _reveal(p_id);
end $$;

-- ---------------------------------------------------------------- admin functions

create function public.review_tile(p_tile uuid, p_ok boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  update tiles set status = case when p_ok then 'approved' else 'rejected' end,
                   rejection_reason = case when p_ok then null else p_reason end,
                   reviewed_at = now()
   where id = p_tile and status = 'pending';
end $$;

-- Removing a tile after a report. Any pool reversal is done by the money function's next run.
create function public.remove_tile(p_tile uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  update tiles set status = 'removed', rejection_reason = p_note, reviewed_at = now() where id = p_tile and status = 'approved';
end $$;

create function public.am_admin() returns boolean
language sql stable security definer set search_path = public as $$ select is_admin() $$;

-- ---------------------------------------------------------------- public reads

-- A revealed mosaic, for its reveal and tile pages. Private ones are "anyone with the link".
create function public.revealed_mosaic(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'title', m.title, 'occasion', m.occasion, 'tierId', m.tier_id, 'cols', m.cols, 'rows', m.rows,
    'revealAt', m.reveal_at, 'revealedAt', m.revealed_at, 'createdAt', m.created_at, 'visibility', m.visibility,
    'status', m.status, 'slotsPacked', m.slots_packed, 'studioSlots', m.studio_slots, 'studioAt', m.studio_at,
    'favourites', to_jsonb(m.favourites), 'splitAt', m.split_at,
    -- contributorId becomes a code unique to this mosaic: enough to count people, not to follow them around.
    'tiles', coalesce((select jsonb_agg((_tile_json(t) - 'hash' - 'flags' - 'painted' - 'rejectionReason')
                                        || jsonb_build_object('contributorId', md5(t.contributor_id::text || m.id::text)))
                       from tiles t where t.mosaic_id = m.id and t.status = 'approved'), '[]'::jsonb))
  from mosaics m where m.id = p_id and m.status = 'revealed'
$$;

-- What anyone can see before the reveal: the title and the date.
create function public.mosaic_teaser(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'title', title, 'revealAt', reveal_at, 'status', status, 'cols', cols, 'rows', rows)
  from mosaics where id = p_id and status in ('collecting', 'revealed')
$$;

create function public.public_mosaics() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'occasion', occasion, 'cols', cols, 'rows', rows, 'revealedAt', revealed_at) order by revealed_at desc), '[]'::jsonb)
  from mosaics where status = 'revealed' and visibility = 'public'
$$;

-- Open slots across mosaics that welcome artists: one colour each, never enough to see a picture.
create function public.challenge_slots(p_limit int default 12) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb := '[]'::jsonb; m mosaics; s int; per int;
begin
  per := greatest(1, least(p_limit, 24) / greatest(1, (select count(*) from mosaics where status = 'collecting' and open_to_artists)::int));
  for m in select * from mosaics where status = 'collecting' and open_to_artists order by random() limit 24 loop
    for s in select g from generate_series(0, m.cols * m.rows - 1) g
               where g not in (select slot from _taken_slots(m, auth.uid())) order by random() limit per loop
      out := out || jsonb_build_object('mosaicId', m.id, 'title', m.title, 'occasion', m.occasion, 'revealAt', m.reveal_at,
                                       'slot', s, 'hex', _slot_hex(m, s), 'total', m.cols * m.rows);
    end loop;
    exit when jsonb_array_length(out) >= p_limit;
  end loop;
  return out;
end $$;

-- ---------------------------------------------------------------- grants

revoke all on all functions in schema public from public, anon;
grant execute on function public.join_info(uuid, text, text), public.claim_slot(uuid, text, text, int, text),
  public.release_claim(uuid), public.submit_tile(uuid, text, text, int, text, text, text, text, text, real, real, text, text[], jsonb),
  public.set_open_to_artists(uuid, boolean), public.toggle_favourite(uuid, int), public.studio_fill(uuid), public.reveal_now(uuid),
  public.review_tile(uuid, boolean, text), public.remove_tile(uuid, text), public.am_admin(), public.challenge_slots(int)
  to authenticated;
grant execute on function public.revealed_mosaic(uuid), public.mosaic_teaser(uuid), public.public_mosaics() to anon, authenticated;
-- Used inside RLS policies, so every role must be able to call them.
grant execute on function public.is_admin(), public.setting_int(text) to anon, authenticated;
revoke execute on function public._studio_fill(uuid), public._reveal(uuid) from authenticated;

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('targets', 'targets', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('tiles', 'tiles', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Everyone uploads only into a folder named after their own user id.
create policy "upload own target" on storage.objects for insert to authenticated
  with check (bucket_id = 'targets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read own target" on storage.objects for select to authenticated
  using (bucket_id = 'targets' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy "upload own tile" on storage.objects for insert to authenticated
  with check (bucket_id = 'tiles' and (storage.foldername(name))[1] = auth.uid()::text);

create function public.can_read_tile_image(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select split_part(p_name, '/', 1) = coalesce(auth.uid()::text, '-')
      or public.is_admin()
      or exists (
        select 1 from tiles t join mosaics m on m.id = t.mosaic_id
        where t.image_path = p_name
          and ((m.status = 'revealed' and t.status = 'approved') or m.owner_id = auth.uid())
      )
$$;
grant execute on function public.can_read_tile_image(text) to anon, authenticated;

create policy "read tile images" on storage.objects for select to anon, authenticated
  using (bucket_id = 'tiles' and public.can_read_tile_image(name));
