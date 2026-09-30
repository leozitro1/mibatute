-- Backfill and fix user profiles created through Supabase Auth.
-- Run in Supabase SQL Editor.

alter table public.usuarios add column if not exists email text default '';

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, email, nombre, movil, ciudad, localidad)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    coalesce(new.raw_user_meta_data->>'movil', ''),
    coalesce(new.raw_user_meta_data->>'ciudad', new.raw_user_meta_data->>'city', ''),
    coalesce(
      new.raw_user_meta_data->>'localidad',
      new.raw_user_meta_data->>'localidad_es',
      new.raw_user_meta_data->>'locality',
      new.raw_user_meta_data->>'location',
      ''
    )
  )
  on conflict (id) do update
  set
    email = coalesce(excluded.email, public.usuarios.email, ''),
    nombre = excluded.nombre,
    movil = excluded.movil,
    ciudad = excluded.ciudad,
    localidad = excluded.localidad,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists create_profile_for_new_user on auth.users;
create trigger create_profile_for_new_user
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

insert into public.usuarios (id, email, nombre, movil, ciudad, localidad)
select
  au.id,
  coalesce(au.email, ''),
  coalesce(au.raw_user_meta_data->>'nombre', ''),
  coalesce(au.raw_user_meta_data->>'movil', ''),
  coalesce(au.raw_user_meta_data->>'ciudad', au.raw_user_meta_data->>'city', ''),
  coalesce(
    au.raw_user_meta_data->>'localidad',
    au.raw_user_meta_data->>'localidad_es',
    au.raw_user_meta_data->>'locality',
    au.raw_user_meta_data->>'location',
    ''
  )
from auth.users au
on conflict (id) do update
set
  email = coalesce(excluded.email, public.usuarios.email, ''),
  nombre = coalesce(nullif(public.usuarios.nombre, ''), excluded.nombre, ''),
  movil = coalesce(nullif(public.usuarios.movil, ''), excluded.movil, ''),
  ciudad = coalesce(nullif(public.usuarios.ciudad, ''), excluded.ciudad, ''),
  localidad = coalesce(nullif(public.usuarios.localidad, ''), excluded.localidad, ''),
  updated_at = now();
