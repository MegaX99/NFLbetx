alter table public.profiles
  add column if not exists avatar_path text;

alter table public.profiles
  drop constraint if exists profiles_avatar_path_owner;

alter table public.profiles
  add constraint profiles_avatar_path_owner check (
    avatar_path is null or avatar_path like id::text || '/%'
  );

grant update (avatar_path) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-avatars', 'player-avatars', true, 2097152, array['image/png', 'image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view player avatars" on storage.objects;
drop policy if exists "Players can upload their avatar" on storage.objects;
drop policy if exists "Players can update their avatar" on storage.objects;
drop policy if exists "Players can delete their avatar" on storage.objects;

create policy "Anyone can view player avatars"
on storage.objects for select
to public
using (bucket_id = 'player-avatars');

create policy "Players can upload their avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Players can update their avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Players can delete their avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.get_pool_standings(target_pool_id uuid)
returns table (
  rank bigint,
  entry_id uuid,
  user_id uuid,
  display_name text,
  avatar_path text,
  wins bigint,
  losses bigint,
  pushes bigint,
  games_decided bigint,
  win_percentage numeric,
  week_number smallint,
  week_wins bigint,
  week_losses bigint,
  week_pushes bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with authorized_pool as (
    select p.id, p.season
    from public.pools p
    where p.id = target_pool_id
      and (select auth.uid()) is not null
      and exists (
        select 1
        from public.pool_members pm
        where pm.pool_id = p.id
          and pm.user_id = (select auth.uid())
      )
  ),
  active_week as (
    select coalesce(
      min(g.week) filter (where g.status <> 'final'),
      max(g.week),
      1
    )::smallint as week_number
    from public.games g
    join authorized_pool ap on ap.season = g.season
  ),
  totals as (
    select
      e.id as entry_id,
      e.user_id,
      pr.display_name,
      pr.avatar_path,
      count(*) filter (where pk.outcome = 'win') as wins,
      count(*) filter (where pk.outcome = 'loss') as losses,
      count(*) filter (where pk.outcome = 'push') as pushes,
      aw.week_number,
      count(*) filter (where g.week = aw.week_number and pk.outcome = 'win') as week_wins,
      count(*) filter (where g.week = aw.week_number and pk.outcome = 'loss') as week_losses,
      count(*) filter (where g.week = aw.week_number and pk.outcome = 'push') as week_pushes
    from authorized_pool ap
    join public.entries e on e.pool_id = ap.id and e.is_active
    join public.profiles pr on pr.id = e.user_id
    cross join active_week aw
    left join public.picks pk on pk.entry_id = e.id
    left join public.games g on g.id = pk.game_id and g.season = ap.season
    group by e.id, e.user_id, pr.display_name, pr.avatar_path, aw.week_number
  ),
  ranked as (
    select
      dense_rank() over (
        order by (wins + pushes * 0.5) desc, losses asc
      ) as rank,
      entry_id,
      user_id,
      display_name,
      avatar_path,
      wins,
      losses,
      pushes,
      wins + losses + pushes as games_decided,
      case
        when wins + losses + pushes = 0 then 0::numeric
        else round(((wins + pushes * 0.5) / (wins + losses + pushes)::numeric) * 100, 1)
      end as win_percentage,
      week_number,
      week_wins,
      week_losses,
      week_pushes
    from totals
  )
  select *
  from ranked
  order by rank, display_name;
$$;

revoke all on function public.get_pool_standings(uuid) from public, anon;
grant execute on function public.get_pool_standings(uuid) to authenticated;
