create table public.commissioner_pass_payments (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  season smallint not null check (season between 2026 and 2100),
  commissioner_id uuid not null references public.profiles(id) on delete restrict,
  provider text not null default 'paypal_sandbox'
    check (provider = 'paypal_sandbox'),
  status text not null default 'creating'
    check (status in ('creating', 'created', 'captured', 'failed')),
  target_capacity integer not null
    check (target_capacity >= 12 and mod(target_capacity - 12, 5) = 0),
  target_total_cents integer not null check (target_total_cents >= 3000),
  amount_cents integer not null check (amount_cents > 0),
  currency_code text not null default 'USD' check (currency_code = 'USD'),
  paypal_order_id text unique,
  paypal_capture_id text unique,
  approval_url text,
  created_at timestamptz not null default now(),
  captured_at timestamptz,
  constraint commissioner_pass_payment_capture_check check (
    (status = 'captured' and paypal_capture_id is not null and captured_at is not null)
    or status <> 'captured'
  )
);

create index commissioner_pass_payments_pool_created_idx
  on public.commissioner_pass_payments (pool_id, created_at desc);

create unique index commissioner_pass_payments_open_tier_idx
  on public.commissioner_pass_payments (pool_id, target_capacity)
  where status in ('creating', 'created');

alter table public.commissioner_pass_payments enable row level security;

revoke all on public.commissioner_pass_payments from public, anon, authenticated;
grant select, insert, update on public.commissioner_pass_payments to service_role;

create or replace function public.record_paypal_commissioner_pass_capture(
  target_payment_id uuid,
  target_paypal_capture_id text,
  paypal_payer_id text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  payment_row public.commissioner_pass_payments%rowtype;
begin
  select *
  into payment_row
  from public.commissioner_pass_payments cpp
  where cpp.id = target_payment_id
  for update;

  if payment_row.id is null then
    raise exception 'Payment attempt not found.';
  end if;

  if payment_row.status = 'captured' then
    if payment_row.paypal_capture_id = target_paypal_capture_id then
      return;
    end if;
    raise exception 'Payment attempt was already captured.';
  end if;

  if payment_row.status <> 'created' then
    raise exception 'Payment attempt is not ready to capture.';
  end if;

  update public.commissioner_passes cp
  set status = 'active',
      paid_capacity = payment_row.target_capacity,
      amount_paid_cents = payment_row.target_total_cents,
      paid_at = now(),
      payment_provider = payment_row.provider,
      provider_customer_id = paypal_payer_id,
      provider_payment_id = target_paypal_capture_id
  where cp.pool_id = payment_row.pool_id;

  if not found then
    raise exception 'Commissioner Pass not found.';
  end if;

  update public.commissioner_pass_payments
  set status = 'captured',
      paypal_capture_id = target_paypal_capture_id,
      captured_at = now()
  where id = payment_row.id;
end;
$$;

revoke all on function public.record_paypal_commissioner_pass_capture(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.record_paypal_commissioner_pass_capture(uuid, text, text)
to service_role;
