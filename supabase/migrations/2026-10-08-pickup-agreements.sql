begin;

create table if not exists public.chat_pickups (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  proposed_by uuid not null references auth.users(id),
  pickup_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','rejected','canceled','replaced','completed')),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  ended_by uuid references auth.users(id),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (start_time < end_time and end_time < time '24:00'),
  check ((confirmed_by is null) = (confirmed_at is null)),
  check (confirmed_by is null or confirmed_by <> proposed_by)
);
create unique index if not exists chat_pickups_one_active on public.chat_pickups(chat_id)
  where status in ('pending','confirmed');
create index if not exists chat_pickups_history on public.chat_pickups(chat_id,created_at desc,id);

-- SECURITY DEFINER avoids depending on legacy chat policies with wider aliases.
create or replace function public.can_read_chat_pickups(p_chat_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.chats c where c.id = p_chat_id
      and auth.uid() in (c.buyer_id,c.seller_id)
  ) and not exists (
    select 1 from public.usuarios u where u.id = auth.uid() and (
      coalesce((to_jsonb(u)->>'is_blocked')::boolean,false)
      or coalesce((to_jsonb(u)->>'bloqueado')::boolean,false)
      or coalesce((to_jsonb(u)->>'blocked')::boolean,false)
      or (to_jsonb(u)->>'ban_until')::timestamptz > now())
  );
$$;
alter table public.chat_pickups enable row level security;
drop policy if exists pickup_participants on public.chat_pickups;
create policy pickup_participants on public.chat_pickups for select to authenticated
  using (public.can_read_chat_pickups(chat_id));
-- Base schema grants default table privileges; explicitly remove write access.
revoke all on public.chat_pickups from public,anon,authenticated;
grant select on public.chat_pickups to authenticated;
revoke all on function public.can_read_chat_pickups(uuid) from public,anon;
grant execute on function public.can_read_chat_pickups(uuid) to authenticated;

create or replace function public.lock_pickup_chat(p_chat_id uuid)
returns public.chats language plpgsql security definer set search_path = '' as $$
declare c public.chats%rowtype; a public.articulos%rowtype; recipient uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.' using errcode = '42501';
  end if;
  select * into c from public.chats where id = p_chat_id;
  if not found then raise exception 'Chat no disponible.' using errcode = '42501'; end if;
  -- Match transaction RPC lock order: article, chat, then agreement.
  select * into a from public.articulos where id = c.articulo_id for update;
  select * into c from public.chats where id = p_chat_id for update;
  if c.id is null or a.id is null or auth.uid() not in (c.buyer_id,c.seller_id)
    or c.buyer_id is null or c.seller_id is null or c.buyer_id = c.seller_id then
    raise exception 'No tienes permiso para este chat.' using errcode = '42501';
  end if;
  if exists (select 1 from public.usuarios u where u.id in (c.buyer_id,c.seller_id) and (
    coalesce((to_jsonb(u)->>'is_blocked')::boolean,false)
    or coalesce((to_jsonb(u)->>'bloqueado')::boolean,false)
    or coalesce((to_jsonb(u)->>'blocked')::boolean,false)
    or (to_jsonb(u)->>'ban_until')::timestamptz > now())) then
    raise exception 'Una cuenta esta bloqueada.' using errcode = '42501';
  end if;
  recipient := case a.mode when 'venta' then a.buyer_id
    when 'donacion' then coalesce(a.ganador_id,a.winner_id,a.recipient_id) end;
  if c.articulo_id is distinct from a.id or c.status is distinct from 'open' or a.status is distinct from 'reservado'
    or a.estado is distinct from 'reservado' or recipient is null
    or c.buyer_id is distinct from recipient or c.seller_id is distinct from a.owner_id
    or (c.owner_id is not null and c.owner_id is distinct from a.owner_id)
    or (c.usuario_id is not null and c.usuario_id not in (c.buyer_id,c.seller_id)) then
    raise exception 'La recogida requiere un chat abierto y una reserva activa valida.' using errcode = '42501';
  end if;
  return c;
end;
$$;
revoke all on function public.lock_pickup_chat(uuid) from public,anon,authenticated;

create or replace function public.propose_chat_pickup(p_chat_id uuid,p_date date,p_start time,p_end time,
  p_replace_id uuid default null)
returns public.chat_pickups language plpgsql security definer set search_path = '' as $$
declare c public.chats%rowtype; previous public.chat_pickups%rowtype; result public.chat_pickups%rowtype;
begin
  c := public.lock_pickup_chat(p_chat_id);
  if p_date is null or p_start is null or p_end is null or p_start >= p_end
    or p_end >= time '24:00'
    or ((p_date + p_start) at time zone 'America/Bogota') <= clock_timestamp() then
    raise exception 'Elige una fecha futura y una franja valida del mismo dia en America/Bogota.';
  end if;
  select * into previous from public.chat_pickups where chat_id = c.id
    and status in ('pending','confirmed') for update;
  if previous.id is not null then
    if p_replace_id is distinct from previous.id then
      raise exception 'Ya existe una recogida. Confirma explicitamente su reemplazo.';
    end if;
    update public.chat_pickups set status = 'replaced',ended_by = auth.uid(),ended_at = now()
      where id = previous.id;
  elsif p_replace_id is not null then
    raise exception 'La recogida cambio. Actualiza antes de reemplazarla.';
  end if;
  insert into public.chat_pickups(chat_id,proposed_by,pickup_date,start_time,end_time)
    values(c.id,auth.uid(),p_date,p_start,p_end) returning * into result;
  return result;
end;
$$;

create or replace function public.respond_chat_pickup(p_pickup_id uuid,p_action text)
returns public.chat_pickups language plpgsql security definer set search_path = '' as $$
declare result public.chat_pickups%rowtype; c public.chats%rowtype; chat_id uuid;
begin
  select p.chat_id into chat_id from public.chat_pickups p where p.id = p_pickup_id;
  c := public.lock_pickup_chat(chat_id);
  select * into result from public.chat_pickups where id = p_pickup_id for update;
  if p_action is null or p_action not in ('confirm','reject','cancel') then
    raise exception 'Accion de recogida invalida.';
  end if;
  if result.status not in ('pending','confirmed') then
    raise exception 'La recogida ya cambio. Actualiza el chat.';
  end if;
  if p_action in ('confirm','reject') then
    if result.status <> 'pending' or result.proposed_by = auth.uid() then
      raise exception 'Solo la otra persona puede confirmar o rechazar una propuesta pendiente.' using errcode = '42501';
    end if;
  end if;
  if p_action = 'confirm' then
    if ((result.pickup_date + result.start_time) at time zone 'America/Bogota') <= clock_timestamp() then
      raise exception 'La franja ya paso. Propongan una nueva recogida.';
    end if;
    update public.chat_pickups set status = 'confirmed',confirmed_by = auth.uid(),confirmed_at = now()
      where id = result.id returning * into result;
  else
    update public.chat_pickups set status = case p_action when 'reject' then 'rejected' else 'canceled' end,
      ended_by = auth.uid(),ended_at = now() where id = result.id returning * into result;
  end if;
  return result;
end;
$$;
revoke all on function public.propose_chat_pickup(uuid,date,time,time,uuid),
  public.respond_chat_pickup(uuid,text) from public,anon;
grant execute on function public.propose_chat_pickup(uuid,date,time,time,uuid),
  public.respond_chat_pickup(uuid,text) to authenticated;

-- Ending/changing a reservation retires its agreement, including when chats reopen.
create or replace function public.retire_chat_pickups()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'chats' then
    if new.status is distinct from 'open' or new.articulo_id is distinct from old.articulo_id
      or new.buyer_id is distinct from old.buyer_id or new.seller_id is distinct from old.seller_id
      or new.owner_id is distinct from old.owner_id or new.usuario_id is distinct from old.usuario_id then
      update public.chat_pickups set status = case when status = 'confirmed' and exists (
          select 1 from public.articulos a where a.id = new.articulo_id
            and a.status = 'entregado' and a.estado = 'entregado'
        ) then 'completed' else 'canceled' end,ended_at = now(),ended_by = auth.uid()
        where chat_id = new.id and status in ('pending','confirmed');
    end if;
  elsif new.status is distinct from 'reservado' or new.estado is distinct from 'reservado'
    or new.owner_id is distinct from old.owner_id or new.mode is distinct from old.mode
    or new.buyer_id is distinct from old.buyer_id
    or coalesce(new.ganador_id,new.winner_id,new.recipient_id)
      is distinct from coalesce(old.ganador_id,old.winner_id,old.recipient_id) then
    update public.chat_pickups set status = case when status = 'confirmed'
        and new.status = 'entregado' and new.estado = 'entregado'
        then 'completed' else 'canceled' end,ended_at = now(),ended_by = auth.uid()
      where chat_id in (select id from public.chats where articulo_id = new.id)
      and status in ('pending','confirmed');
  end if;
  return new;
end;
$$;
drop trigger if exists retire_chat_pickups on public.chats;
create trigger retire_chat_pickups after update on public.chats
  for each row execute function public.retire_chat_pickups();
drop trigger if exists retire_article_pickups on public.articulos;
create trigger retire_article_pickups after update on public.articulos
  for each row execute function public.retire_chat_pickups();
revoke all on function public.retire_chat_pickups() from public,anon,authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_pickups') then
    alter publication supabase_realtime add table public.chat_pickups;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
