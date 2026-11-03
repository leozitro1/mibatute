begin;

-- MiBatute records cancellations, not declarations or disputes about external payments.
-- Keep existing cases/history and their staff tools intact; do not create new cases.
create or replace function public.sale_safety_action(p_chat uuid,p_reservation uuid,p_action text,p_reason text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_report_sender(); r public.sale_reservations%rowtype; a public.articulos%rowtype;
 detail_reason text:=trim(coalesce(p_reason,'')); result jsonb; target_buyer uuid;
begin
 if p_action is distinct from 'cancel' then raise exception 'Solo está disponible la cancelación de reservas.'; end if;
 if length(detail_reason)>500 then raise exception 'El motivo no puede superar 500 caracteres.'; end if;
 if detail_reason='' then detail_reason:='Reserva cancelada por el participante.'; end if;
 select * into r from public.sale_reservations where id=p_reservation and chat_id=p_chat;
 if not found or uid not in (r.buyer_id,r.seller_id) then raise exception 'Reserva ajena o inexistente.' using errcode='42501'; end if;
 select buyer_id into target_buyer from public.articulos where id=r.articulo_id;
 if target_buyer is not null then perform pg_advisory_xact_lock(hashtextextended(target_buyer::text,1313)); end if;
 select * into a from public.articulos where id=r.articulo_id for update;
 if not found or a.mode<>'venta' then raise exception 'La venta ya no está disponible.'; end if;
 if a.buyer_id is distinct from target_buyer then raise exception 'La reserva cambió. Actualiza antes de continuar.'; end if;
 select * into r from public.sale_reservations where id=p_reservation for update;
 if r.ended_at is not null then raise exception 'Esta reserva ya terminó. Actualiza la página.'; end if;
 if exists(select 1 from public.sale_dispute_holds where articulo_id=a.id) then
  raise exception 'Esta reserva tiene una revisión anterior pendiente. Contacta a MiBatute desde el buzón.';
 end if;
 if a.status<>'reservado' or a.estado<>'reservado' or a.buyer_id is distinct from r.buyer_id then
  raise exception 'La reserva cambió. Actualiza la página.';
 end if;
 update public.sale_reservations set ended_at=now(),canceled_by=uid,cancel_reason=detail_reason where id=r.id;
 if uid=r.seller_id then
  insert into public.sale_buyer_blocks(articulo_id,buyer_id,reservation_id) values(a.id,r.buyer_id,r.id)
   on conflict(articulo_id,buyer_id) do update set reservation_id=excluded.reservation_id,created_at=now();
 end if;
 insert into public.sale_change_permits values(a.id,txid_current(),uid,'disponible',null);
 result:=public.transition_sale_with_credit(a.id,'cancel',false);
 return result||jsonb_build_object('state',public.sale_safety_status(a.id,p_chat),'notice',
  case when uid=r.seller_id then 'Reserva cancelada. El artículo vuelve a estar disponible.'
  else 'Reserva cancelada. El artículo vuelve a estar disponible. Si usaste un crédito para reservar, no se devuelve al retirarte.' end);
end $$;
revoke all on function public.sale_safety_action(uuid,uuid,text,text) from public,anon;
grant execute on function public.sale_safety_action(uuid,uuid,text,text) to authenticated;
create or replace function public.guard_approved_sale_update() returns trigger language plpgsql security definer set search_path='' as $$
declare permitted boolean:=false; protected_change boolean;
begin
 if old.mode<>'venta' then return new; end if;
 protected_change:=new.status is distinct from old.status or new.estado is distinct from old.estado
  or new.buyer_id is distinct from old.buyer_id or new.comprador_id is distinct from old.comprador_id
  or new.mode is distinct from old.mode or new.owner_id is distinct from old.owner_id;
 if auth.uid() is null then return new; end if;
 delete from public.sale_change_permits where articulo_id=old.id and transaction_id=txid_current()
  and actor_id=auth.uid() and target_status=new.status and new.estado=new.status
  and target_buyer is not distinct from new.buyer_id and new.comprador_id is not distinct from new.buyer_id
  and new.mode=old.mode and new.owner_id=old.owner_id returning true into permitted;
 if coalesce(permitted,false) then return new; end if;
 if exists(select 1 from public.sale_dispute_holds where articulo_id=old.id) then
  raise exception 'Esta publicación tiene un caso de pago en revisión. Administración debe resolverlo.' using errcode='42501';
 end if;
 if old.status='entregado' and (protected_change or new.delivered_at is distinct from old.delivered_at) then
  raise exception 'Una venta entregada no puede reabrirse ni cambiar su fecha de entrega.' using errcode='42501';
 end if;
 if old.status='reservado' and protected_change and not(new.status='entregado' and new.estado='entregado'
  and new.buyer_id=old.buyer_id and new.comprador_id is not distinct from old.comprador_id
  and new.mode=old.mode and new.owner_id=old.owner_id) then
  raise exception 'Cancela desde la gestión de la reserva.' using errcode='42501';
 end if;
 if new.buyer_id is not null and new.buyer_id is distinct from old.buyer_id
  and exists(select 1 from public.sale_buyer_blocks where articulo_id=old.id and buyer_id=new.buyer_id) then
  raise exception 'El vendedor canceló tu reserva anterior. No puedes volver a reservar esta publicación.' using errcode='42501';
 end if;
 if old.status<>'entregado' and new.status='entregado' then new.delivered_at:=now(); end if;
 return new;
end $$;

notify pgrst,'reload schema';
commit;
