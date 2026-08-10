create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_name text := 'Player-' || left(new.id::text, 8);
begin
  insert into public.profiles (id, display_name, screen_name_set_at)
  values (new.id, player_name, null)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

