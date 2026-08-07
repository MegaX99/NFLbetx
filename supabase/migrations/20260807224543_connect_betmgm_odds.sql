alter table public.games
  add column if not exists odds_event_id text,
  add column if not exists spread_source text,
  add column if not exists spread_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'games_spread_source_length'
      and conrelid = 'public.games'::regclass
  ) then
    alter table public.games
      add constraint games_spread_source_length
      check (spread_source is null or char_length(spread_source) between 1 and 40);
  end if;
end $$;

create or replace function private.protect_game_spread_after_pick()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and not exists (
       select 1
       from public.pools
       where season = old.season
         and commissioner_id = (select auth.uid())
     ) then
    raise exception 'Only a commissioner can change a game spread';
  end if;

  if old.home_spread is distinct from new.home_spread
     and old.spread_source is not null
     and exists (
       select 1 from public.picks where game_id = old.id
     ) then
    raise exception 'Game spread is frozen after the first pick';
  end if;
  return new;
end;
$$;

revoke execute on function private.protect_game_spread_after_pick()
from public, anon, authenticated, service_role;

drop trigger if exists games_protect_spread_after_pick on public.games;
create trigger games_protect_spread_after_pick
before update of home_spread on public.games
for each row execute function private.protect_game_spread_after_pick();

create policy "Commissioners can update future game spreads"
on public.games for update
to authenticated
using (
  now() < kickoff_at
  and exists (
    select 1 from public.pools p
    where p.season = games.season
      and p.commissioner_id = (select auth.uid())
  )
)
with check (
  now() < kickoff_at
  and exists (
    select 1 from public.pools p
    where p.season = games.season
      and p.commissioner_id = (select auth.uid())
  )
);

grant update (home_spread, odds_event_id, spread_source, spread_updated_at)
on public.games to authenticated;

drop policy if exists "Owners can submit picks before kickoff" on public.picks;
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
      and g.spread_source is not null
      and now() < g.kickoff_at
  )
);

drop policy if exists "Owners can change picks before kickoff" on public.picks;
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
      and g.spread_source is not null
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
      and g.spread_source is not null
      and now() < g.kickoff_at
  )
);

