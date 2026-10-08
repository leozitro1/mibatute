begin;

-- Event snapshots survive changes/deletions of their source without copying private messages.
create table if not exists public.activity_notifications (
  id text not null,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  articulo_id uuid,
  chat_id uuid,
  buyer_id uuid,
  title text not null,
  subtitle text not null default '',
  thumb text not null default '',
  created_at timestamptz not null default now(),
  primary key (recipient_id,id)
);
create index if not exists activity_notifications_recent
  on public.activity_notifications(recipient_id,created_at desc,id);
alter table public.activity_notifications add column if not exists receipt_id uuid;
alter table public.activity_notifications enable row level security;
drop policy if exists own_activity_notifications on public.activity_notifications;
create policy own_activity_notifications on public.activity_notifications for select to authenticated
  using (recipient_id = auth.uid());
revoke all on public.activity_notifications from public,anon,authenticated;
grant select on public.activity_notifications to authenticated;

-- A notification identifies a conversation, including an ended reservation, not the latest buyer.
create or replace function public.notification_chat_context(p_chat_id uuid)
returns setof jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',a.id,'title',a.title,'mode',a.mode,'owner_id',a.owner_id,
    'buyer_id',a.buyer_id,'ganador_id',a.ganador_id,'winner_id',a.winner_id,'recipient_id',a.recipient_id,
    'status',a.status,'estado',a.estado,'created_at',a.created_at,'delivered_at',a.delivered_at,
    'image_url',a.image_url,'imagen_url_principal',a.imagen_url_principal,
    'transaction_chat',to_jsonb(c),
    'owner_public',(select jsonb_build_object('id',u.id,'nombre',u.nombre,'foto_url',u.foto_url)
      from public.usuarios_publicos u where u.id=c.seller_id),
    'buyer_public',(select jsonb_build_object('id',u.id,'nombre',u.nombre,'foto_url',u.foto_url)
      from public.usuarios_publicos u where u.id=c.buyer_id)
  )
  from public.chats c join public.articulos a on a.id=c.articulo_id
  where c.id=p_chat_id and auth.uid() is not null and auth.uid() in (c.buyer_id,c.seller_id)
    and not exists(select 1 from public.usuarios u where u.id=auth.uid() and (
      coalesce((to_jsonb(u)->>'is_blocked')::boolean,false)
      or coalesce((to_jsonb(u)->>'bloqueado')::boolean,false)
      or coalesce((to_jsonb(u)->>'blocked')::boolean,false)
      or (to_jsonb(u)->>'ban_until')::timestamptz>now()));
$$;
revoke all on function public.notification_chat_context(uuid) from public,anon;
grant execute on function public.notification_chat_context(uuid) to authenticated;

create or replace function public.notification_inbox()
returns setof jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',sm.id,'receipt_id',r.id,'title',sm.title,
    'message',coalesce(to_jsonb(sm)->>'message',to_jsonb(sm)->>'body',''),
    'severity',coalesce(to_jsonb(sm)->>'severity','info'),'created_at',sm.created_at,'read_at',r.read_at)
  from public.system_message_receipts r join public.system_messages sm on sm.id=r.message_id
  where auth.uid() is not null and r.user_id=auth.uid()
  order by r.created_at desc,r.id limit 50;
$$;
revoke all on function public.notification_inbox() from public,anon;
grant execute on function public.notification_inbox() to authenticated;

create or replace function public.notification_receipt_action(p_receipt_id uuid,p_action text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.system_message_receipts where id=p_receipt_id and user_id=auth.uid()) then
    raise exception 'Este aviso no existe o no tienes permiso.' using errcode='42501';
  end if;
  if p_action='delete' then
    delete from public.system_message_receipts where id=p_receipt_id and user_id=auth.uid();
  elsif p_action in ('read','unread') then
    update public.system_message_receipts set read_at=case when p_action='read' then now() else null end
      where id=p_receipt_id and user_id=auth.uid();
  else raise exception 'Accion de aviso invalida.';
  end if;
end;
$$;
revoke all on function public.notification_receipt_action(uuid,text) from public,anon;
grant execute on function public.notification_receipt_action(uuid,text) to authenticated;

create or replace function public.append_activity_notification(
  p_recipient uuid,p_id text,p_type text,p_title text,p_article uuid default null,
  p_chat uuid default null,p_buyer uuid default null,p_at timestamptz default now(),p_detail text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare a public.articulos%rowtype;
begin
  if p_recipient is null then return; end if;
  if p_article is not null then select * into a from public.articulos where id=p_article; end if;
  insert into public.activity_notifications(recipient_id,id,type,title,articulo_id,chat_id,buyer_id,created_at,subtitle,thumb)
  values(p_recipient,p_id,p_type,left(p_title,512),p_article,p_chat,p_buyer,p_at,
    left(concat_ws(' · ',nullif(a.title,''),nullif(p_detail,'')),1024),
    left(coalesce(a.image_url,a.imagen_url_principal,''),2048))
  on conflict(recipient_id,id) do nothing;
  -- Bounded storage as well as a bounded indexed read; no cron or polling required.
  delete from public.activity_notifications where recipient_id=p_recipient and id in (
    select id from public.activity_notifications where recipient_id=p_recipient
    order by created_at desc,id offset 50
  );
end;
$$;
revoke all on function public.append_activity_notification(uuid,text,text,text,uuid,uuid,uuid,timestamptz,text)
  from public,anon,authenticated;

create or replace function public.record_activity_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.chats%rowtype; actor uuid; recipient uuid; kind text; heading text; event_at timestamptz;
  source_id text; article_id uuid; chat_id uuid; buyer_id uuid; detail text := ''; previous_recipient uuid;
begin
  source_id := new.id::text;
  event_at := coalesce((to_jsonb(new)->>'created_at')::timestamptz,now());
  if tg_table_name='chat_pickups' then
    select * into c from public.chats where id=new.chat_id;
    article_id := c.articulo_id; chat_id := c.id; buyer_id := c.buyer_id;
    if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
    if tg_op='INSERT' then
      actor := new.proposed_by; kind := 'pickup_proposed'; heading := 'Propuesta de recogida';
      if exists(select 1 from public.chat_pickups p where p.chat_id=c.id and p.status='replaced' and p.ended_at=new.created_at) then
        heading := 'Nuevo horario de recogida';
      end if;
    elsif new.status='confirmed' then
      actor := new.confirmed_by; event_at := new.confirmed_at; kind := 'pickup_confirmed'; heading := 'Recogida confirmada';
    elsif new.status in ('rejected','canceled') then
      actor := new.ended_by; event_at := new.ended_at; kind := 'pickup_'||new.status;
      heading := case new.status when 'rejected' then 'Propuesta de recogida rechazada' else 'Recogida cancelada' end;
      -- A reservation ending has its own notice; do not send two for one action.
      if not exists(select 1 from public.articulos where id=c.articulo_id and status='reservado' and estado='reservado') then return new; end if;
    else return new;
    end if;
    if actor not in (c.buyer_id,c.seller_id) or actor is null then return new; end if;
    recipient := case when actor=c.buyer_id then c.seller_id else c.buyer_id end;
    detail := to_char(new.pickup_date,'DD/MM/YYYY')||' · '||to_char(new.start_time,'HH24:MI')||' - '||to_char(new.end_time,'HH24:MI')||' (Bogotá)';
  elsif tg_table_name='postulaciones_rechazadas' then
    if tg_op='UPDATE' and new.created_at is not distinct from old.created_at then return new; end if;
    recipient := new.usuario_id; article_id := new.articulo_id;
    kind := 'donation_rejected'; heading := 'Postulación no seleccionada';
    detail := 'Puedes volver a postularte después de 24 horas si sigue disponible.';
  elsif tg_table_name='chats' then
    if old.status='pending' and new.status='open' then
      recipient := new.buyer_id; article_id := new.articulo_id; chat_id := new.id; buyer_id := new.buyer_id;
      kind := 'sale_approved'; heading := 'Compra aprobada'; event_at := coalesce(new.approved_at,new.updated_at,now());
    else return new;
    end if;
  elsif tg_table_name='articulos' then
    article_id := new.id;
    event_at := now();
    previous_recipient := case when old.mode='venta' then old.buyer_id else coalesce(old.ganador_id,old.winner_id,old.recipient_id) end;
    if new.mode='donacion' and new.status='reservado' and
      coalesce(new.ganador_id,new.winner_id,new.recipient_id) is distinct from coalesce(old.ganador_id,old.winner_id,old.recipient_id) then
      recipient := coalesce(new.ganador_id,new.winner_id,new.recipient_id); buyer_id := recipient;
      kind := 'donation_accepted'; heading := 'Tu postulación fue elegida';
    elsif old.status='reservado' and new.status='disponible' then
      recipient := case when auth.uid()=previous_recipient then old.owner_id else previous_recipient end;
      buyer_id := previous_recipient;
      kind := 'reservation_canceled'; heading := 'Reserva cancelada';
    elsif old.status is distinct from 'entregado' and new.status='entregado' then
      recipient := previous_recipient; buyer_id := recipient;
      kind := 'delivery_completed'; heading := 'Entrega completada'; event_at := coalesce(new.delivered_at,now());
      detail := 'Puedes calificar la transacción desde tu perfil.';
    elsif new.status='en_revision' and old.status is distinct from new.status then
      recipient := new.owner_id; kind := 'publication_review'; heading := 'Publicación en revisión';
    elsif old.status='en_revision' and new.status='disponible' then
      recipient := new.owner_id; kind := 'publication_approved'; heading := 'Publicación aprobada';
    else return new;
    end if;
    select candidate.id into chat_id from public.chats candidate where candidate.articulo_id=new.id
      and candidate.buyer_id=coalesce(previous_recipient,recipient) order by candidate.created_at desc limit 1;
    event_at := coalesce(event_at,now());
  elsif tg_table_name='reputacion' then
    if new.reviewer_id=new.reviewed_id then return new; end if;
    recipient := new.reviewed_id; article_id := new.articulo_id;
    kind := 'rating_received'; heading := 'Recibiste una calificación'; detail := new.estrellas::text||' de 5 estrellas';
  elsif tg_table_name='cupos_historial' then
    if new.cantidad<=0 then return new; end if;
    recipient := new.usuario_id; kind := 'credits_received'; heading := 'Créditos recibidos'; detail := '+'||new.cantidad::text||' créditos';
  elsif tg_table_name='recargas_pendientes' then
    if new.estado is not distinct from old.estado or new.estado not in ('rechazada','rechazado') then return new; end if;
    recipient := new.usuario_id; kind := 'topup_rejected'; heading := 'Recarga no aprobada'; event_at := new.updated_at;
  elsif tg_table_name='system_message_receipts' then
    recipient := new.user_id; kind := 'system_notice';
    select left(coalesce(nullif(title,''),'Aviso de MiBatute'),512) into heading from public.system_messages where id=new.message_id;
  else return new;
  end if;
  perform public.append_activity_notification(recipient,kind||'-'||source_id||'-'||extract(epoch from event_at)::text,
    kind,heading,article_id,chat_id,buyer_id,event_at,detail);
  if tg_table_name='system_message_receipts' then
    update public.activity_notifications set receipt_id=new.id where recipient_id=recipient
      and id=kind||'-'||source_id||'-'||extract(epoch from event_at)::text;
  end if;
  return new;
end;
$$;
revoke all on function public.record_activity_notification() from public,anon,authenticated;

drop trigger if exists notify_pickup_activity on public.chat_pickups;
create trigger notify_pickup_activity after insert or update on public.chat_pickups for each row execute function public.record_activity_notification();
drop trigger if exists notify_donation_rejection on public.postulaciones_rechazadas;
create trigger notify_donation_rejection after insert or update on public.postulaciones_rechazadas for each row execute function public.record_activity_notification();
drop trigger if exists notify_chat_approval on public.chats;
create trigger notify_chat_approval after update on public.chats for each row execute function public.record_activity_notification();
drop trigger if exists notify_article_activity on public.articulos;
create trigger notify_article_activity after update on public.articulos for each row execute function public.record_activity_notification();
drop trigger if exists notify_rating on public.reputacion;
create trigger notify_rating after insert on public.reputacion for each row execute function public.record_activity_notification();
drop trigger if exists notify_credits on public.cupos_historial;
create trigger notify_credits after insert on public.cupos_historial for each row execute function public.record_activity_notification();
drop trigger if exists notify_topup_rejection on public.recargas_pendientes;
create trigger notify_topup_rejection after update on public.recargas_pendientes for each row execute function public.record_activity_notification();
drop trigger if exists notify_system_notice on public.system_message_receipts;
create trigger notify_system_notice after insert on public.system_message_receipts for each row execute function public.record_activity_notification();

-- Existing recent proposals are also visible after installing this migration.
do $$ declare p record; recipient uuid; begin
  for p in select pickup.*,c.articulo_id,c.buyer_id,c.seller_id from public.chat_pickups pickup
    join public.chats c on c.id=pickup.chat_id where pickup.created_at>now()-interval '60 days'
      and pickup.proposed_by in (c.buyer_id,c.seller_id) order by pickup.created_at,pickup.id loop
    recipient := case when p.proposed_by=p.buyer_id then p.seller_id else p.buyer_id end;
    perform public.append_activity_notification(recipient,'pickup_proposed-'||p.id::text||'-'||extract(epoch from p.created_at)::text,
      'pickup_proposed','Propuesta de recogida',p.articulo_id,p.chat_id,p.buyer_id,p.created_at,
      to_char(p.pickup_date,'DD/MM/YYYY')||' · '||to_char(p.start_time,'HH24:MI')||' - '||to_char(p.end_time,'HH24:MI')||' (Bogotá)');
    if p.confirmed_at is not null then
      perform public.append_activity_notification(p.proposed_by,'pickup_confirmed-'||p.id::text||'-'||extract(epoch from p.confirmed_at)::text,
        'pickup_confirmed','Recogida confirmada',p.articulo_id,p.chat_id,p.buyer_id,p.confirmed_at);
    end if;
    if p.status in ('rejected','canceled') and p.ended_by in (p.buyer_id,p.seller_id)
      and (p.status='rejected' or exists(select 1 from public.articulos where id=p.articulo_id and status='reservado' and estado='reservado')) then
      recipient := case when p.ended_by=p.buyer_id then p.seller_id else p.buyer_id end;
      perform public.append_activity_notification(recipient,'pickup_'||p.status||'-'||p.id::text||'-'||extract(epoch from p.ended_at)::text,
        'pickup_'||p.status,case when p.status='rejected' then 'Propuesta de recogida rechazada' else 'Recogida cancelada' end,
        p.articulo_id,p.chat_id,p.buyer_id,p.ended_at);
    end if;
  end loop;
end $$;
update public.activity_notifications n set receipt_id=r.id from public.system_message_receipts r
  where n.type='system_notice' and n.recipient_id=r.user_id and n.receipt_id is null
    and n.id like 'system_notice-'||r.id::text||'-%';
notify pgrst,'reload schema';
commit;
