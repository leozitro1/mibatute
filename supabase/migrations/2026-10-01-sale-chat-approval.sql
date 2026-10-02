begin;

-- A reservation starts pending; only the seller can enable its conversation.
create or replace function public.transition_sale(p_articulo_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_article public.articulos%rowtype;
  v_chat public.chats%rowtype;
  v_previous_buyer uuid;
  v_profile jsonb;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesion.' using errcode = '42501';
  end if;
  if p_action not in ('reserve', 'cancel', 'deliver', 'approve_chat') or p_action is null then
    raise exception 'Operacion de venta invalida.';
  end if;
  select to_jsonb(u) into v_profile from public.usuarios u where u.id = v_uid;
  if coalesce(v_profile->>'bloqueado', 'false') = 'true'
    or coalesce(v_profile->>'blocked', 'false') = 'true'
    or coalesce(v_profile->>'is_blocked', 'false') = 'true' then
    raise exception 'Tu cuenta esta bloqueada.' using errcode = '42501';
  end if;
  select * into v_article from public.articulos where id = p_articulo_id for update;
  if not found or v_article.mode <> 'venta' then
    raise exception 'No se encontro una venta valida.';
  end if;
  v_previous_buyer := v_article.buyer_id;

  if p_action = 'reserve' then
    if v_article.owner_id = v_uid then
      raise exception 'No puedes comprar tu propio articulo.' using errcode = '42501';
    end if;
    if not exists (select 1 from auth.users where id = v_uid and email_confirmed_at is not null) then
      raise exception 'Verifica tu correo antes de comprar.' using errcode = '42501';
    end if;
    if coalesce(v_article.status, '') <> 'disponible'
      or coalesce(v_article.estado, '') <> 'disponible'
      or v_article.buyer_id is not null then
      -- Retrying the same purchase is safe; another buyer cannot take the reservation.
      if v_article.status <> 'reservado' or v_article.estado <> 'reservado'
        or v_article.buyer_id is distinct from v_uid then
        raise exception 'Este articulo ya no esta disponible.';
      end if;
    end if;
    update public.articulos set status = 'reservado', estado = 'reservado',
      buyer_id = v_uid, comprador_id = v_uid,
      reserved_at = coalesce(reserved_at, now()), delivered_at = null, updated_at = now()
      where id = p_articulo_id returning * into v_article;
    insert into public.chats (articulo_id, buyer_id, seller_id, owner_id, status)
      values (p_articulo_id, v_uid, v_article.owner_id, v_article.owner_id, 'pending')
      on conflict (articulo_id, buyer_id) do update set status = case when public.chats.status = 'open' then 'open' else 'pending' end,
        seller_id = excluded.seller_id, owner_id = excluded.owner_id, updated_at = now()
      returning * into v_chat;

  elsif p_action = 'approve_chat' then
    if v_uid is distinct from v_article.owner_id then
      raise exception 'Solo el vendedor puede aprobar la compra y abrir el chat.' using errcode = '42501';
    end if;
    if v_article.status <> 'reservado' or v_article.estado <> 'reservado' or v_article.buyer_id is null then
      raise exception 'Solo se puede aprobar una reserva activa.';
    end if;
    update public.chats set status = 'open', updated_at = now()
      where articulo_id = p_articulo_id and buyer_id = v_article.buyer_id and status in ('pending', 'open')
      returning * into v_chat;
    if not found then
      raise exception 'No se encontro el chat de la reserva.';
    end if;

  elsif p_action = 'cancel' then
    if v_uid is distinct from v_article.owner_id and v_uid is distinct from v_article.buyer_id then
      raise exception 'No puedes cancelar esta venta.' using errcode = '42501';
    end if;
    if v_article.status <> 'reservado' or v_article.estado <> 'reservado' then
      raise exception 'Solo se puede cancelar una reserva activa.';
    end if;
    update public.articulos set status = 'disponible', estado = 'disponible',
      buyer_id = null, comprador_id = null, reserved_at = null, delivered_at = null, updated_at = now()
      where id = p_articulo_id returning * into v_article;
    update public.chats set status = 'closed', updated_at = now()
      where articulo_id = p_articulo_id and buyer_id = v_previous_buyer;

  else
    if v_uid is distinct from v_article.owner_id then
      raise exception 'Solo el vendedor puede confirmar la entrega.' using errcode = '42501';
    end if;
    if v_article.status <> 'reservado' or v_article.estado <> 'reservado' or v_article.buyer_id is null then
      raise exception 'La venta debe estar reservada antes de entregarla.';
    end if;
    update public.articulos set status = 'entregado', estado = 'entregado',
      delivered_at = now(), updated_at = now()
      where id = p_articulo_id returning * into v_article;
    update public.chats set status = 'closed', updated_at = now()
      where articulo_id = p_articulo_id and buyer_id = v_previous_buyer;
  end if;
  return jsonb_build_object('article', to_jsonb(v_article), 'chat', to_jsonb(v_chat));
end;
$$;

revoke all on function public.transition_sale(uuid, text) from public, anon;
grant execute on function public.transition_sale(uuid, text) to authenticated;

-- Existing conversations retain approval; unused legacy reservations become pending.
update public.chats c set status = 'pending'
from public.articulos a
where a.id = c.articulo_id and a.mode = 'venta' and a.status = 'reservado'
  and a.buyer_id = c.buyer_id and c.status = 'open'
  and not exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'public.chats'::regclass
    and tgname = 'guard_sale_chat' and not tgisinternal)
  and not exists (select 1 from public.chat_messages m where m.chat_id = c.id);

create or replace function public.guard_sale_chat()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  a public.articulos%rowtype;
begin
  select * into a from public.articulos where id = new.articulo_id for update;
  if a.mode <> 'venta' then
    if tg_op = 'UPDATE' and exists (select 1 from public.articulos
      where id = old.articulo_id and mode = 'venta') then
      raise exception 'No se puede cambiar el articulo de un chat de venta.' using errcode = '42501';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.articulo_id is distinct from old.articulo_id
    or new.buyer_id is distinct from old.buyer_id or new.seller_id is distinct from old.seller_id
    or new.owner_id is distinct from old.owner_id or new.usuario_id is distinct from old.usuario_id) then
    raise exception 'No se pueden cambiar los participantes del chat.' using errcode = '42501';
  end if;
  if new.status in ('open', 'pending') then
    if a.status <> 'reservado' or a.estado <> 'reservado'
      or new.buyer_id is distinct from a.buyer_id
      or new.seller_id is distinct from a.owner_id
      or new.owner_id is distinct from a.owner_id
      or (new.usuario_id is not null and new.usuario_id is distinct from a.buyer_id
        and new.usuario_id is distinct from a.owner_id) then
      raise exception 'El chat no corresponde a una reserva activa.' using errcode = '42501';
    end if;
    if new.status = 'open' and auth.uid() is distinct from a.owner_id
      and (tg_op = 'INSERT' or old.status is distinct from 'open') then
      raise exception 'Para hablar con el vendedor, el debe aprobar la compra.' using errcode = '42501';
    end if;
  elsif new.status <> 'closed' or new.status is null then
    raise exception 'Estado de chat invalido.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_sale_chat on public.chats;
create trigger guard_sale_chat before insert or update on public.chats
for each row execute function public.guard_sale_chat();

create or replace function public.guard_sale_message()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  a public.articulos%rowtype;
  c public.chats%rowtype;
begin
  select * into c from public.chats where id = new.chat_id;
  select * into a from public.articulos where id = c.articulo_id for update;
  -- Locking the article serializes sends with approval, cancellation and delivery.
  select * into c from public.chats where id = new.chat_id;
  if a.mode = 'venta' and (c.status <> 'open' or a.status <> 'reservado'
    or a.estado <> 'reservado' or a.buyer_id is distinct from c.buyer_id
    or new.sender_id not in (c.buyer_id, a.owner_id)) then
    raise exception 'Para hablar con el vendedor, el debe aprobar la compra. El chat debe estar activo.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_sale_message on public.chat_messages;
create trigger guard_sale_message before insert or update on public.chat_messages
for each row execute function public.guard_sale_message();
revoke all on function public.guard_sale_chat(), public.guard_sale_message() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
