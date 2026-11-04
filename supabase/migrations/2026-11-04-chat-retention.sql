begin;
create table if not exists public.chat_retention_settings (
 id boolean primary key default true check(id),enabled boolean not null default false,
 installed_at timestamptz not null default now(),last_run_at timestamptz,last_deleted integer not null default 0
);
insert into public.chat_retention_settings(id) values(true) on conflict do nothing;
create table if not exists public.chat_retention (
 chat_id uuid primary key references public.chats(id) on delete cascade,
 started_at timestamptz not null default now(),
 delete_after timestamptz not null default now()+interval '720 hours',
 check(delete_after=started_at+interval '720 hours')
);
create index if not exists chat_retention_due on public.chat_retention(delete_after,chat_id);
create index if not exists chat_retention_open_reports on public.chat_reports(chat_id) where status in ('open','reviewing');
create index if not exists chat_retention_reservations on public.sale_reservations(chat_id,id);
alter table public.chat_retention_settings enable row level security;
alter table public.chat_retention enable row level security;
revoke all on public.chat_retention,public.chat_retention_settings from public,anon,authenticated;
grant all on public.chat_retention,public.chat_retention_settings to service_role;

create or replace function public.chat_retention_held(p_chat uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.chat_reports where chat_id=p_chat and status in ('open','reviewing'))
 or exists(select 1 from public.sale_reservations r join public.sale_disputes d on d.reservation_id=r.id
  where r.chat_id=p_chat and d.status='open');
$$;

-- Preserve the actual closure time independently of later chat activity.
alter table public.chats add column if not exists retention_closed_at timestamptz;
update public.chats c set retention_closed_at=coalesce(c.canceled_at,
 (select max(r.ended_at) from public.sale_reservations r where r.chat_id=c.id),
 (select a.delivered_at from public.articulos a where a.id=c.articulo_id and (a.status in ('entregado','delivered') or a.estado in ('entregado','delivered'))),c.updated_at)
 where c.status='closed' and c.retention_closed_at is null;
create or replace function public.record_chat_retention_closure()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.retention_closed_at:=case when new.status='closed' then now() end;
 elsif new.status='closed' and old.status is distinct from 'closed' then
  new.retention_closed_at:=now();
 elsif new.status is distinct from 'closed' then
  new.retention_closed_at:=null;
 else new.retention_closed_at:=old.retention_closed_at;
 end if;
 return new;
end $$;
drop trigger if exists record_chat_retention_closure on public.chats;
create trigger record_chat_retention_closure before insert or update on public.chats
 for each row execute function public.record_chat_retention_closure();
revoke all on function public.record_chat_retention_closure() from public,anon,authenticated;

create or replace function public.sync_chat_retention(p_article uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.chat_retention(chat_id,started_at,delete_after)
 select c.id,event.at,event.at+interval '720 hours' from public.chats c join public.articulos a on a.id=c.articulo_id
 cross join lateral(select coalesce(c.retention_closed_at,a.delivered_at,a.updated_at,now()) as at) event
 where a.id=p_article and (c.status='closed' or a.status in ('entregado','delivered') or a.estado in ('entregado','delivered'))
 on conflict(chat_id) do nothing;
 delete from public.chat_retention r using public.chats c,public.articulos a
 where r.chat_id=c.id and c.articulo_id=a.id and a.id=p_article
 and c.status is distinct from 'closed' and coalesce(a.status,'') not in ('entregado','delivered')
 and coalesce(a.estado,'') not in ('entregado','delivered');
end $$;

create or replace function public.capture_chat_retention()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='chats' then
  perform public.sync_chat_retention(new.articulo_id);
 else
  perform public.sync_chat_retention(new.id);
 end if;
 return new;
end $$;
drop trigger if exists zz_capture_chat_retention on public.chats;
create trigger zz_capture_chat_retention after insert or update of status on public.chats
 for each row execute function public.capture_chat_retention();
drop trigger if exists zz_capture_article_chat_retention on public.articulos;
create trigger zz_capture_article_chat_retention after update of status,estado on public.articulos
 for each row execute function public.capture_chat_retention();

-- Historical clocks also start at the recorded closure/delivery, never installation.
insert into public.chat_retention(chat_id,started_at,delete_after)
 select c.id,event.at,event.at+interval '720 hours' from public.chats c join public.articulos a on a.id=c.articulo_id
 cross join lateral(select coalesce(c.retention_closed_at,a.delivered_at,a.updated_at,now()) as at) event
 where c.status='closed' or a.status in ('entregado','delivered') or a.estado in ('entregado','delivered')
 on conflict(chat_id) do nothing;

create or replace function public.chat_retention_status(p_chat uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.chats c where c.id=p_chat
  and auth.uid() in (c.buyer_id,c.seller_id)) then raise exception 'Chat ajeno o inexistente.' using errcode='42501';end if;
 return jsonb_build_object('delete_after',(select delete_after from public.chat_retention where chat_id=p_chat),
  'held',public.chat_retention_held(p_chat),'cleanup_enabled',(select enabled from public.chat_retention_settings where id));
end $$;

create or replace function public.purge_expired_chats(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target record;stamp timestamptz:=clock_timestamp();removed integer:=0;affected integer;
begin
 if p_limit is null or p_limit not between 1 and 200 then raise exception 'Lote inválido.';end if;
 if not coalesce((select enabled from public.chat_retention_settings where id),false) then
  return jsonb_build_object('enabled',false,'deleted',0);end if;
 if not pg_try_advisory_xact_lock(hashtextextended('mibatute-chat-retention',0)) then
  return jsonb_build_object('enabled',true,'deleted',0,'busy',true);end if;
 for target in select c.id,c.articulo_id from public.chat_retention r join public.chats c on c.id=r.chat_id
  where r.delete_after<=stamp and not public.chat_retention_held(c.id)
  order by r.delete_after,c.id limit p_limit
 loop
  -- Match the operation's parent-before-chat lock order; skip concurrent changes.
  perform 1 from public.articulos where id=target.articulo_id for update skip locked;
  if not found then continue;end if;
  perform 1 from public.chats where id=target.id for update skip locked;
  if not found then continue;end if;
  if not exists(select 1 from public.chat_retention r join public.chats c on c.id=r.chat_id
   join public.articulos a on a.id=c.articulo_id where c.id=target.id and r.delete_after<=stamp
   and (c.status='closed' or a.status in ('entregado','delivered') or a.estado in ('entregado','delivered')))
   or public.chat_retention_held(target.id) then continue;end if;
  delete from public.activity_notifications where chat_id=target.id;
  -- FK cascades erase messages, reads, pickup agreements and resolved chat reports.
  -- Article/transaction/credit records and ratings are not deleted.
  delete from public.chats where id=target.id;
  get diagnostics affected=row_count;
  removed:=removed+affected;
 end loop;
 update public.chat_retention_settings set last_run_at=stamp,last_deleted=removed where id;
 if removed>0 then
  insert into public.staff_audit(actor_id,action,reason,changes)
  values(null,'chat.retention_purge','Eliminación de chats tras 30 días de cierre',jsonb_build_object('deleted',removed,'at',stamp));
 end if;
 return jsonb_build_object('enabled',true,'deleted',removed);
end $$;

revoke all on function public.chat_retention_held(uuid),public.sync_chat_retention(uuid),public.capture_chat_retention(),public.chat_retention_status(uuid),public.purge_expired_chats(integer) from public,anon,authenticated;
grant execute on function public.chat_retention_status(uuid) to authenticated;
grant execute on function public.purge_expired_chats(integer) to service_role;

-- Extend the private history API and its existing filters without new client queries.
do $$declare definition text;begin
 select pg_get_functiondef('public.profile_chat_history(integer,boolean,text)'::regprocedure) into definition;
 if position('deletion_after' in definition)=0 then
  if position('c.created_at,' in definition)=0 or position('from public.chats c join public.articulos a' in definition)=0 then
   raise exception 'La consulta de conversaciones cambió. Revisar antes de migrar.';end if;
  definition:=replace(definition,'c.created_at,',
   'c.created_at, r.delete_after as deletion_after, public.chat_retention_held(c.id) as deletion_held, (select enabled from public.chat_retention_settings where id) as cleanup_enabled,');
  definition:=replace(definition,'from public.chats c join public.articulos a',
   'from public.chats c left join public.chat_retention r on r.chat_id=c.id join public.articulos a');
  execute definition;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
