alter table public.pools
  add column if not exists avatar_path text;

grant update (name, entry_fee_cents, avatar_path) on public.pools to authenticated;

create or replace function public.create_pool(pool_name text, pool_season smallint default 2026)
returns table (pool_id uuid, invite_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  clean_name text := btrim(pool_name);
  new_pool_id uuid;
  new_code text;
  player_name text;
begin
  if caller_id is null then
    raise exception 'You must be signed in to create a pool.';
  end if;

  if char_length(clean_name) < 1 or char_length(clean_name) > 100 then
    raise exception 'Pool names must be between 1 and 100 characters.';
  end if;

  if pool_season < 2026 or pool_season > 2100 then
    raise exception 'That season is not available.';
  end if;

  select display_name into player_name
  from public.profiles
  where id = caller_id;

  if player_name is null then
    raise exception 'Your player profile is not ready yet.';
  end if;

  loop
    new_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    exit when not exists (
      select 1 from public.pools where lower(code) = lower(new_code)
    );
  end loop;

  insert into public.pools (name, code, season, commissioner_id)
  values (clean_name, new_code, pool_season, caller_id);

  select id into new_pool_id
  from public.pools
  where code = new_code
    and commissioner_id = caller_id;

  insert into public.pool_members (pool_id, user_id, role)
  values (new_pool_id, caller_id, 'commissioner');

  insert into public.entries (pool_id, user_id, entry_name)
  values (new_pool_id, caller_id, left(player_name, 50) || '-' || left(caller_id::text, 8));

  return query select new_pool_id, new_code;
end;
$$;

create or replace function public.join_pool(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  found_pool_id uuid;
  player_name text;
begin
  if caller_id is null then
    raise exception 'You must be signed in to join a pool.';
  end if;

  select id into found_pool_id
  from public.pools
  where lower(code) = lower(btrim(invite_code))
  limit 1;

  if found_pool_id is null then
    raise exception 'That invitation code was not found.';
  end if;

  select display_name into player_name
  from public.profiles
  where id = caller_id;

  insert into public.pool_members (pool_id, user_id, role)
  values (found_pool_id, caller_id, 'member')
  on conflict (pool_id, user_id) do nothing;

  insert into public.entries (pool_id, user_id, entry_name)
  values (found_pool_id, caller_id, left(player_name, 50) || '-' || left(caller_id::text, 8))
  on conflict (pool_id, user_id) do nothing;

  return found_pool_id;
end;
$$;

revoke all on function public.create_pool(text, smallint) from public, anon;
revoke all on function public.join_pool(text) from public, anon;
grant execute on function public.create_pool(text, smallint) to authenticated;
grant execute on function public.join_pool(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pool-avatars', 'pool-avatars', true, 2097152, array['image/png', 'image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Commissioners can upload pool avatars"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'pool-avatars'
  and exists (
    select 1
    from public.pools p
    where p.id::text = (storage.foldername(storage.objects.name))[1]
      and p.commissioner_id = (select auth.uid())
  )
);

create policy "Commissioners can delete pool avatars"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'pool-avatars'
  and exists (
    select 1
    from public.pools p
    where p.id::text = (storage.foldername(storage.objects.name))[1]
      and p.commissioner_id = (select auth.uid())
  )
);
