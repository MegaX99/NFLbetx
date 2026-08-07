alter table public.pools add column if not exists code text;

update public.pools
set code = 'pool-' || id::text
where code is null;

alter table public.pools alter column code set not null;

create unique index if not exists pools_code_key on public.pools (code);
create unique index if not exists entries_pool_id_user_id_key
  on public.entries (pool_id, user_id);

insert into public.pools (id, code, name, season, commissioner_id, entry_fee_cents)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  'nflbetx-2026',
  'NFLbetx 2026',
  2026,
  p.id,
  0
from public.profiles p
order by p.created_at
limit 1
on conflict (id) do update
set code = excluded.code,
    name = excluded.name,
    season = excluded.season,
    commissioner_id = excluded.commissioner_id;

insert into public.pool_members (pool_id, user_id, role)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  p.id,
  case
    when p.id = (
      select commissioner_id
      from public.pools
      where id = '00000000-0000-4000-8000-000000000001'::uuid
    ) then 'commissioner'
    else 'member'
  end
from public.profiles p
on conflict (pool_id, user_id) do nothing;

insert into public.entries (pool_id, user_id, entry_name)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  p.id,
  left(p.display_name, 50) || '-' || left(p.id::text, 8)
from public.profiles p
on conflict (pool_id, user_id) do nothing;

insert into public.games
  (external_id, season, week, away_team, home_team, kickoff_at, home_spread, status)
values
  ('demo-2026-w1-buf-kc', 2026, 1, 'BUF', 'KC', '2026-09-11 00:20:00+00', 2.5, 'scheduled'),
  ('demo-2026-w1-phi-dal', 2026, 1, 'PHI', 'DAL', '2026-09-13 20:25:00+00', -3.5, 'scheduled'),
  ('demo-2026-w1-sf-sea', 2026, 1, 'SF', 'SEA', '2026-09-14 00:20:00+00', -5.5, 'scheduled')
on conflict (season, week, away_team, home_team) do update
set external_id = excluded.external_id,
    kickoff_at = excluded.kickoff_at,
    home_spread = excluded.home_spread,
    status = excluded.status;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_pool_id uuid;
  player_name text;
begin
  player_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Player'
  );

  insert into public.profiles (id, display_name)
  values (new.id, left(player_name, 60))
  on conflict (id) do nothing;

  select id into default_pool_id
  from public.pools
  where code = 'nflbetx-2026'
  limit 1;

  if default_pool_id is not null then
    insert into public.pool_members (pool_id, user_id, role)
    values (default_pool_id, new.id, 'member')
    on conflict (pool_id, user_id) do nothing;

    insert into public.entries (pool_id, user_id, entry_name)
    values (
      default_pool_id,
      new.id,
      left(player_name, 50) || '-' || left(new.id::text, 8)
    )
    on conflict (pool_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
grant select on table public.games to anon, authenticated;
grant select on table public.pools, public.pool_members, public.entries to authenticated;
grant select, insert, update, delete on table public.picks to authenticated;
