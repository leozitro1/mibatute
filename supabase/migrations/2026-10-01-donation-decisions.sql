begin;

drop policy if exists "Rechazos propios o del donante" on public.postulaciones_rechazadas;
create policy "Rechazos propios o del donante" on public.postulaciones_rechazadas for select
using (usuario_id = auth.uid() or exists (select 1 from public.articulos a
  where a.id = articulo_id and a.owner_id = auth.uid()));

create or replace function public.record_donation_rejection()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.articulos%rowtype;
begin
  select * into a from public.articulos where id = old.articulo_id for update;
  if a.mode = 'donacion' and a.owner_id = auth.uid()
    and old.usuario_id is distinct from coalesce(a.ganador_id,a.winner_id,a.recipient_id) then
    insert into public.postulaciones_rechazadas(articulo_id,usuario_id,created_at)
      values(old.articulo_id,old.usuario_id,now())
      on conflict (articulo_id,usuario_id) do update set created_at = excluded.created_at;
    update public.chats set status = 'closed' where articulo_id = old.articulo_id and buyer_id = old.usuario_id;
  end if;
  return old;
end;
$$;
drop trigger if exists record_donation_rejection on public.postulaciones;
create trigger record_donation_rejection after delete on public.postulaciones
for each row execute function public.record_donation_rejection();

create or replace function public.guard_donation_application()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.articulos%rowtype;
begin
  select * into a from public.articulos where id = new.articulo_id for update;
  if a.mode <> 'donacion' then return new; end if;
  if exists (select 1 from public.postulaciones_rechazadas where articulo_id = new.articulo_id
    and usuario_id = new.usuario_id and created_at > now() - interval '24 hours') then
    raise exception 'Tu solicitud fue rechazada. Debes esperar 24 horas antes de volver a postularte a esta publicacion.' using errcode = '42501';
  end if;
  if a.owner_id = new.usuario_id or a.status <> 'disponible' or a.estado <> 'disponible'
    or coalesce(a.ganador_id,a.winner_id,a.recipient_id) is not null then
    raise exception 'Esta donacion no acepta postulaciones.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.postulaciones where articulo_id = new.articulo_id) >= 10 then
    raise exception 'Esta donacion ya alcanzo el maximo de postulaciones.';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_donation_application on public.postulaciones;
create trigger guard_donation_application before insert or update on public.postulaciones
for each row execute function public.guard_donation_application();

create or replace function public.guard_donation_choice()
returns trigger language plpgsql security definer set search_path = '' as $$
declare winner uuid := coalesce(new.ganador_id,new.winner_id,new.recipient_id);
begin
  if new.mode = 'donacion' and winner is not null
    and winner is distinct from coalesce(old.ganador_id,old.winner_id,old.recipient_id) then
    if auth.uid() is distinct from old.owner_id or old.status <> 'disponible'
      or new.status <> 'reservado' or new.estado <> 'reservado'
      or not exists (select 1 from public.postulaciones where articulo_id = old.id and usuario_id = winner)
      or exists (select 1 from public.postulaciones_rechazadas where articulo_id = old.id
        and usuario_id = winner and created_at > now() - interval '24 hours') then
      raise exception 'Solo el donante puede aceptar a un aspirante activo.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_donation_choice on public.articulos;
create trigger guard_donation_choice before update on public.articulos
for each row execute function public.guard_donation_choice();

create or replace function public.activate_donation_choice()
returns trigger language plpgsql security definer set search_path = '' as $$
declare winner uuid := coalesce(new.ganador_id,new.winner_id,new.recipient_id);
begin
  if new.mode = 'donacion' and winner is not null and new.status = 'reservado'
    and winner is distinct from coalesce(old.ganador_id,old.winner_id,old.recipient_id) then
    delete from public.postulaciones where articulo_id = new.id and usuario_id <> winner;
    update public.chats set status = 'closed' where articulo_id = new.id and buyer_id is distinct from winner;
    insert into public.chats(articulo_id,buyer_id,seller_id,owner_id,status)
      values(new.id,winner,new.owner_id,new.owner_id,'open')
      on conflict (articulo_id,buyer_id) do update set status = 'open', updated_at = now();
  elsif new.mode = 'donacion' and new.status in ('disponible','entregado') and old.status = 'reservado' then
    update public.chats set status = 'closed' where articulo_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists activate_donation_choice on public.articulos;
create trigger activate_donation_choice after update on public.articulos
for each row execute function public.activate_donation_choice();

create or replace function public.guard_donation_chat()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.articulos%rowtype;
begin
  select * into a from public.articulos where id = new.articulo_id for update;
  if a.mode <> 'donacion' then return new; end if;
  if tg_op = 'UPDATE' and (new.articulo_id is distinct from old.articulo_id
    or new.buyer_id is distinct from old.buyer_id or new.seller_id is distinct from old.seller_id
    or new.owner_id is distinct from old.owner_id or new.usuario_id is distinct from old.usuario_id) then
    raise exception 'No se pueden cambiar los participantes del chat.' using errcode = '42501';
  end if;
  if new.status <> 'closed' and (new.status <> 'open' or a.status <> 'reservado' or a.estado <> 'reservado'
    or new.buyer_id is distinct from coalesce(a.ganador_id,a.winner_id,a.recipient_id)
    or coalesce(new.seller_id,new.owner_id,new.usuario_id) is distinct from a.owner_id
    or (new.seller_id is not null and new.seller_id is distinct from a.owner_id)
    or (new.owner_id is not null and new.owner_id is distinct from a.owner_id)
    or (new.usuario_id is not null and new.usuario_id not in (a.owner_id,new.buyer_id))
    or exists (select 1 from public.postulaciones_rechazadas where articulo_id = a.id
      and usuario_id = new.buyer_id and created_at > now() - interval '24 hours')) then
    raise exception 'El donante debe aceptar al aspirante antes de abrir el chat.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_donation_chat on public.chats;
create trigger guard_donation_chat before insert or update on public.chats
for each row execute function public.guard_donation_chat();

create or replace function public.guard_donation_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.articulos%rowtype; c public.chats%rowtype;
begin
  select * into c from public.chats where id = new.chat_id;
  select * into a from public.articulos where id = c.articulo_id for update;
  select * into c from public.chats where id = new.chat_id;
  if a.mode = 'donacion' and (c.status <> 'open' or a.status <> 'reservado' or a.estado <> 'reservado'
    or c.buyer_id is distinct from coalesce(a.ganador_id,a.winner_id,a.recipient_id)
    or new.sender_id not in (a.owner_id,c.buyer_id)) then
    raise exception 'El chat solo esta disponible para el aspirante aceptado durante la reserva.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_donation_message on public.chat_messages;
create trigger guard_donation_message before insert or update on public.chat_messages
for each row execute function public.guard_donation_message();

-- Active applications and recent rejections share the existing profile read.
create or replace function public.my_rescue_applications()
returns setof jsonb language sql stable security invoker set search_path = public as $$
  with applications as (
    select id,articulo_id,created_at,justificacion,false as rejected from public.postulaciones where usuario_id = auth.uid()
    union all
    select id,articulo_id,created_at,null::text,true from public.postulaciones_rechazadas
      where usuario_id = auth.uid() and created_at > now() - interval '24 hours'
  )
  select jsonb_build_object('id',p.id,'articulo_id',p.articulo_id,'created_at',p.created_at,
    'justificacion',p.justificacion,'_source',case when p.rejected then 'rechazadas' else 'postulaciones' end,
    '_rejectedAt',case when p.rejected then p.created_at else null end,
    'articulo',to_jsonb(snapshot) || jsonb_build_object('articulo_imagenes',coalesce(
      (select jsonb_agg(jsonb_build_object('id',i.id,'url',i.url,'position',i.position) order by i.position,i.id)
        from public.articulo_imagenes i where i.articulo_id = a.id),'[]'::jsonb)))
  from applications p join public.articulos a on a.id = p.articulo_id
  cross join lateral (select a.id,a.title,a.mode,a.estado,a.status,a.city,a.locality,a.price,
    a.owner_id,a.usuario_id,a.buyer_id,a.ganador_id,a.winner_id,a.recipient_id,
    a.image_url,a.imagen_url_principal,a.imagenes,a.delivered_at,a.updated_at,a.created_at) snapshot
  where auth.uid() is not null;
$$;
revoke all on function public.my_rescue_applications() from public, anon;
grant execute on function public.my_rescue_applications() to authenticated;
revoke all on function public.record_donation_rejection(),public.guard_donation_application(),
  public.guard_donation_choice(),public.activate_donation_choice(),public.guard_donation_chat(),public.guard_donation_message()
  from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
