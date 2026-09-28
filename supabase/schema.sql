-- Mi Batute - esquema base para recrear Supabase
-- Ejecutar en Supabase SQL Editor sobre un proyecto nuevo.

create extension if not exists pgcrypto;

create table if not exists public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text default '',
  movil text default '',
  ciudad text default '',
  localidad text default '',
  direccion text default '',
  foto_url text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.articulos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  usuario_id uuid generated always as (owner_id) stored,
  owner_name text default '',
  owner_photo text default '',
  title text not null default '',
  description text default '',
  category text default '',
  subcategory text default '',
  subcategoria text default '',
  mode text not null default 'donacion' check (mode in ('donacion', 'venta')),
  price numeric(12,2) not null default 0,
  city text default '',
  locality text default '',
  status text not null default 'disponible',
  estado text default 'disponible',
  buyer_id uuid references auth.users(id) on delete set null,
  comprador_id uuid references auth.users(id) on delete set null,
  ganador_id uuid references auth.users(id) on delete set null,
  winner_id uuid references auth.users(id) on delete set null,
  recipient_id uuid references auth.users(id) on delete set null,
  reserved_at timestamptz,
  delivered_at timestamptz,
  interested_count integer not null default 0,
  applicants uuid[] not null default '{}',
  imagenes text[] not null default '{}',
  image_url text default '',
  imagen_url text default '',
  imagen_url_principal text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.articulo_imagenes (
  id uuid primary key default gen_random_uuid(),
  articulo_id uuid not null references public.articulos(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  path text not null,
  file_id text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.postulaciones (
  id uuid primary key default gen_random_uuid(),
  articulo_id uuid not null references public.articulos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  justificacion text default '',
  created_at timestamptz not null default now(),
  unique (articulo_id, usuario_id)
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  articulo_id uuid not null references public.articulos(id) on delete cascade,
  buyer_id uuid references auth.users(id) on delete cascade,
  seller_id uuid references auth.users(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  usuario_id uuid references auth.users(id) on delete cascade,
  status text not null default 'open',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (articulo_id, buyer_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text,
  message text,
  content text,
  text text,
  mensaje text,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_reads (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chat_id, user_id)
);

create or replace view public.usuarios_publicos as
select id, nombre, ciudad, localidad, foto_url
from public.usuarios;

create index if not exists articulos_owner_id_idx on public.articulos(owner_id);
create index if not exists articulos_created_at_idx on public.articulos(created_at desc);
create index if not exists articulo_imagenes_articulo_id_idx on public.articulo_imagenes(articulo_id);
create index if not exists postulaciones_articulo_id_idx on public.postulaciones(articulo_id);
create index if not exists postulaciones_usuario_id_idx on public.postulaciones(usuario_id);
create index if not exists chats_articulo_id_idx on public.chats(articulo_id);
create index if not exists chats_buyer_id_idx on public.chats(buyer_id);
create index if not exists chat_messages_chat_id_idx on public.chat_messages(chat_id, created_at);

do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception
  when duplicate_object then null;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists usuarios_set_updated_at on public.usuarios;
create trigger usuarios_set_updated_at
before update on public.usuarios
for each row execute function public.set_updated_at();

drop trigger if exists articulos_set_updated_at on public.articulos;
create trigger articulos_set_updated_at
before update on public.articulos
for each row execute function public.set_updated_at();

drop trigger if exists chats_set_updated_at on public.chats;
create trigger chats_set_updated_at
before update on public.chats
for each row execute function public.set_updated_at();

drop trigger if exists chat_reads_set_updated_at on public.chat_reads;
create trigger chat_reads_set_updated_at
before update on public.chat_reads
for each row execute function public.set_updated_at();

create or replace function public.bump_articulo_interested_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.articulos
    set interested_count = greatest(0, interested_count + 1)
    where id = new.articulo_id;
    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.articulos
    set interested_count = greatest(0, interested_count - 1)
    where id = old.articulo_id;
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists postulaciones_interested_count_insert on public.postulaciones;
create trigger postulaciones_interested_count_insert
after insert on public.postulaciones
for each row execute function public.bump_articulo_interested_count();

drop trigger if exists postulaciones_interested_count_delete on public.postulaciones;
create trigger postulaciones_interested_count_delete
after delete on public.postulaciones
for each row execute function public.bump_articulo_interested_count();

create or replace function public.set_chat_last_message_at()
returns trigger
language plpgsql
as $$
begin
  update public.chats
  set last_message_at = new.created_at
  where id = new.chat_id;
  return new;
end;
$$;

drop trigger if exists chat_messages_set_last_message_at on public.chat_messages;
create trigger chat_messages_set_last_message_at
after insert on public.chat_messages
for each row execute function public.set_chat_last_message_at();

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, nombre, movil, ciudad, localidad)
  values (
    new.id,
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

alter table public.usuarios enable row level security;
alter table public.articulos enable row level security;
alter table public.articulo_imagenes enable row level security;
alter table public.postulaciones enable row level security;
alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reads enable row level security;

drop policy if exists "Perfiles publicos visibles" on public.usuarios;
create policy "Perfiles publicos visibles"
on public.usuarios for select
using (true);

drop policy if exists "Cada usuario actualiza su perfil" on public.usuarios;
create policy "Cada usuario actualiza su perfil"
on public.usuarios for all
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Articulos visibles" on public.articulos;
create policy "Articulos visibles"
on public.articulos for select
using (true);

drop policy if exists "Crear articulos propios" on public.articulos;
create policy "Crear articulos propios"
on public.articulos for insert
with check (auth.uid() = owner_id);

drop policy if exists "Editar articulos propios" on public.articulos;
create policy "Editar articulos propios"
on public.articulos for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Borrar articulos propios" on public.articulos;
create policy "Borrar articulos propios"
on public.articulos for delete
using (auth.uid() = owner_id);

drop policy if exists "Imagenes visibles" on public.articulo_imagenes;
create policy "Imagenes visibles"
on public.articulo_imagenes for select
using (true);

drop policy if exists "Gestionar imagenes propias" on public.articulo_imagenes;
create policy "Gestionar imagenes propias"
on public.articulo_imagenes for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Postulaciones visibles para participantes" on public.postulaciones;
create policy "Postulaciones visibles para participantes"
on public.postulaciones for select
using (
  auth.uid() = usuario_id
  or exists (
    select 1 from public.articulos a
    where a.id = postulaciones.articulo_id and a.owner_id = auth.uid()
  )
);

drop policy if exists "Crear postulacion propia" on public.postulaciones;
create policy "Crear postulacion propia"
on public.postulaciones for insert
with check (auth.uid() = usuario_id);

drop policy if exists "Borrar postulacion propia o como dueno" on public.postulaciones;
create policy "Borrar postulacion propia o como dueno"
on public.postulaciones for delete
using (
  auth.uid() = usuario_id
  or exists (
    select 1 from public.articulos a
    where a.id = postulaciones.articulo_id and a.owner_id = auth.uid()
  )
);

drop policy if exists "Chats visibles para participantes" on public.chats;
create policy "Chats visibles para participantes"
on public.chats for select
using (
  auth.uid() in (buyer_id, seller_id, owner_id, usuario_id)
  or exists (
    select 1 from public.articulos a
    where a.id = chats.articulo_id and a.owner_id = auth.uid()
  )
);

drop policy if exists "Crear chats como participante" on public.chats;
create policy "Crear chats como participante"
on public.chats for insert
with check (auth.uid() in (buyer_id, seller_id, owner_id, usuario_id));

drop policy if exists "Actualizar chats como participante" on public.chats;
create policy "Actualizar chats como participante"
on public.chats for update
using (
  auth.uid() in (buyer_id, seller_id, owner_id, usuario_id)
  or exists (
    select 1 from public.articulos a
    where a.id = chats.articulo_id and a.owner_id = auth.uid()
  )
);

drop policy if exists "Borrar chats como participante" on public.chats;
create policy "Borrar chats como participante"
on public.chats for delete
using (
  auth.uid() in (buyer_id, seller_id, owner_id, usuario_id)
  or exists (
    select 1 from public.articulos a
    where a.id = chats.articulo_id and a.owner_id = auth.uid()
  )
);

drop policy if exists "Mensajes visibles para participantes del chat" on public.chat_messages;
create policy "Mensajes visibles para participantes del chat"
on public.chat_messages for select
using (
  exists (
    select 1 from public.chats c
    where c.id = chat_messages.chat_id
    and auth.uid() in (c.buyer_id, c.seller_id, c.owner_id, c.usuario_id)
  )
);

drop policy if exists "Enviar mensajes como remitente" on public.chat_messages;
create policy "Enviar mensajes como remitente"
on public.chat_messages for insert
with check (
  auth.uid() = sender_id
  and exists (
    select 1 from public.chats c
    where c.id = chat_messages.chat_id
    and auth.uid() in (c.buyer_id, c.seller_id, c.owner_id, c.usuario_id)
  )
);

drop policy if exists "Borrar mensajes de chats propios" on public.chat_messages;
create policy "Borrar mensajes de chats propios"
on public.chat_messages for delete
using (
  exists (
    select 1 from public.chats c
    where c.id = chat_messages.chat_id
    and auth.uid() in (c.buyer_id, c.seller_id, c.owner_id, c.usuario_id)
  )
);

drop policy if exists "Lecturas propias" on public.chat_reads;
create policy "Lecturas propias"
on public.chat_reads for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
