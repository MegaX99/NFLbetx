create or replace function private.commissioner_pass_due_at(pool_season smallint)
returns timestamptz
language sql
immutable
security invoker
set search_path = ''
as $$
  select make_timestamptz(pool_season, 9, 22, 23, 59, 59, 'America/Los_Angeles');
$$;

revoke execute on function private.commissioner_pass_due_at(smallint)
from public, anon, authenticated, service_role;

create table public.commissioner_passes (
  pool_id uuid primary key references public.pools(id) on delete cascade,
  season smallint not null check (season between 2026 and 2100),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended', 'refunded')),
  paid_capacity integer not null default 0
    check (
      paid_capacity = 0
      or (paid_capacity >= 12 and mod(paid_capacity - 12, 5) = 0)
    ),
  amount_paid_cents integer not null default 0 check (amount_paid_cents >= 0),
  due_at timestamptz not null,
  paid_at timestamptz,
  payment_provider text,
  provider_customer_id text,
  provider_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commissioner_pass_active_payment_check check (
    status <> 'active'
    or (paid_capacity >= 12 and amount_paid_cents >= 3000 and paid_at is not null)
  ),
  constraint commissioner_pass_provider_check check (
    provider_payment_id is null or payment_provider is not null
  )
);

create unique index commissioner_passes_provider_payment_idx
  on public.commissioner_passes (payment_provider, provider_payment_id)
  where provider_payment_id is not null;

create index commissioner_passes_status_due_at_idx
  on public.commissioner_passes (status, due_at);

create trigger commissioner_passes_set_updated_at
before update on public.commissioner_passes
for each row execute function private.set_updated_at();

create or replace function private.create_commissioner_pass()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.commissioner_passes (pool_id, season, due_at)
  values (new.id, new.season, private.commissioner_pass_due_at(new.season))
  on conflict (pool_id) do nothing;
  return new;
end;
$$;

revoke execute on function private.create_commissioner_pass()
from public, anon, authenticated, service_role;

create trigger create_commissioner_pass_for_pool
after insert on public.pools
for each row execute function private.create_commissioner_pass();

insert into public.commissioner_passes (pool_id, season, due_at)
select p.id, p.season, private.commissioner_pass_due_at(p.season)
from public.pools p
on conflict (pool_id) do nothing;

alter table public.commissioner_passes enable row level security;

create policy "Pool members can read commissioner pass status"
on public.commissioner_passes for select
to authenticated
using ((select private.can_access_pool(pool_id)));

revoke all on public.commissioner_passes from public, anon, authenticated;
grant select (
  pool_id,
  season,
  status,
  paid_capacity,
  amount_paid_cents,
  due_at,
  paid_at,
  created_at,
  updated_at
) on public.commissioner_passes to authenticated;
grant select, insert, update, delete on public.commissioner_passes to service_role;

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
  pass_status text;
  pass_capacity integer;
  pass_due_at timestamptz;
  active_member_count integer;
  email_is_verified boolean;
begin
  if caller_id is null then
    raise exception 'You must be signed in to join a pool.';
  end if;

  select (u.email_confirmed_at is not null)
  into email_is_verified
  from auth.users u
  where u.id = caller_id;

  if email_is_verified is not true then
    raise exception 'Verify your email before joining a pool.';
  end if;

  select p.id
  into found_pool_id
  from public.pools p
  where lower(p.code) = lower(btrim(invite_code))
  limit 1;

  if found_pool_id is null then
    raise exception 'That invitation code was not found.';
  end if;

  if exists (
    select 1
    from public.pool_members pm
    where pm.pool_id = found_pool_id
      and pm.user_id = caller_id
  ) then
    return found_pool_id;
  end if;

  select cp.status, cp.paid_capacity, cp.due_at
  into pass_status, pass_capacity, pass_due_at
  from public.commissioner_passes cp
  where cp.pool_id = found_pool_id
  for update;

  if pass_status is null then
    raise exception 'This pool is not ready to accept players yet.';
  end if;

  if now() > pass_due_at and pass_status <> 'active' then
    raise exception 'This pool is waiting for its Commissioner Pass payment.';
  end if;

  select count(*)
  into active_member_count
  from public.pool_members pm
  where pm.pool_id = found_pool_id;

  if pass_status = 'active' and active_member_count >= pass_capacity then
    raise exception 'This pool has reached its paid capacity. The commissioner must upgrade the Commissioner Pass before another player can join.';
  end if;

  select pr.display_name
  into player_name
  from public.profiles pr
  where pr.id = caller_id;

  if player_name is null then
    raise exception 'Your player profile is not ready yet.';
  end if;

  insert into public.pool_members (pool_id, user_id, role)
  values (found_pool_id, caller_id, 'member');

  insert into public.entries (pool_id, user_id, entry_name)
  values (found_pool_id, caller_id, left(player_name, 50) || '-' || left(caller_id::text, 8))
  on conflict (pool_id, user_id) do nothing;

  return found_pool_id;
end;
$$;

revoke all on function public.join_pool(text) from public, anon;
grant execute on function public.join_pool(text) to authenticated;
