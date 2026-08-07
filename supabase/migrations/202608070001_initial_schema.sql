-- NFLbetx initial Supabase schema
-- Users authenticate through Supabase Auth. Public tables contain only pool data.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  season smallint not null check (season between 2026 and 2100),
  commissioner_id uuid not null references public.profiles(id) on delete restrict,
  entry_fee_cents integer not null default 0 check (entry_fee_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pool_members (
  pool_id uuid not null references public.pools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('commissioner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_name text not null check (char_length(entry_name) between 1 and 60),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pool_id, entry_name)
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  season smallint not null check (season between 2026 and 2100),
  week smallint not null check (week between 1 and 22),
  away_team text not null check (char_length(away_team) between 2 and 4),
  home_team text not null check (char_length(home_team) between 2 and 4),
  kickoff_at timestamptz not null,
  home_spread numeric(4,1) not null check (home_spread between -50 and 50),
  away_score smallint check (away_score >= 0),
  home_score smallint check (home_score >= 0),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'final', 'postponed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season, week, away_team, home_team)
);

create table public.picks (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  selected_side text not null check (selected_side in ('away', 'home')),
  outcome text check (outcome in ('win', 'loss', 'push')),
  points numeric(3,1) check (points in (0, 0.5, 1)),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_id, game_id)
);

create index pool_members_user_id_idx on public.pool_members(user_id);
create index entries_pool_id_idx on public.entries(pool_id);
create index entries_user_id_idx on public.entries(user_id);
create index games_season_week_idx on public.games(season, week);
create index games_kickoff_at_idx on public.games(kickoff_at);
create index picks_entry_id_idx on public.picks(entry_id);
create index picks_game_id_idx on public.picks(game_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger pools_set_updated_at
before update on public.pools
for each row execute function public.set_updated_at();

create trigger entries_set_updated_at
before update on public.entries
for each row execute function public.set_updated_at();

create trigger games_set_updated_at
before update on public.games
for each row execute function public.set_updated_at();

create trigger picks_set_updated_at
before update on public.picks
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Player'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger nflbetx_on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_pool_member(check_pool_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pool_members
    where pool_id = check_pool_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_pool_commissioner(check_pool_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pools
    where id = check_pool_id
      and commissioner_id = (select auth.uid())
  );
$$;

revoke all on function public.is_pool_member(uuid) from public;
revoke all on function public.is_pool_commissioner(uuid) from public;
grant execute on function public.is_pool_member(uuid) to authenticated;
grant execute on function public.is_pool_commissioner(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.pools enable row level security;
alter table public.pool_members enable row level security;
alter table public.entries enable row level security;
alter table public.games enable row level security;
alter table public.picks enable row level security;

create policy "Authenticated users can read profiles"
on public.profiles for select
to authenticated
using (true);

create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Members can read their pools"
on public.pools for select
to authenticated
using (
  commissioner_id = (select auth.uid())
  or public.is_pool_member(id)
);

create policy "Users can create pools they commission"
on public.pools for insert
to authenticated
with check (commissioner_id = (select auth.uid()));

create policy "Commissioners can update pools"
on public.pools for update
to authenticated
using (commissioner_id = (select auth.uid()))
with check (commissioner_id = (select auth.uid()));

create policy "Commissioners can delete pools"
on public.pools for delete
to authenticated
using (commissioner_id = (select auth.uid()));

create policy "Members can read pool membership"
on public.pool_members for select
to authenticated
using (
  public.is_pool_member(pool_id)
  or public.is_pool_commissioner(pool_id)
);

create policy "Commissioners can add pool members"
on public.pool_members for insert
to authenticated
with check (public.is_pool_commissioner(pool_id));

create policy "Commissioners can update pool members"
on public.pool_members for update
to authenticated
using (public.is_pool_commissioner(pool_id))
with check (public.is_pool_commissioner(pool_id));

create policy "Commissioners can remove pool members"
on public.pool_members for delete
to authenticated
using (public.is_pool_commissioner(pool_id));

create policy "Pool members can read entries"
on public.entries for select
to authenticated
using (
  public.is_pool_member(pool_id)
  or public.is_pool_commissioner(pool_id)
);

create policy "Members can create their own entries"
on public.entries for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (
    public.is_pool_member(pool_id)
    or public.is_pool_commissioner(pool_id)
  )
);

create policy "Owners can update their entries"
on public.entries for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Owners can delete their entries"
on public.entries for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "Authenticated users can read games"
on public.games for select
to authenticated
using (true);

create policy "Owners can read picks and members can read locked picks"
on public.picks for select
to authenticated
using (
  exists (
    select 1
    from public.entries e
    where e.id = entry_id
      and e.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.entries e
    join public.games g on g.id = game_id
    where e.id = entry_id
      and now() >= g.kickoff_at
      and (
        public.is_pool_member(e.pool_id)
        or public.is_pool_commissioner(e.pool_id)
      )
  )
);

create policy "Owners can submit picks before kickoff"
on public.picks for insert
to authenticated
with check (
  exists (
    select 1
    from public.entries e
    join public.pools p on p.id = e.pool_id
    join public.games g on g.id = game_id
    where e.id = entry_id
      and e.user_id = (select auth.uid())
      and e.is_active
      and p.season = g.season
      and now() < g.kickoff_at
  )
);

create policy "Owners can change picks before kickoff"
on public.picks for update
to authenticated
using (
  exists (
    select 1
    from public.entries e
    join public.games g on g.id = game_id
    where e.id = entry_id
      and e.user_id = (select auth.uid())
      and e.is_active
      and now() < g.kickoff_at
  )
)
with check (
  exists (
    select 1
    from public.entries e
    join public.games g on g.id = game_id
    where e.id = entry_id
      and e.user_id = (select auth.uid())
      and e.is_active
      and now() < g.kickoff_at
  )
);

create policy "Owners can delete picks before kickoff"
on public.picks for delete
to authenticated
using (
  exists (
    select 1
    from public.entries e
    join public.games g on g.id = game_id
    where e.id = entry_id
      and e.user_id = (select auth.uid())
      and now() < g.kickoff_at
  )
);

revoke all on public.profiles from anon, authenticated;
revoke all on public.pools from anon, authenticated;
revoke all on public.pool_members from anon, authenticated;
revoke all on public.entries from anon, authenticated;
revoke all on public.games from anon, authenticated;
revoke all on public.picks from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select on public.pools to authenticated;
grant insert (name, season, commissioner_id, entry_fee_cents) on public.pools to authenticated;
grant update (name, entry_fee_cents) on public.pools to authenticated;
grant delete on public.pools to authenticated;

grant select on public.pool_members to authenticated;
grant insert (pool_id, user_id, role) on public.pool_members to authenticated;
grant update (role) on public.pool_members to authenticated;
grant delete on public.pool_members to authenticated;

grant select on public.entries to authenticated;
grant insert (pool_id, user_id, entry_name) on public.entries to authenticated;
grant update (entry_name) on public.entries to authenticated;
grant delete on public.entries to authenticated;

grant select on public.games to authenticated;

grant select on public.picks to authenticated;
grant insert (entry_id, game_id, selected_side) on public.picks to authenticated;
grant update (selected_side) on public.picks to authenticated;
grant delete on public.picks to authenticated;
