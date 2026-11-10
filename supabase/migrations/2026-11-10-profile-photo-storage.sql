begin;
set local lock_timeout='4s';
set local statement_timeout='20s';

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('profile-photos','profile-photos',false,3145728,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Registered users read private avatars" on storage.objects;
create policy "Registered users read private avatars" on storage.objects for select to authenticated
using (bucket_id='profile-photos' and (select auth.uid()) is not null
  and (select auth.jwt()->>'is_anonymous') is distinct from 'true');

-- No client write policy: each upload requires a one-path grant from the server after quota verification.
commit;
