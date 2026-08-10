alter table public.profiles
  add column if not exists screen_name_set_at timestamptz;

create unique index if not exists profiles_chosen_screen_name_unique_idx
  on public.profiles (lower(display_name))
  where screen_name_set_at is not null;

alter table public.profiles
  drop constraint if exists profiles_chosen_screen_name_format;

alter table public.profiles
  add constraint profiles_chosen_screen_name_format check (
    screen_name_set_at is null
    or (
      char_length(display_name) between 3 and 24
      and display_name = btrim(display_name)
      and display_name ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*[A-Za-z0-9]$'
      and lower(display_name) not in ('admin', 'administrator', 'nflbetx', 'support', 'system')
    )
  );

create or replace function private.prepare_chosen_screen_name()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.display_name := regexp_replace(btrim(new.display_name), '[[:space:]]+', ' ', 'g');

  if old.screen_name_set_at is null then
    new.screen_name_set_at := now();
  else
    new.screen_name_set_at := old.screen_name_set_at;
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_chosen_screen_name on public.profiles;
create trigger prepare_chosen_screen_name
before update of display_name on public.profiles
for each row execute function private.prepare_chosen_screen_name();

create or replace function private.sync_entry_screen_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.entries
  set entry_name = left(new.display_name, 50) || '-' || left(new.id::text, 8)
  where user_id = new.id;

  return new;
end;
$$;

drop trigger if exists sync_entry_screen_name on public.profiles;
create trigger sync_entry_screen_name
after update of display_name on public.profiles
for each row
when (old.display_name is distinct from new.display_name)
execute function private.sync_entry_screen_name();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_pool_id uuid;
  player_name text := 'Player-' || left(new.id::text, 8);
begin
  insert into public.profiles (id, display_name, screen_name_set_at)
  values (new.id, player_name, null)
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

revoke all on function private.prepare_chosen_screen_name() from public, anon, authenticated;
revoke all on function private.sync_entry_screen_name() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;

