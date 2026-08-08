create or replace function public.create_pool(pool_name text, pool_season smallint default 2026)
returns table (pool_id uuid, invite_code text)
language plpgsql
security invoker
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

revoke all on function public.create_pool(text, smallint) from public, anon;
grant execute on function public.create_pool(text, smallint) to authenticated;
