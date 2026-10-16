begin;
create table if not exists public.staff_messages(
  id uuid primary key,sender_id uuid references auth.users(id) on delete set null,
  audience text not null check(audience in ('selected','all')),audience_cutoff timestamptz not null,
  title text not null,body text not null,recipient_count integer not null check(recipient_count>0),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists staff_messages_recent_idx on public.staff_messages(created_at desc,id);
create index if not exists staff_messages_sender_idx on public.staff_messages(sender_id,created_at desc);
create index if not exists staff_messages_broadcast_idx on public.staff_messages(created_at desc) where audience='all';
create table if not exists public.staff_message_recipients(
  message_id uuid not null references public.staff_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,primary key(message_id,user_id)
);
create index if not exists staff_message_recipient_idx on public.staff_message_recipients(user_id,message_id);
create table if not exists public.staff_message_states(
  message_id uuid not null references public.staff_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,read_at timestamptz,hidden_at timestamptz,
  primary key(message_id,user_id)
);
alter table public.staff_messages enable row level security;
alter table public.staff_message_recipients enable row level security;
alter table public.staff_message_states enable row level security;
revoke all on public.staff_messages,public.staff_message_recipients,public.staff_message_states from public,anon,authenticated;
grant all on public.staff_messages,public.staff_message_recipients,public.staff_message_states to service_role;

create or replace function public.staff_message_target_count(p_all boolean,p_ids uuid[],p_cutoff timestamptz)
returns integer language plpgsql security definer set search_path='' as $$
declare amount integer;
begin
  if p_all is null or p_cutoff is null or p_cutoff>clock_timestamp() or p_cutoff<clock_timestamp()-interval '10 minutes'
    or (p_all and coalesce(cardinality(p_ids),0)<>0)
    or (not p_all and (coalesce(cardinality(p_ids),0) not between 1 and 100 or array_position(p_ids,null) is not null)) then
    raise exception 'Destinatarios no validos o vista previa vencida. Cierra y vuelve a abrir el mensaje.';
  end if;
  select count(*) into amount from auth.users a
    where a.created_at<=p_cutoff and (p_all or (a.id=any(p_ids) and exists(select 1 from public.usuarios where id=a.id)));
  if amount=0 or (not p_all and amount<>(select count(distinct value) from unnest(p_ids)value)) then raise exception 'Uno o varios destinatarios ya no estan disponibles.'; end if;
  return amount;
end;
$$;
revoke all on function public.staff_message_target_count(boolean,uuid[],timestamptz) from public,anon,authenticated;

create or replace function public.staff_prepare_message(p_all boolean default false,p_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz:=clock_timestamp();amount integer;
begin
  perform public.staff_require('users');
  if p_all then perform public.staff_require_recent_mfa(); end if;
  amount:=public.staff_message_target_count(p_all,p_ids,cutoff);
  return jsonb_build_object('count',amount,'cutoff',cutoff);
end;
$$;

create or replace function public.staff_send_message(p_request uuid,p_all boolean,p_ids uuid[],p_cutoff timestamptz,p_expected integer,p_title text,p_body text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.staff_messages%rowtype;ids uuid[];amount integer;
  title text:=trim(coalesce(p_title,''));body text:=trim(coalesce(p_body,''));result jsonb;
begin
  perform public.staff_require('users');
  if p_all then perform public.staff_require_recent_mfa(); end if;
  if p_request is null or p_all is null or length(title) not between 3 and 120 or length(body) not between 5 and 4000 then raise exception 'Revisa el asunto (3 a 120 caracteres) y el mensaje (5 a 4000 caracteres).'; end if;
  if coalesce(cardinality(p_ids),0)>100 then raise exception 'Selecciona hasta 100 usuarios por envio.'; end if;
  select coalesce(array_agg(distinct value order by value),'{}') into ids from unnest(p_ids)value;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,2026101501));
  select * into previous from public.staff_messages where id=p_request;
  if found then
    if previous.sender_id is distinct from auth.uid() or previous.title<>title or previous.body<>body
      or previous.audience is distinct from (case when p_all then 'all' else 'selected' end)
      or previous.audience_cutoff is distinct from p_cutoff or previous.recipient_count is distinct from p_expected
      or ids is distinct from coalesce((select array_agg(user_id order by user_id) from public.staff_message_recipients where message_id=p_request),'{}') then
      raise exception 'La solicitud ya se uso con otro mensaje.';
    end if;
    return jsonb_build_object('id',p_request,'count',previous.recipient_count,'notice','Mensaje enviado al buzon.');
  end if;
  amount:=public.staff_message_target_count(p_all,p_ids,p_cutoff);
  if p_expected is distinct from amount then raise exception 'Los destinatarios cambiaron. Cierra y vuelve a revisar el mensaje.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,2026101502));
  if (select count(*) from public.staff_messages where sender_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Limite de 20 envios por hora. Intenta mas tarde.'; end if;
  if p_all then
    perform pg_advisory_xact_lock(20261015,100);
    if (select count(*) from public.staff_messages where audience='all' and created_at>now()-interval '24 hours')>=2 then raise exception 'La plataforma admite hasta 2 comunicados generales cada 24 horas.'; end if;
  end if;
  insert into public.staff_messages(id,sender_id,audience,audience_cutoff,title,body,recipient_count)
    values(p_request,auth.uid(),case when p_all then 'all' else 'selected' end,p_cutoff,title,body,amount);
  if not p_all then insert into public.staff_message_recipients(message_id,user_id) select p_request,value from unnest(ids)value; end if;
  insert into public.staff_audit(actor_id,action,target_id,reason,changes)
    values(auth.uid(),'message.send',p_request,'Mensaje enviado desde administracion',jsonb_build_object('title',title,'audience',case when p_all then 'all' else 'selected' end,'recipient_count',amount));
  return jsonb_build_object('id',p_request,'count',amount,'notice','Mensaje enviado al buzon.');
end;
$$;
revoke all on function public.staff_prepare_message(boolean,uuid[]),public.staff_send_message(uuid,boolean,uuid[],timestamptz,integer,text,text) from public,anon;
grant execute on function public.staff_prepare_message(boolean,uuid[]),public.staff_send_message(uuid,boolean,uuid[],timestamptz,integer,text,text) to authenticated;

create or replace function public.notification_inbox()
returns setof jsonb language sql stable security definer set search_path='' as $$
  with viewer as(select id,created_at from auth.users where id=auth.uid()),
  broadcasts as(select m.* from public.staff_messages m join viewer v on v.created_at<=m.audience_cutoff
    where m.audience='all' and not exists(select 1 from public.staff_message_states where message_id=m.id and user_id=auth.uid() and hidden_at is not null)
    order by m.created_at desc,m.id desc limit 50),
  targeted as(select m.* from public.staff_message_recipients r join public.staff_messages m on m.id=r.message_id
    where r.user_id=auth.uid() and not exists(select 1 from public.staff_message_states where message_id=m.id and user_id=auth.uid() and hidden_at is not null)
    order by m.created_at desc,m.id desc limit 50),
  staff as(select m.*,s.read_at from(select * from broadcasts union all select * from targeted)m
    left join public.staff_message_states s on s.message_id=m.id and s.user_id=auth.uid() where s.hidden_at is null),
  messages as(
    select sm.id,r.id as receipt_id,'system'::text as receipt_kind,sm.title,coalesce(to_jsonb(sm)->>'message',to_jsonb(sm)->>'body','') as message,
      coalesce(to_jsonb(sm)->>'severity','info') as severity,sm.created_at,r.read_at
    from public.system_message_receipts r join public.system_messages sm on sm.id=r.message_id where r.user_id=auth.uid()
    union all select id,id,'staff',title,body,'info',created_at,read_at from staff)
  select to_jsonb(m) from messages m order by created_at desc,id desc limit 50;
$$;
revoke all on function public.notification_inbox() from public,anon;
grant execute on function public.notification_inbox() to authenticated;

create or replace function public.staff_message_receipt_action(p_message uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_action is null or p_action not in ('read','unread','delete') then raise exception 'Accion no valida.'; end if;
  if auth.uid() is null or not exists(select 1 from public.staff_messages m where m.id=p_message and
    ((m.audience='all' and exists(select 1 from auth.users where id=auth.uid() and created_at<=m.audience_cutoff))
      or exists(select 1 from public.staff_message_recipients where message_id=m.id and user_id=auth.uid()))) then
    raise exception 'Este mensaje no existe o no tienes permiso.' using errcode='42501';
  end if;
  insert into public.staff_message_states(message_id,user_id,read_at,hidden_at)
    values(p_message,auth.uid(),case when p_action='read' then now() end,case when p_action='delete' then now() end)
    on conflict(message_id,user_id) do update set
      read_at=case when p_action='delete' then public.staff_message_states.read_at when p_action='read' then now() else null end,
      hidden_at=coalesce(public.staff_message_states.hidden_at,excluded.hidden_at);
end;
$$;
revoke all on function public.staff_message_receipt_action(uuid,text) from public,anon;
grant execute on function public.staff_message_receipt_action(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
