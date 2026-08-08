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

