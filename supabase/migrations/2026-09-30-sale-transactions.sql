begin;

-- Reservation, buyer assignment and chat creation commit together under a row lock.
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
  if p_action not in ('reserve', 'cancel', 'deliver') or p_action is null then
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
      values (p_articulo_id, v_uid, v_article.owner_id, v_article.owner_id, 'open')
      on conflict (articulo_id, buyer_id) do update set status = 'open',
        seller_id = excluded.seller_id, owner_id = excluded.owner_id, updated_at = now()
      returning * into v_chat;

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
notify pgrst, 'reload schema';
commit;
