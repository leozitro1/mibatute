begin;
-- Private reservation history: no contact data or payment documents.
create table public.sale_reservations (
 id uuid primary key default gen_random_uuid(), chat_id uuid not null, articulo_id uuid not null,
 buyer_id uuid not null, seller_id uuid not null, created_at timestamptz not null default now(),
 ended_at timestamptz, canceled_by uuid, cancel_reason text, payment_declared_at timestamptz
);
create unique index sale_reservation_active on public.sale_reservations(chat_id) where ended_at is null;
create index sale_reservation_history on public.sale_reservations(articulo_id,created_at desc);
create table public.sale_buyer_blocks (
 articulo_id uuid not null, buyer_id uuid not null, reservation_id uuid not null,
 created_at timestamptz not null default now(), primary key(articulo_id,buyer_id)
);
create table public.sale_disputes (
 id uuid primary key default gen_random_uuid(), reservation_id uuid not null references public.sale_reservations(id),
 report_id uuid not null unique, kind text not null check(kind in ('payment','cancellation')),
 status text not null default 'open' check(status in ('open','resolved')), created_at timestamptz not null default clock_timestamp(),
 resolved_at timestamptz, resolved_by uuid, resolution text
);
create unique index sale_dispute_one_open on public.sale_disputes(reservation_id) where status='open';
create index sale_dispute_history on public.sale_disputes(reservation_id,created_at desc);
create table public.sale_dispute_holds (
 articulo_id uuid primary key, previous_state jsonb not null
);
-- A private, transaction-bound, single-use authorization; clients cannot forge it with session settings.
create table public.sale_change_permits (
 articulo_id uuid primary key, transaction_id bigint not null, actor_id uuid not null,
 target_status text not null, target_buyer uuid
);
do $$ declare t text; begin
 foreach t in array array['sale_reservations','sale_buyer_blocks','sale_disputes','sale_dispute_holds','sale_change_permits'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;
insert into public.sale_reservations(chat_id,articulo_id,buyer_id,seller_id,created_at,ended_at,canceled_by)
 select c.id,c.articulo_id,c.buyer_id,c.seller_id,coalesce(c.updated_at,now()),
 case when c.status='closed' then coalesce(c.canceled_at,c.updated_at,now()) end,c.canceled_by
 from public.chats c join public.articulos a on a.id=c.articulo_id
 where a.mode='venta' and c.buyer_id is not null and c.seller_id is not null;

create function public.record_sale_reservation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.articulos where id=new.articulo_id and mode='venta') then
  if new.status in ('pending','open') and (tg_op='INSERT' or old.status='closed') then
   insert into public.sale_reservations(chat_id,articulo_id,buyer_id,seller_id)
   values(new.id,new.articulo_id,new.buyer_id,new.seller_id) on conflict do nothing;
  elsif new.status='closed' then
   update public.sale_reservations set ended_at=coalesce(ended_at,now()) where chat_id=new.id and ended_at is null;
  end if;
 end if;
 return new;
end $$;
create trigger record_sale_reservation after insert or update of status on public.chats for each row execute function public.record_sale_reservation();

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
  raise exception 'Cancela desde la gestión de la venta e indica el motivo.' using errcode='42501';
 end if;
 if new.buyer_id is not null and new.buyer_id is distinct from old.buyer_id
  and exists(select 1 from public.sale_buyer_blocks where articulo_id=old.id and buyer_id=new.buyer_id) then
  raise exception 'El vendedor canceló tu reserva anterior. Puedes solicitar revisión desde el chat histórico.' using errcode='42501';
 end if;
 if old.status<>'entregado' and new.status='entregado' then new.delivered_at:=now(); end if;
 return new;
end $$;

create function public.sale_safety_status(p_article uuid,p_chat uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.sale_reservations%rowtype; a public.articulos%rowtype; d public.sale_disputes%rowtype; uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 select * into a from public.articulos where id=p_article and mode='venta';
 if not found then raise exception 'La venta ya no está disponible.'; end if;
 select * into r from public.sale_reservations where articulo_id=p_article
  and (p_chat is null or chat_id=p_chat) and uid in (buyer_id,seller_id)
  order by (ended_at is null) desc,created_at desc,id desc limit 1;
 if not found then raise exception 'No tienes una reserva en esta venta.' using errcode='42501'; end if;
 select * into d from public.sale_disputes where reservation_id=r.id order by created_at desc,id desc limit 1;
 return jsonb_build_object('isBuyer',uid=r.buyer_id,'reservation',r.id,'chat',r.chat_id,'buyer',r.buyer_id,'seller',r.seller_id,
  'active',r.ended_at is null and a.buyer_id=r.buyer_id and a.status='reservado',
  'paymentDeclaredAt',r.payment_declared_at,'canceledAt',r.ended_at,'canceledBy',r.canceled_by,
  'cancelReason',r.cancel_reason,'caseStatus',d.status,'caseKind',d.kind,'resolution',d.resolution,
  'blocked',exists(select 1 from public.sale_buyer_blocks where articulo_id=a.id and buyer_id=r.buyer_id),
  'paused',exists(select 1 from public.sale_dispute_holds where articulo_id=a.id));
end $$;

create function public.sale_safety_action(p_chat uuid,p_reservation uuid,p_action text,p_reason text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_report_sender(); r public.sale_reservations%rowtype; a public.articulos%rowtype;
 c public.chats%rowtype; d public.sale_disputes%rowtype; detail_reason text:=trim(coalesce(p_reason,''));
 report_id uuid; evidence jsonb; result jsonb; target_buyer uuid; v_kind text;
begin
 if p_action not in ('cancel','declare_payment','payment_problem','review_cancellation') then raise exception 'Acción inválida.'; end if;
 select * into r from public.sale_reservations where id=p_reservation and chat_id=p_chat;
 if not found or uid not in (r.buyer_id,r.seller_id) then raise exception 'Reserva ajena o inexistente.' using errcode='42501'; end if;
 select buyer_id into target_buyer from public.articulos where id=r.articulo_id;
 if target_buyer is not null then perform pg_advisory_xact_lock(hashtextextended(target_buyer::text,1313)); end if;
 select * into a from public.articulos where id=r.articulo_id for update;
 if not found or a.mode<>'venta' then raise exception 'La venta ya no está disponible. Contacta a MiBatute.'; end if;
 if a.buyer_id is distinct from target_buyer then raise exception 'La reserva cambió. Actualiza antes de continuar.'; end if;
 select * into r from public.sale_reservations where id=p_reservation for update;
 select * into c from public.chats where id=p_chat;
 select * into d from public.sale_disputes where reservation_id=r.id order by created_at desc,id desc limit 1;
 if d.status='open' then
  if p_action<>'payment_problem' or d.kind='payment' then
   return jsonb_build_object('state',public.sale_safety_status(a.id,p_chat),'article',to_jsonb(a),'notice','El caso ya está en revisión.');
  end if;
 elsif d.status='resolved' and (p_action='review_cancellation' or (p_action='payment_problem' and d.kind='payment')) then
  raise exception 'Este caso ya fue resuelto. Para aportar información nueva, contacta a MiBatute desde el buzón.';
 end if;
 if p_action='declare_payment' then
  if uid<>r.buyer_id or r.ended_at is not null or a.status<>'reservado' or a.buyer_id<>r.buyer_id or c.status<>'open' then
   raise exception 'Solo el comprador de una reserva aprobada puede declarar el pago.' using errcode='42501';
  end if;
  update public.sale_reservations set payment_declared_at=coalesce(payment_declared_at,now()) where id=r.id;
  return jsonb_build_object('state',public.sale_safety_status(a.id,p_chat),'notice','Declaración registrada. MiBatute no verifica ni confirma este pago.');
 end if;
 if length(detail_reason) not between 8 and 500 then raise exception 'Explica el motivo entre 8 y 500 caracteres.'; end if;
 if p_action='cancel' then
  if r.ended_at is not null then raise exception 'Esta reserva ya terminó. Actualiza la página.'; end if;
  if a.status<>'reservado' or a.estado<>'reservado' or a.buyer_id is distinct from r.buyer_id then raise exception 'La reserva cambió. Actualiza la página.'; end if;
  if r.payment_declared_at is null then
   update public.sale_reservations set ended_at=now(),canceled_by=uid,cancel_reason=detail_reason where id=r.id;
   if uid=r.seller_id then
    insert into public.sale_buyer_blocks(articulo_id,buyer_id,reservation_id) values(a.id,r.buyer_id,r.id)
     on conflict(articulo_id,buyer_id) do update set reservation_id=excluded.reservation_id,created_at=now();
   end if;
   insert into public.sale_change_permits values(a.id,txid_current(),uid,'disponible',null);
   result:=public.transition_sale_with_credit(a.id,'cancel',false);
   return result||jsonb_build_object('state',public.sale_safety_status(a.id,p_chat),'notice',
    case when uid=r.seller_id then 'Reserva cancelada. El artículo está disponible y este comprador no puede volver a reservarlo; puede pedir revisión.'
    else 'Reserva cancelada. Si utilizaste un crédito para reservar, no se devuelve al retirarte.' end);
  end if;
  if d.status='resolved' then d.id:=null; end if;
  v_kind:='payment';
 elsif p_action='payment_problem' then
  if uid<>r.buyer_id then raise exception 'Solo el comprador puede declarar este problema de pago.' using errcode='42501'; end if;
  update public.sale_reservations set payment_declared_at=coalesce(payment_declared_at,now()) where id=r.id;
  if d.status='resolved' then d.id:=null; end if;
  v_kind:='payment';
 else
  if uid<>r.buyer_id or r.canceled_by is distinct from r.seller_id then raise exception 'No hay una cancelación del vendedor para revisar.'; end if;
  v_kind:='cancellation';
 end if;
 if d.id is null then
  perform public.check_report_rate(uid);
  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]') into evidence from (
   select m.id,m.created_at,m.sender_id,(select nombre from public.usuarios where id=m.sender_id) sender_name,
    coalesce(to_jsonb(m)->>'body',to_jsonb(m)->>'message',to_jsonb(m)->>'content','') body
   from public.chat_messages m where chat_id=p_chat order by created_at desc,id desc limit 20) m;
  insert into public.chat_reports(chat_id,articulo_id,reporter_id,reported_user_id,reason,details,messages_snapshot,status)
   values(p_chat,a.id,uid,case when uid=r.buyer_id then r.seller_id else r.buyer_id end,'otro',
    'Revisión de venta ('||v_kind||'). Declaraciones sin verificar: '||detail_reason,evidence,'open') returning id into report_id;
  insert into public.sale_disputes(reservation_id,report_id,kind) values(r.id,report_id,v_kind) returning * into d;
 else
  update public.sale_disputes set kind=v_kind where id=d.id;
  update public.chat_reports set details=left(details||E'\nNueva declaración de pago: '||detail_reason,1000) where id=d.report_id;
 end if;
 if v_kind='payment' and a.status<>'entregado' then
  insert into public.sale_dispute_holds values(a.id,jsonb_build_object('status',a.status,'estado',a.estado,
   'buyer_id',a.buyer_id,'reserved_at',a.reserved_at,'delivered_at',a.delivered_at)) on conflict do nothing;
  if a.status<>'en_revision' or a.estado<>'en_revision' then
   insert into public.sale_change_permits values(a.id,txid_current(),uid,'en_revision',a.buyer_id);
   update public.articulos set status='en_revision',estado='en_revision' where id=a.id returning * into a;
  end if;
 end if;
 return jsonb_build_object('state',public.sale_safety_status(a.id,p_chat),'article',to_jsonb(a),'notice',
  case when v_kind='payment' then 'Caso enviado a administración. No confirma el pago ni ordena una devolución. La publicación queda en revisión, salvo si ya estaba entregada.'
  else 'Solicitud de revisión enviada. El bloqueo se mantiene hasta que administración lo revise.' end);
end $$;

alter function public.staff_report_detail(uuid,text) rename to staff_report_detail_before_sale_safety;
revoke all on function public.staff_report_detail_before_sale_safety(uuid,text) from public,anon,authenticated;
create function public.staff_report_detail(p_id uuid,p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; context jsonb;
begin
 result:=public.staff_report_detail_before_sale_safety(p_id,p_kind);
 if p_kind='chat' then
  select jsonb_build_object('id',d.id,'kind',d.kind,'status',d.status,'reservation',r.id,
   'paymentDeclaredAt',r.payment_declared_at,'cancelReason',r.cancel_reason,'canceledBy',r.canceled_by,
   'buyer',r.buyer_id,'seller',r.seller_id,'resolution',d.resolution,
   'canCancel',h.previous_state->>'status'='reservado' and (h.previous_state->>'buyer_id')::uuid=r.buyer_id,
   'held',h.articulo_id is not null) into context
  from public.sale_disputes d join public.sale_reservations r on r.id=d.reservation_id
  left join public.sale_dispute_holds h on h.articulo_id=r.articulo_id where d.report_id=p_id;
 end if;
 return result||jsonb_build_object('sale_dispute',context);
end $$;

create function public.staff_resolve_sale_dispute(p_case uuid,p_action text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.sale_disputes%rowtype; r public.sale_reservations%rowtype; a public.articulos%rowtype;
 h jsonb; uid uuid:=auth.uid(); target_buyer uuid; detail_reason text:=trim(coalesce(p_reason,'')); target_status text; target uuid;
begin
 perform public.staff_require('reports');
 if p_action not in ('resume','restore_buyer','cancel_reservation') or length(detail_reason) not between 8 and 500 then
  raise exception 'Selecciona una decisión y explica el motivo (8–500 caracteres).'; end if;
 select * into d from public.sale_disputes where id=p_case;
 select * into r from public.sale_reservations where id=d.reservation_id;
 if r.id is null or uid in (r.buyer_id,r.seller_id) then raise exception 'Otro administrador debe revisar este caso.' using errcode='42501'; end if;
 select buyer_id into target_buyer from public.articulos where id=r.articulo_id;
 if target_buyer is not null then perform pg_advisory_xact_lock(hashtextextended(target_buyer::text,1313)); end if;
 select * into a from public.articulos where id=r.articulo_id for update;
 if not found or a.buyer_id is distinct from target_buyer then raise exception 'La publicación cambió. Actualiza el reporte.'; end if;
 select * into d from public.sale_disputes where id=p_case for update;
 if d.status='resolved' then return jsonb_build_object('notice','El caso ya estaba resuelto.'); end if;
 select previous_state into h from public.sale_dispute_holds where articulo_id=a.id;
 if p_action='restore_buyer' then
  if d.kind<>'cancellation' then raise exception 'En casos de pago, revisa primero la continuidad de la reserva.'; end if;
  delete from public.sale_buyer_blocks where articulo_id=a.id and buyer_id=r.buyer_id;
 elsif p_action='cancel_reservation' then
  if h is null or h->>'status'<>'reservado' or (h->>'buyer_id')::uuid is distinct from r.buyer_id then
   raise exception 'Esta reserva ya no es la actual. No puedes cancelar la de otro comprador.'; end if;
  if exists(select 1 from public.sale_disputes x join public.sale_reservations y on y.id=x.reservation_id
    where y.articulo_id=a.id and x.status='open' and x.kind='payment' and x.id<>d.id) then
   raise exception 'Resuelve los otros casos de pago antes de cancelar esta reserva.'; end if;
 end if;
 update public.sale_disputes set status='resolved',resolved_at=now(),resolved_by=uid,resolution=detail_reason where id=d.id;
 if h is not null and not exists(select 1 from public.sale_disputes x join public.sale_reservations y on y.id=x.reservation_id
   where y.articulo_id=a.id and x.status='open' and x.kind='payment') then
  target_status:=case when p_action='cancel_reservation' then 'disponible' else h->>'status' end;
  target:=case when p_action='cancel_reservation' then null else (h->>'buyer_id')::uuid end;
  insert into public.sale_change_permits values(a.id,txid_current(),uid,target_status,target);
  update public.articulos set status=target_status,estado=case when p_action='cancel_reservation' then 'disponible' else h->>'estado' end,
   buyer_id=target,comprador_id=target,
   reserved_at=case when p_action='cancel_reservation' then null else (h->>'reserved_at')::timestamptz end,
   delivered_at=(h->>'delivered_at')::timestamptz where id=a.id;
  delete from public.sale_dispute_holds where articulo_id=a.id;
  if p_action='cancel_reservation' then
   update public.sale_reservations set ended_at=now(),canceled_by=uid,cancel_reason=detail_reason where id=r.id;
   update public.chats set status='closed' where id=r.chat_id;
   -- Only the optional in-platform reservation credit; never refunds a bank payment.
   perform public.finish_sale_credit(a.id,r.buyer_id,'seller_canceled');
  end if;
 end if;
 update public.chat_reports set status='resolved',resolution=detail_reason,handled_at=now(),handled_by_user_id=uid where id=d.report_id;
 insert into public.staff_audit(actor_id,action,target_id,reason,changes)
 values(uid,'sale_dispute.resolve',d.id,detail_reason,jsonb_build_object('decision',p_action,'reservation',r.id));
 return jsonb_build_object('notice','Caso resuelto y registrado. No se confirma ni devuelve ningún pago externo.');
end $$;

create function public.guard_sale_dispute_report() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.sale_disputes where report_id=old.id and status='open') then
  if tg_op='DELETE' or new.status not in ('open','reviewing') then
   raise exception 'Abre Ver y resuelve este caso con las acciones de revisión de venta.' using errcode='42501';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger guard_sale_dispute_report before update or delete on public.chat_reports for each row execute function public.guard_sale_dispute_report();

create function public.guard_sale_chat_close() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='closed' and old.status<>'closed' and auth.uid() is not null and exists(
  select 1 from public.articulos where id=new.articulo_id and mode='venta' and buyer_id=new.buyer_id and status in ('reservado','en_revision')) then
  raise exception 'Finaliza o cancela la reserva desde la gestión de venta.' using errcode='42501';
 end if;
 return new;
end $$;
create trigger guard_sale_chat_close before update of status on public.chats for each row execute function public.guard_sale_chat_close();

create or replace function public.assert_sale_deletable(p_article_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.articulos%rowtype;
begin
 if auth.uid() is null then return; end if;
 select * into a from public.articulos where id=p_article_id for update;
 if a.mode='venta' and (
  exists(select 1 from public.sale_disputes d join public.sale_reservations r on r.id=d.reservation_id where r.articulo_id=a.id and d.status='open')
  or exists(select 1 from public.sale_reservations where articulo_id=a.id and canceled_by is not null and ended_at>now()-interval '7 days')
  or (a.status='reservado' and a.buyer_id is not null)
  or (a.status='entregado' and (coalesce(a.delivered_at,a.updated_at) is null or now()<coalesce(a.delivered_at,a.updated_at)+interval '7 days'))) then
  raise exception 'Se conserva la venta y su chat mientras haya un caso abierto y durante siete días después de la cancelación o entrega.' using errcode='42501';
 end if;
end $$;

revoke all on function public.record_sale_reservation(),public.guard_sale_dispute_report(),public.guard_sale_chat_close() from public,anon,authenticated;
revoke all on function public.sale_safety_status(uuid,uuid),public.sale_safety_action(uuid,uuid,text,text),public.staff_report_detail(uuid,text),public.staff_resolve_sale_dispute(uuid,text,text) from public,anon;
grant execute on function public.sale_safety_status(uuid,uuid),public.sale_safety_action(uuid,uuid,text,text),public.staff_report_detail(uuid,text),public.staff_resolve_sale_dispute(uuid,text,text) to authenticated;
create or replace function public.settle_sale_credit()
returns trigger language plpgsql security definer set search_path='' as $$
declare final_state text;
begin
  if tg_op='UPDATE' and new.status='en_revision' and exists(select 1 from public.sale_dispute_holds where articulo_id=old.id) then return new; end if;
  if old.mode='venta' and old.buyer_id is not null and old.status='reservado' then
    if tg_op='DELETE' then final_state:='removed';
    elsif new.status='entregado' then final_state:='completed';
    elsif new.status<>'reservado' or new.buyer_id is distinct from old.buyer_id or new.mode<>'venta' then
      final_state:=case when auth.uid()=old.owner_id and new.status='disponible' then 'seller_canceled'
        when auth.uid()=old.buyer_id then 'buyer_canceled' else 'removed' end;
    end if;
    if final_state is not null then perform public.finish_sale_credit(old.id,old.buyer_id,final_state); end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.sale_purchase_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); active_count integer; free_count integer; paid_count integer; balance integer;
begin
  if uid is null then raise exception 'Debes iniciar sesion.' using errcode='42501'; end if;
  select count(*),count(*) filter(where coalesce(c.cost,0)=0),count(*) filter(where c.cost=1)
    into active_count,free_count,paid_count from public.articulos a
    left join public.sale_purchase_credits c on c.articulo_id=a.id and c.usuario_id=uid and c.state='held'
    where a.mode='venta' and (a.status='reservado' or exists(select 1 from public.sale_dispute_holds where articulo_id=a.id)) and a.buyer_id=uid;
  select saldo into balance from public.cupos where usuario_id=uid;
  return jsonb_build_object('active',active_count,'freeActive',free_count,'paidActive',paid_count,
    'heldCredits',paid_count,'freeLimit',5,'extraLimit',3,'maxActive',8,'balance',coalesce(balance,0));
end;
$$;


-- Invalidate only the other participant's open panel through the existing user socket.
create function public.signal_sale_safety() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.sale_reservations%rowtype; member uuid;
begin
 if tg_table_name='sale_reservations' then r:=new;
 else select * into r from public.sale_reservations where id=new.reservation_id; end if;
 for member in select x from unnest(array[r.buyer_id,r.seller_id]) x where x is distinct from auth.uid() loop
  perform public.send_market_signal(member,jsonb_build_object('key','sale-safety:'||r.id::text||':'||txid_current()::text,
   'kind','sale_safety','chatId',r.chat_id,'articleId',r.articulo_id));
 end loop;
 return new;
end $$;
create trigger signal_sale_reservation after insert or update on public.sale_reservations for each row execute function public.signal_sale_safety();
create trigger signal_sale_dispute after insert or update on public.sale_disputes for each row execute function public.signal_sale_safety();
revoke all on function public.signal_sale_safety() from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
