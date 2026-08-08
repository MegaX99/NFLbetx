drop policy if exists "Commissioners can upload pool avatars" on storage.objects;
drop policy if exists "Commissioners can delete pool avatars" on storage.objects;

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
