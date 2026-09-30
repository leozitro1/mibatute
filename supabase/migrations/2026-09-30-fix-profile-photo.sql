-- Ensure profile photos saved in ImageKit can be persisted in user profiles.
-- Run in Supabase SQL Editor.

alter table public.usuarios add column if not exists foto_url text default '';

alter table public.usuarios enable row level security;

drop policy if exists "Perfiles publicos visibles" on public.usuarios;
create policy "Perfiles publicos visibles"
on public.usuarios for select
using (true);

drop policy if exists "Cada usuario actualiza su perfil" on public.usuarios;
create policy "Cada usuario actualiza su perfil"
on public.usuarios for all
using (auth.uid() = id)
with check (auth.uid() = id);

grant select on public.usuarios to anon;
grant select, insert, update on public.usuarios to authenticated;
