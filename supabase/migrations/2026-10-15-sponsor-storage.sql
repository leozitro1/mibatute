begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('sponsor-media','sponsor-media',true,5242880,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists sponsor_media_master on storage.objects;
create policy sponsor_media_master on storage.objects for all to authenticated
using(bucket_id='sponsor-media' and public.staff_permission('sponsors'))
with check(bucket_id='sponsor-media' and public.staff_permission('sponsors'));
commit;
