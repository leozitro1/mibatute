-- Only loaded by the local Supabase bootstrap.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('local-images', 'local-images', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Local image reads" on storage.objects;
create policy "Local image reads" on storage.objects for select
using (bucket_id = 'local-images');

drop policy if exists "Local image uploads" on storage.objects;
create policy "Local image uploads" on storage.objects for insert to authenticated
with check (
  bucket_id = 'local-images'
  and (storage.foldername(name))[1] = 'mibatute'
  and (storage.foldername(name))[2] = 'articulos'
  and (storage.foldername(name))[3] = auth.uid()::text
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('local-profile-photos', 'local-profile-photos', false, 3145728,
  array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=false;

drop policy if exists "Local profile photo reads" on storage.objects;
create policy "Local profile photo reads" on storage.objects for select to authenticated
using (bucket_id='local-profile-photos' and auth.uid() is not null and auth.jwt()->>'is_anonymous' is distinct from 'true');

drop policy if exists "Local profile photo uploads" on storage.objects;
create policy "Local profile photo uploads" on storage.objects for insert to authenticated
with check (bucket_id='local-profile-photos' and (storage.foldername(name))[1]='mibatute'
  and (storage.foldername(name))[2]='perfiles' and (storage.foldername(name))[3]=auth.uid()::text
  and auth.jwt()->>'is_anonymous' is distinct from 'true');

drop policy if exists "Local image deletion" on storage.objects;
create policy "Local image deletion" on storage.objects for delete to authenticated
using (
  bucket_id = 'local-images'
  and (storage.foldername(name))[1] = 'mibatute'
  and (storage.foldername(name))[2] in ('articulos', 'perfiles')
  and (storage.foldername(name))[3] = auth.uid()::text
);
commit;
