create table private.auth_activity (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'login_failed',
    'login_succeeded',
    'password_reset_requested',
    'password_changed'
  )),
  user_id uuid references auth.users(id) on delete set null,
  email_hint text,
  created_at timestamptz not null default now()
);

create index auth_activity_created_at_idx
  on private.auth_activity (created_at desc);

create index auth_activity_event_created_at_idx
  on private.auth_activity (event_type, created_at desc);

create or replace function private.mask_auth_email(email_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when position('@' in email_value) > 1
      then left(email_value, 1) || '***@' || split_part(email_value, '@', 2)
    else 'unknown'
  end;
$$;

create or replace function public.record_auth_event(
  event_kind text,
  attempted_email text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_email text;
  safe_email_hint text;
begin
  if event_kind not in (
    'login_failed',
    'login_succeeded',
    'password_reset_requested',
    'password_changed'
  ) then
    raise exception 'Unsupported authentication event.' using errcode = '22023';
  end if;

  if event_kind in ('login_succeeded', 'password_changed') then
    if caller_id is null then
      raise exception 'A verified session is required for this event.' using errcode = '42501';
    end if;

    select lower(email) into normalized_email
    from auth.users
    where id = caller_id;
  else
    normalized_email := lower(trim(coalesce(attempted_email, '')));
    if char_length(normalized_email) > 254
      or position('@' in normalized_email) <= 1
      or split_part(normalized_email, '@', 2) = '' then
      normalized_email := 'unknown';
    end if;
  end if;

  safe_email_hint := private.mask_auth_email(normalized_email);

  if exists (
    select 1
    from private.auth_activity aa
    where aa.event_type = event_kind
      and aa.email_hint = safe_email_hint
      and aa.user_id is not distinct from caller_id
      and aa.created_at >= now() - interval '10 seconds'
  ) then
    return false;
  end if;

  insert into private.auth_activity (event_type, user_id, email_hint)
  values (event_kind, caller_id, safe_email_hint);

  return true;
end;
$$;

create or replace function public.get_auth_activity()
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
      'login_succeeded_7d', (select count(*) from private.auth_activity where event_type = 'login_succeeded' and created_at >= now() - interval '7 days'),
      'login_failed_7d', (select count(*) from private.auth_activity where event_type = 'login_failed' and created_at >= now() - interval '7 days'),
      'reset_requested_7d', (select count(*) from private.auth_activity where event_type = 'password_reset_requested' and created_at >= now() - interval '7 days'),
      'password_changed_7d', (select count(*) from private.auth_activity where event_type = 'password_changed' and created_at >= now() - interval '7 days')
    ),
    'activity', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from (
        select aa.id, aa.event_type, aa.email_hint, aa.created_at,
          pr.display_name
        from private.auth_activity aa
        left join public.profiles pr on pr.id = aa.user_id
        order by aa.created_at desc
        limit 100
      ) a
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on table private.auth_activity from public, anon, authenticated, service_role;
revoke all on function private.mask_auth_email(text) from public, anon, authenticated, service_role;

revoke all on function public.record_auth_event(text, text) from public;
revoke all on function public.get_auth_activity() from public, anon;

grant execute on function public.record_auth_event(text, text) to anon, authenticated;
grant execute on function public.get_auth_activity() to authenticated;

