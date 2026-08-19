alter table public.commissioner_pass_payments
  drop constraint if exists commissioner_pass_payments_provider_check,
  drop constraint if exists commissioner_pass_payments_paypal_order_id_key,
  drop constraint if exists commissioner_pass_payments_paypal_capture_id_key;

alter table public.commissioner_pass_payments
  alter column provider drop default,
  add constraint commissioner_pass_payments_provider_check
    check (provider in ('paypal_sandbox', 'paypal_live'));

create unique index commissioner_pass_payments_provider_order_idx
  on public.commissioner_pass_payments (provider, paypal_order_id)
  where paypal_order_id is not null;

create unique index commissioner_pass_payments_provider_capture_idx
  on public.commissioner_pass_payments (provider, paypal_capture_id)
  where paypal_capture_id is not null;
