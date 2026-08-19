drop index public.commissioner_pass_payments_open_tier_idx;

create unique index commissioner_pass_payments_open_pool_idx
  on public.commissioner_pass_payments (pool_id)
  where status in ('creating', 'created');

create index commissioner_pass_payments_commissioner_id_idx
  on public.commissioner_pass_payments (commissioner_id);
