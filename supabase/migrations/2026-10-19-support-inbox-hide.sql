begin;

alter table public.support_threads add column if not exists user_hidden_at timestamptz;

create or replace function public.support_inbox(p_staff boolean default false,p_search text default '',p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();as_staff boolean:=coalesce(p_staff,false);term text:=left(btrim(coalesce(p_search,'')),120);
  total integer;page integer;rows jsonb;deadline timestamptz;
begin
  if uid is null then raise exception 'Inicia sesión.' using errcode='42501';end if;
  if as_staff then perform public.staff_require('access');end if;
  select count(*) into total from public.support_threads t left join public.usuarios u on u.id=t.user_id
    where (as_staff or (t.user_id=uid and t.user_hidden_at is null)) and (term='' or position(lower(term) in lower(t.subject||' '||coalesce(u.nombre,'')))>0);
  page:=least(greatest(coalesce(p_page,1),1),greatest(1,ceil(total/20.0)::integer));
  select coalesce(jsonb_agg(to_jsonb(r) order by r.updated_at desc,r.id),'[]'::jsonb) into rows from (
    select t.id,t.subject,t.updated_at,t.created_at,t.last_author,t.user_hidden_at,
      coalesce(u.nombre,'Usuario') as user_name,
      case when as_staff then t.last_user_seq>coalesce(sr.last_seen_seq,0) else t.last_staff_seq>t.user_read_seq end as unread
    from public.support_threads t left join public.usuarios u on u.id=t.user_id
    left join public.support_staff_reads sr on sr.thread_id=t.id and sr.staff_id=uid
    where (as_staff or (t.user_id=uid and t.user_hidden_at is null)) and (term='' or position(lower(term) in lower(t.subject||' '||coalesce(u.nombre,'')))>0)
    order by t.updated_at desc,t.id limit 20 offset (page-1)*20
  )r;
  if not as_staff then select max(created_at)+interval '24 hours' into deadline from public.support_threads where user_id=uid;end if;
  return jsonb_build_object('rows',rows,'total',total,'page',page,'pages',greatest(1,ceil(total/20.0)::integer),'next_thread_at',deadline);
end;
$$;

create or replace function public.support_thread(p_thread uuid,p_staff boolean default false,p_before bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();as_staff boolean:=coalesce(p_staff,false);thread public.support_threads%rowtype;
  rows jsonb;oldest bigint;seen bigint;
begin
  if uid is null then raise exception 'Inicia sesión.' using errcode='42501';end if;
  if as_staff then perform public.staff_require('access');end if;
  select * into thread from public.support_threads where id=p_thread;
  if not found or (not as_staff and (thread.user_id is distinct from uid or thread.user_hidden_at is not null)) then raise exception 'Conversación no disponible.' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.seq),'[]'::jsonb),min(r.seq) into rows,oldest from (
    select m.seq,m.body,m.created_at,m.author_role,
      case when m.author_role='user' then coalesce(u.nombre,'Usuario')
        when as_staff then coalesce(a.nombre,'Equipo MiBatute') else 'Equipo MiBatute' end as author_name
    from public.support_messages m left join public.usuarios u on u.id=thread.user_id
    left join public.usuarios a on a.id=m.sender_id
    where m.thread_id=p_thread and (p_before is null or m.seq<p_before)
    order by m.seq desc limit 40
  )r;
  -- Mark only the snapshot that was fetched, never a concurrent incoming message.
  if p_before is null then
    if as_staff then
      insert into public.support_staff_reads(thread_id,staff_id,last_seen_seq) values(p_thread,uid,thread.last_user_seq)
        on conflict(thread_id,staff_id) do update set last_seen_seq=greatest(public.support_staff_reads.last_seen_seq,excluded.last_seen_seq)
        where public.support_staff_reads.last_seen_seq<excluded.last_seen_seq;
    else
      update public.support_threads set user_read_seq=greatest(user_read_seq,thread.last_staff_seq)
        where id=p_thread and user_read_seq<thread.last_staff_seq;
    end if;
  end if;
  return jsonb_build_object('id',thread.id,'subject',thread.subject,'messages',rows,
    'user_hidden_at',thread.user_hidden_at,'last_staff_seq',thread.last_staff_seq,'last_message_seq',thread.last_message_seq,'last_staff_at',thread.last_staff_at,
    'user_name',(select nombre from public.usuarios where id=thread.user_id),
    'more',exists(select 1 from public.support_messages where thread_id=p_thread and seq<oldest));
end;
$$;

create or replace function public.support_reply(p_thread uuid,p_request uuid,p_body text,p_staff boolean default false)
returns bigint language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();thread public.support_threads%rowtype;previous public.support_messages%rowtype;
  body text:=btrim(coalesce(p_body,''));as_staff boolean:=coalesce(p_staff,false);
begin
  if uid is null then raise exception 'Inicia sesión.' using errcode='42501';end if;
  if as_staff then perform public.staff_require('access');end if;
  if p_request is null or length(body) not between 1 and 2000 then raise exception 'Escribe un mensaje de hasta 2000 caracteres.';end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,2026101901));
  select * into thread from public.support_threads where id=p_thread for update;
  if not found or (not as_staff and (thread.user_id is distinct from uid or thread.user_hidden_at is not null)) then raise exception 'Conversación no disponible.' using errcode='42501';end if;
  select * into previous from public.support_messages where request_id=p_request;
  if found then
    if previous.thread_id is distinct from p_thread or previous.sender_id is distinct from uid
      or previous.body is distinct from body or (previous.author_role<>'user') is distinct from as_staff then
      raise exception 'Identificador de solicitud ya utilizado.';end if;
    return previous.seq;
  end if;
  if not as_staff and thread.last_user_at>clock_timestamp()-interval '15 seconds' then
    raise exception 'Espera unos segundos antes de enviar otro mensaje.';end if;
  if (select count(*) from public.support_messages where thread_id=p_thread)>=500 then raise exception 'Este hilo llegó a su límite de mensajes. Inicia otra conversación cuando esté disponible.';end if;
  if thread.user_hidden_at is not null then raise exception 'El usuario eliminó esta conversación. Se conserva solo como historial.';end if;
  return public.support_write(p_thread,p_request,body,as_staff);
end;
$$;

create or replace function public.support_hide_thread(p_thread uuid)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();thread public.support_threads%rowtype;stamp timestamptz:=clock_timestamp();
begin
  if uid is null then raise exception 'Inicia sesión.' using errcode='42501';end if;
  select * into thread from public.support_threads where id=p_thread for update;
  if not found or thread.user_id is distinct from uid then raise exception 'Conversación no disponible.' using errcode='42501';end if;
  if thread.user_hidden_at is not null then return;end if;
  update public.support_threads set user_hidden_at=stamp where id=p_thread;
  perform realtime.send(jsonb_build_object('thread_id',p_thread),'support_removed','mb:inbox:user:'||uid::text,true);
  perform realtime.send(jsonb_build_object('thread_id',p_thread),'support_changed','mb:support:staff',true);
end;
$$;
revoke all on function public.support_hide_thread(uuid) from public,anon;
grant execute on function public.support_hide_thread(uuid) to authenticated;

create or replace function public.notification_activity_feed()
returns setof jsonb language sql stable security definer set search_path='' as $$
  with viewer as(select id,created_at from auth.users where id=auth.uid()),
  activity as(select id,type,articulo_id,chat_id,buyer_id,receipt_id,created_at,title,subtitle,thumb,
      'system'::text as receipt_kind,false as read from public.activity_notifications
    where recipient_id=auth.uid() order by created_at desc,id limit 10),
  general as(select m.id,m.created_at from public.staff_messages m join viewer v on v.created_at<=m.audience_cutoff
    where m.audience='all' and not exists(select 1 from public.staff_message_states where message_id=m.id and user_id=auth.uid() and hidden_at is not null)
    order by m.created_at desc,m.id limit 50),
  selected as(select m.id,m.created_at from public.staff_message_recipients r join public.staff_messages m on m.id=r.message_id
    where r.user_id=auth.uid() and not exists(select 1 from public.staff_message_states where message_id=m.id and user_id=auth.uid() and hidden_at is not null)
    order by m.created_at desc,m.id limit 50),
  staff as(select m.*,s.read_at from(select * from general union all select * from selected)m
    left join public.staff_message_states s on s.message_id=m.id and s.user_id=auth.uid()
    where s.hidden_at is null order by m.created_at desc,m.id limit 50),
  notices as(select to_jsonb(a) as item,a.created_at,a.id from activity a
    union all select jsonb_build_object('id','inbox-staff-'||id::text,'type','system_notice',
      'receipt_id',id,'receipt_kind','staff','created_at',created_at,'title','Mensaje de MiBatute',
      'subtitle','Tienes un mensaje en tu buzon.','read',read_at is not null),created_at,'inbox-staff-'||id::text from staff)
  select item from (
    select item,created_at,id from notices
    union all
    select jsonb_build_object('id','inbox-support-'||t.id::text,'type','system_notice',
      'receipt_id',t.id,'receipt_kind','support','created_at',t.last_staff_at,
      'title','Respuesta de MiBatute','subtitle','Tienes una respuesta en tu conversación con MiBatute.',
      'read',t.user_read_seq>=t.last_staff_seq),t.last_staff_at,'inbox-support-'||t.id::text
    from (select * from public.support_threads where user_id=auth.uid() and user_hidden_at is null and last_staff_seq>0
      order by last_staff_at desc,id limit 50)t
  )combined order by created_at desc,id limit 60;
$$;

notify pgrst,'reload schema';

commit;
