-- Only loaded by the local Supabase bootstrap.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('local-images', 'local-images', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Local image reads" on storage.objects for select
using (bucket_id = 'local-images');

create policy "Local image uploads" on storage.objects for insert to authenticated
with check (
  bucket_id = 'local-images'
  and (storage.foldername(name))[1] = 'mibatute'
  and (storage.foldername(name))[2] in ('articulos', 'perfiles')
  and (storage.foldername(name))[3] = auth.uid()::text
);

create policy "Local image deletion" on storage.objects for delete to authenticated
using (
  bucket_id = 'local-images'
  and (storage.foldername(name))[1] = 'mibatute'
  and (storage.foldername(name))[2] in ('articulos', 'perfiles')
  and (storage.foldername(name))[3] = auth.uid()::text
);
