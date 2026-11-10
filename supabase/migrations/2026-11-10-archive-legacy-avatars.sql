begin;
set local lock_timeout='4s';
set local statement_timeout='20s';

-- Private recovery copies of the former ImageKit originals. No client policy.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('profile-photo-archive','profile-photo-archive',false,8388608,
  array['image/jpeg','image/png','image/webp','image/gif','application/json'])
on conflict (id) do nothing;
commit;
