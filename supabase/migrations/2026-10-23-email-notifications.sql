begin;
create table if not exists public.email_controls (
 id boolean primary key default true check(id), enabled boolean not null default false,
 daily_limit integer not null default 50 check(daily_limit between 1 and 80),
 events jsonb not null default '{"published":false,"request":false,"sale":false,"suspension":false,"review":false,"deleted":false,"credits_purchase":false,"credits_gift":false}',
 updated_at timestamptz not null default now()
);
insert into public.email_controls(id) values(true) on conflict do nothing;
create table if not exists public.email_outbox (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('published','request','sale','suspension','review','deleted','credits_purchase','credits_gift')),
 event_key text not null unique, title text not null, detail text not null,
 state text not null default 'pending' check(state in ('pending','processing','sent','failed','uncertain','skipped')),
 created_at timestamptz not null default now(), attempted_at timestamptz, finished_at timestamptz,
 provider_id text, error_code text
);
-- Extend an already-installed local draft without enabling new categories.
alter table public.email_controls alter column events set default '{"published":false,"request":false,"sale":false,"suspension":false,"review":false,"deleted":false,"credits_purchase":false,"credits_gift":false}';
update public.email_controls set events='{"credits_purchase":false,"credits_gift":false}'::jsonb||events,updated_at=clock_timestamp()
 where not(events?'credits_purchase') or not(events?'credits_gift');
alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check(kind in ('published','request','sale','suspension','review','deleted','credits_purchase','credits_gift'));
create index if not exists email_pending on public.email_outbox(created_at) where state='pending';
create index if not exists email_attempts on public.email_outbox(attempted_at) where attempted_at is not null;
alter table public.email_controls enable row level security;
alter table public.email_outbox enable row level security;
revoke all on public.email_controls,public.email_outbox from public,anon,authenticated;

create or replace function public.staff_email_settings() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.staff_require('team');
 return jsonb_build_object('settings',(select to_jsonb(c) from public.email_controls c where id),
  'attempts24h',(select count(*) from public.email_outbox where attempted_at>now()-interval '24 hours'),
  'pending',(select count(*) from public.email_outbox where state='pending'),
  'sent24h',(select count(*) from public.email_outbox where state='sent' and attempted_at>now()-interval '24 hours'),
  'failed24h',(select count(*) from public.email_outbox where state in ('failed','uncertain','processing') and attempted_at>now()-interval '24 hours'));
end $$;
create or replace function public.staff_email_save(p_enabled boolean,p_limit integer,p_events jsonb,p_version timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.email_controls%rowtype; item text;
begin
 perform public.staff_require('team');
 if p_enabled is null or p_limit is null or p_limit not between 1 and 80 or jsonb_typeof(p_events) is distinct from 'object'
  or (select count(*) from jsonb_object_keys(p_events))<>8 then raise exception 'Configuración no válida.';end if;
 foreach item in array array['published','request','sale','suspension','review','deleted','credits_purchase','credits_gift'] loop
  if jsonb_typeof(p_events->item) is distinct from 'boolean' then raise exception 'Configuración no válida.';end if;
 end loop;
 select * into previous from public.email_controls where id for update;
 if previous.updated_at is distinct from p_version then raise exception 'La configuración cambió. Actualiza antes de guardar.';end if;
 update public.email_controls set enabled=p_enabled,daily_limit=p_limit,events=p_events,updated_at=clock_timestamp() where id;
 update public.email_outbox set state='skipped',finished_at=now() where state='pending' and (not p_enabled or not (p_events->>kind)::boolean);
 insert into public.staff_audit(actor_id,action,reason,changes) values(auth.uid(),'settings.email','Configuración de correos transaccionales',
  jsonb_build_object('before',to_jsonb(previous),'enabled',p_enabled,'daily_limit',p_limit,'events',p_events));
 return public.staff_email_settings();
end $$;

create or replace function public.queue_market_email(p_user uuid,p_kind text,p_key text,p_title text,p_detail text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.email_controls where id and enabled and events->>p_kind='true') then return;end if;
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null and nullif(email,'') is not null) then return;end if;
 insert into public.email_outbox(user_id,kind,event_key,title,detail)
 values(p_user,p_kind,p_key,left(p_title,160),left(p_detail,500)) on conflict(event_key) do nothing;
end $$;
create or replace function public.capture_market_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.articulos%rowtype; msg public.system_messages%rowtype; kind text; until_date timestamptz;
 key text:=tg_table_name||':'||(to_jsonb(new)->>'id')||':'||txid_current()::text;
begin
 if not exists(select 1 from public.email_controls where id and enabled) then return new;end if;
 if tg_table_name='articulos' then
  if tg_op='INSERT' then
   perform public.queue_market_email(new.owner_id,'published',key||':published','Publicación creada',concat('Tu publicación «',new.title,'» se creó en MiBatute. Consulta su estado en tu cuenta.'));
  elsif new.mode='venta' and new.status='entregado' and old.status is distinct from 'entregado' then
   perform public.queue_market_email(new.owner_id,'sale',key||':sale:seller','Venta finalizada',concat('La venta de «',new.title,'» se marcó como entregada. Este aviso no acredita un pago ni una entrega verificada por MiBatute.'));
   perform public.queue_market_email(new.buyer_id,'sale',key||':sale:buyer','Compra finalizada',concat('La compra de «',new.title,'» se marcó como entregada. Consulta el detalle en tu cuenta.'));
  end if;
 elsif tg_table_name='postulaciones' then
  select * into a from public.articulos where id=new.articulo_id;
  perform public.queue_market_email(a.owner_id,'request',key,'Nueva solicitud de donación',concat('Hay una nueva postulación para «',a.title,'». Revísala en MiBatute.'));
 elsif tg_table_name='chats' then
  if new.status='pending' and (tg_op='INSERT' or old.status is distinct from 'pending') then
   select * into a from public.articulos where id=new.articulo_id and mode='venta';
   if found then perform public.queue_market_email(a.owner_id,'request',key,'Nueva solicitud de compra',concat('Hay una nueva solicitud para «',a.title,'». Revísala en MiBatute.'));end if;
  end if;
 elsif tg_table_name='system_message_receipts' then
  select * into msg from public.system_messages where id=new.message_id;
  kind:=case msg.title when 'Publicacion en revision' then 'review' when 'Publicacion eliminada' then 'deleted'
   when 'Suspension temporal de tu cuenta' then 'suspension' else null end;
  if kind is not null then
   select ban_until into until_date from public.usuarios where id=new.user_id;
   perform public.queue_market_email(new.user_id,kind,key,msg.title,
    case when kind='suspension' then concat('Tu cuenta tiene una suspensión temporal',case when until_date is not null then ' hasta '||to_char(until_date at time zone 'America/Bogota','DD/MM/YYYY HH24:MI')||' (hora de Colombia)' else '' end,'. Consulta el motivo y las opciones de revisión en tu buzón de MiBatute.')
    else 'El equipo actualizó el estado de tu publicación. Consulta el motivo y el detalle en tu buzón de MiBatute.' end);
  end if;
 end if;
 return new;
end $$;
drop trigger if exists email_article_event on public.articulos;
create trigger email_article_event after insert or update on public.articulos for each row execute function public.capture_market_email();
drop trigger if exists email_application_event on public.postulaciones;
create trigger email_application_event after insert on public.postulaciones for each row execute function public.capture_market_email();
drop trigger if exists email_sale_request_event on public.chats;
create trigger email_sale_request_event after insert or update on public.chats for each row execute function public.capture_market_email();
drop trigger if exists email_moderation_event on public.system_message_receipts;
create trigger email_moderation_event after insert on public.system_message_receipts for each row execute function public.capture_market_email();

-- Confirmed top-ups and free awards only; refunds/holds are not gifts.
create or replace function public.capture_credit_email() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.email_controls where id and enabled) then return new;end if;
 if tg_table_name='wompi_topups' then
  if new.state='approved' and old.state is distinct from 'approved' and new.environment='prod'
   and exists(select 1 from public.cupos_historial where referencia_id=new.id and usuario_id=new.usuario_id and concepto='recarga_wompi' and cantidad=new.credits) then
   perform public.queue_market_email(new.usuario_id,'credits_purchase','wompi:'||new.id,'Compra de créditos confirmada',
    concat('Se abonaron ',new.credits,case when new.credits=1 then ' crédito' else ' créditos' end,' a tu cuenta. Total pagado: ',
      to_char(new.amount_in_cents::numeric/100,'FM999999990.00'),' ',new.currency,'. Referencia: ',new.reference,'. Revisa tu saldo y el movimiento en MiBatute.'));
  end if;
 elsif new.cantidad>0 and new.concepto in ('compensacion_administrativa','regalo','bonificacion') then
  perform public.queue_market_email(new.usuario_id,'credits_gift','credit-award:'||new.id,'Recibiste créditos sin costo',
   concat('MiBatute te otorgó ',new.cantidad,case when new.cantidad=1 then ' crédito' else ' créditos' end,' de regalo o compensación, sin costo para ti. Consulta el movimiento y el motivo en tu cuenta.'));
 end if;
 return new;
end $$;
-- Wompi may not be installed locally yet; reapply after installing its payment migration.
do $$ begin
 if to_regclass('public.wompi_topups') is not null then
  execute 'drop trigger if exists email_topup_event on public.wompi_topups';
  execute 'create trigger email_topup_event after update on public.wompi_topups for each row execute function public.capture_credit_email()';
 end if;
end $$;
drop trigger if exists email_credit_award_event on public.cupos_historial;
create trigger email_credit_award_event after insert on public.cupos_historial for each row execute function public.capture_credit_email();
revoke all on function public.capture_credit_email() from public,anon,authenticated;

-- Service-role-only worker. Claims count toward the budget even when delivery is uncertain.
create or replace function public.email_claim() returns jsonb
language plpgsql security definer set search_path='' as $$
declare controls public.email_controls%rowtype; item public.email_outbox%rowtype; address text;
begin
 select * into controls from public.email_controls where id for update;
 if not controls.enabled then return null;end if;
 if exists(select 1 from public.email_outbox where state='processing' and attempted_at>now()-interval '2 minutes') then return null;end if;
 update public.email_outbox set state='uncertain',error_code='worker_interrupted',finished_at=now() where state='processing' and attempted_at<=now()-interval '2 minutes';
 update public.email_outbox set state='skipped',finished_at=now() where state='pending'
  and (created_at<now()-interval '24 hours' or controls.events->>kind is distinct from 'true');
 if (select count(*) from public.email_outbox where attempted_at>now()-interval '24 hours')>=controls.daily_limit then return null;end if;
 select o.* into item from public.email_outbox o where state='pending' order by created_at,id limit 1 for update skip locked;
 if not found then return null;end if;
 select email into address from auth.users where id=item.user_id and email_confirmed_at is not null;
 if nullif(address,'') is null then
  update public.email_outbox set state='skipped',finished_at=now() where id=item.id;return null;
 end if;
 update public.email_outbox set state='processing',attempted_at=now() where id=item.id;
 return jsonb_build_object('id',item.id,'kind',item.kind,'to',address,'title',item.title,'detail',item.detail);
end $$;
create or replace function public.email_finish(p_id uuid,p_state text,p_provider_id text default null,p_error text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_state not in ('sent','failed','uncertain') or p_state is null then raise exception 'Estado no válido.';end if;
 update public.email_outbox set state=p_state,provider_id=left(p_provider_id,100),error_code=left(p_error,80),finished_at=now() where id=p_id and state='processing';
 if found and p_error in ('provider_429','provider_401','provider_403') then
  update public.email_controls set enabled=false,updated_at=clock_timestamp() where id;
  update public.email_outbox set state='skipped',finished_at=now() where state='pending';
 end if;
end $$;
revoke all on function public.staff_email_settings(),public.staff_email_save(boolean,integer,jsonb,timestamptz),
 public.queue_market_email(uuid,text,text,text,text),public.capture_market_email(),public.email_claim(),public.email_finish(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.staff_email_settings(),public.staff_email_save(boolean,integer,jsonb,timestamptz) to authenticated;
grant execute on function public.email_claim(),public.email_finish(uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
