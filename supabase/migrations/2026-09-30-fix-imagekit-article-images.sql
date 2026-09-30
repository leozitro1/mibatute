-- Ensure ImageKit-backed article images can be saved by authenticated users.
-- Run in Supabase SQL Editor.

alter table public.articulo_imagenes add column if not exists file_id text;

alter table public.articulo_imagenes enable row level security;

drop policy if exists "Imagenes visibles" on public.articulo_imagenes;
create policy "Imagenes visibles"
on public.articulo_imagenes for select
using (true);

drop policy if exists "Gestionar imagenes propias" on public.articulo_imagenes;
create policy "Gestionar imagenes propias"
on public.articulo_imagenes for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

grant select on public.articulo_imagenes to anon;
grant select, insert, update, delete on public.articulo_imagenes to authenticated;
grant usage, select on all sequences in schema public to authenticated;
