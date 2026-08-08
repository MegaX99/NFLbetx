create table private.site_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table private.site_activity (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'user_created', 'pool_created', 'pool_renamed', 'invite_code_changed',
    'pool_avatar_changed', 'member_joined', 'member_removed'
  )),
  actor_id uuid references public.profiles(id) on delete set null,
  subject_user_id uuid references public.profiles(id) on delete set null,
  pool_id uuid references public.pools(id) on delete set null,
  message text not null check (char_length(message) between 1 and 200),
  created_at timestamptz not null default now()
);

create index site_activity_created_at_idx on private.site_activity(created_at desc);
create index site_activity_pool_id_idx on private.site_activity(pool_id);
create index site_activity_actor_id_idx on private.site_activity(actor_id);

insert into private.site_admins (user_id)
select id from auth.users where lower(email) = 'andrewfigura@gmail.com'
on conflict (user_id) do nothing;

create or replace function private.is_site_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from private.site_admins
      where user_id = (select auth.uid())
    );
$$;

create or replace function public.is_site_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from private.site_admins
      where user_id = (select auth.uid())
    );
$$;

create or replace function private.log_profile_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.site_activity (event_type, actor_id, subject_user_id, message, created_at)
  values ('user_created', new.id, new.id, 'Player account created', new.created_at);
  return new;
end;
$$;

create or replace function private.log_pool_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into private.site_activity (event_type, actor_id, pool_id, message, created_at)
    values ('pool_created', new.commissioner_id, new.id, 'Pool created', new.created_at);
  elsif old.name is distinct from new.name then
    insert into private.site_activity (event_type, actor_id, pool_id, message)
    values ('pool_renamed', (select auth.uid()), new.id, 'Pool name changed');
  elsif old.code is distinct from new.code then
    insert into private.site_activity (event_type, actor_id, pool_id, message)
    values ('invite_code_changed', (select auth.uid()), new.id, 'Invitation code regenerated');
  elsif old.avatar_path is distinct from new.avatar_path then
    insert into private.site_activity (event_type, actor_id, pool_id, message)
    values ('pool_avatar_changed', (select auth.uid()), new.id, 'Pool avatar changed');
  end if;
  return new;
end;
$$;

create or replace function private.log_membership_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into private.site_activity (event_type, actor_id, subject_user_id, pool_id, message, created_at)
    values ('member_joined', coalesce((select auth.uid()), new.user_id), new.user_id, new.pool_id, 'Player joined pool', new.joined_at);
    return new;
  end if;

  insert into private.site_activity (event_type, actor_id, subject_user_id, pool_id, message)
  values ('member_removed', (select auth.uid()), old.user_id, old.pool_id, 'Player removed from pool');
  return old;
end;
$$;

create trigger nflbetx_log_profile_created
after insert on public.profiles
for each row execute function private.log_profile_activity();

create trigger nflbetx_log_pool_created
after insert on public.pools
for each row execute function private.log_pool_activity();

create trigger nflbetx_log_pool_updated
after update of name, code, avatar_path on public.pools
for each row execute function private.log_pool_activity();

create trigger nflbetx_log_membership_changed
after insert or delete on public.pool_members
for each row execute function private.log_membership_activity();

insert into private.site_activity (event_type, actor_id, subject_user_id, message, created_at)
select 'user_created', id, id, 'Player account created', created_at
from public.profiles;

insert into private.site_activity (event_type, actor_id, pool_id, message, created_at)
select 'pool_created', commissioner_id, id, 'Pool created', created_at
from public.pools;

insert into private.site_activity (event_type, actor_id, subject_user_id, pool_id, message, created_at)
select 'member_joined', user_id, user_id, pool_id, 'Player joined pool', joined_at
from public.pool_members;

create or replace function public.regenerate_pool_code(target_pool_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  new_code text;
begin
  if caller_id is null or not exists (
    select 1 from public.pools
    where id = target_pool_id and commissioner_id = caller_id
  ) then
    raise exception 'Only this pool commissioner can regenerate its invitation code.' using errcode = '42501';
  end if;

  loop
    new_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    exit when not exists (select 1 from public.pools where lower(code) = lower(new_code));
  end loop;

  update public.pools set code = new_code where id = target_pool_id;
  return new_code;
end;
$$;

create or replace function public.remove_pool_member(target_pool_id uuid, target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or not exists (
    select 1 from public.pools
    where id = target_pool_id and commissioner_id = caller_id
  ) then
    raise exception 'Only this pool commissioner can remove members.' using errcode = '42501';
  end if;

  if target_user_id = caller_id then
    raise exception 'The commissioner cannot remove their own account.';
  end if;

  delete from public.entries where pool_id = target_pool_id and user_id = target_user_id;
  delete from public.pool_members where pool_id = target_pool_id and user_id = target_user_id and role = 'member';
  return found;
end;
$$;

create or replace function public.get_owner_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  result jsonb;
begin
  if caller_id is null or not exists (
    select 1 from private.site_admins where user_id = caller_id
  ) then
    raise exception 'Owner access required.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'total_users', (select count(*) from public.profiles),
      'total_pools', (select count(*) from public.pools),
      'total_entries', (select count(*) from public.entries where is_active),
      'total_picks', (select count(*) from public.picks),
      'total_commissioners', (select count(distinct commissioner_id) from public.pools),
      'activity_7d', (select count(*) from private.site_activity where created_at >= now() - interval '7 days')
    ),
    'recent_users', coalesce((
      select jsonb_agg(to_jsonb(u) order by u.created_at desc)
      from (
        select pr.id, pr.display_name, pr.created_at,
          (select count(*) from public.pool_members pm where pm.user_id = pr.id) as pool_count
        from public.profiles pr order by pr.created_at desc limit 10
      ) u
    ), '[]'::jsonb),
    'pools', coalesce((
      select jsonb_agg(to_jsonb(pl) order by pl.created_at desc)
      from (
        select p.id, p.name, p.code, p.created_at, pr.display_name as commissioner_name,
          (select count(*) from public.pool_members pm where pm.pool_id = p.id) as member_count,
          (select count(*) from public.entries e where e.pool_id = p.id and e.is_active) as entry_count
        from public.pools p
        join public.profiles pr on pr.id = p.commissioner_id
        order by p.created_at desc limit 25
      ) pl
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from (
        select sa.id, sa.event_type, sa.message, sa.created_at,
          actor.display_name as actor_name,
          subject.display_name as subject_name,
          p.name as pool_name
        from private.site_activity sa
        left join public.profiles actor on actor.id = sa.actor_id
        left join public.profiles subject on subject.id = sa.subject_user_id
        left join public.pools p on p.id = sa.pool_id
        order by sa.created_at desc limit 40
      ) a
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on table private.site_admins from public, anon, authenticated, service_role;
revoke all on table private.site_activity from public, anon, authenticated, service_role;
revoke all on function private.is_site_owner() from public, anon, authenticated, service_role;
revoke all on function private.log_profile_activity() from public, anon, authenticated, service_role;
revoke all on function private.log_pool_activity() from public, anon, authenticated, service_role;
revoke all on function private.log_membership_activity() from public, anon, authenticated, service_role;

revoke all on function public.is_site_owner() from public, anon;
revoke all on function public.regenerate_pool_code(uuid) from public, anon;
revoke all on function public.remove_pool_member(uuid, uuid) from public, anon;
revoke all on function public.get_owner_dashboard() from public, anon;

grant execute on function public.is_site_owner() to authenticated;
grant execute on function public.regenerate_pool_code(uuid) to authenticated;
grant execute on function public.remove_pool_member(uuid, uuid) to authenticated;
grant execute on function public.get_owner_dashboard() to authenticated;
create or replace function public.get_pool_activity(target_pool_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  result jsonb;
begin
  if caller_id is null or not exists (
    select 1 from public.pools
    where id = target_pool_id and commissioner_id = caller_id
  ) then
    raise exception 'Only this pool commissioner can view its activity.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
  into result
  from (
    select sa.id, sa.event_type, sa.message, sa.created_at,
      actor.display_name as actor_name,
      subject.display_name as subject_name
    from private.site_activity sa
    left join public.profiles actor on actor.id = sa.actor_id
    left join public.profiles subject on subject.id = sa.subject_user_id
    where sa.pool_id = target_pool_id
    order by sa.created_at desc
    limit 30
  ) a;

  return result;
end;
$$;

revoke all on function public.get_pool_activity(uuid) from public, anon;
grant execute on function public.get_pool_activity(uuid) to authenticated;

