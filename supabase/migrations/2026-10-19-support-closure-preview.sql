begin;
alter table public.support_threads add column if not exists closed_at timestamptz;
alter table public.support_threads add column if not exists closed_by uuid references auth.users(id) on delete set null;
create index if not exists support_threads_closed_idx on public.support_threads(closed_at,id) where closed_at is not null;

create or replace function public.support_write(p_thread uuid,p_request uuid,p_body text,p_staff boolean)
returns bigint language plpgsql security definer set search_path='' as $$
declare n bigint;stamp timestamptz:=clock_timestamp();uid uuid:=auth.uid();owner uuid;author text;
begin
  author:=case when p_staff then (select role from public.staff_accounts where user_id=uid and active) else 'user' end;
  insert into public.support_messages(request_id,thread_id,sender_id,author_role,body,created_at)
    values(p_request,p_thread,uid,author,p_body,stamp) returning seq into n;
  update public.support_threads set updated_at=stamp,last_message_seq=n,closed_at=null,closed_by=null,
    last_user_seq=case when p_staff then last_user_seq else n end,
    last_staff_seq=case when p_staff then n else last_staff_seq end,
    last_user_at=case when p_staff then last_user_at else stamp end,
    last_staff_at=case when p_staff then stamp else last_staff_at end,
    last_author=case when p_staff then 'staff' else 'user' end where id=p_thread returning user_id into owner;
  perform realtime.send(jsonb_build_object('thread_id',p_thread,'seq',n),'support_changed','mb:support:staff',true);
  if p_staff then
    perform realtime.send(jsonb_build_object('id',p_thread,'kind','support','created_at',stamp),
      'inbox_notice','mb:inbox:user:'||owner::text,true);
    insert into public.staff_audit(actor_id,action,target_id,reason,changes)
      values(uid,'support.reply',p_thread,'Respuesta al buzón de soporte',jsonb_build_object('message_seq',n));
  end if;
  return n;
end;
$$;

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
    select t.id,t.subject,t.updated_at,t.created_at,t.last_author,t.user_hidden_at,t.closed_at,
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
    'closed_at',thread.closed_at,'user_hidden_at',thread.user_hidden_at,'last_staff_seq',thread.last_staff_seq,'last_message_seq',thread.last_message_seq,'last_staff_at',thread.last_staff_at,
    'user_name',(select nombre from public.usuarios where id=thread.user_id),
    'more',exists(select 1 from public.support_messages where thread_id=p_thread and seq<oldest));
end;
$$;

create or replace function public.support_set_closed(p_thread uuid,p_closed boolean,p_expected_seq bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare thread public.support_threads%rowtype;stamp timestamptz;
begin
 perform public.staff_require('access');
 if p_closed is null or p_expected_seq is null then raise exception 'Revisa el estado del caso.';end if;
 select * into thread from public.support_threads where id=p_thread for update;
 if not found then raise exception 'Caso no disponible.';end if;
 if thread.last_message_seq is distinct from p_expected_seq then raise exception 'Hay mensajes nuevos. Actualiza y revísalos antes de cambiar el estado.';end if;
 if (thread.closed_at is not null)=p_closed then return jsonb_build_object('closed_at',thread.closed_at);end if;
 stamp:=case when p_closed then clock_timestamp() else null end;
 update public.support_threads set closed_at=stamp,closed_by=case when p_closed then auth.uid() else null end where id=p_thread;
 insert into public.staff_audit(actor_id,action,target_id,reason,changes) values(auth.uid(),case when p_closed then 'support.close' else 'support.reopen' end,p_thread,'Cambio de estado del caso de soporte',jsonb_build_object('closed_at',stamp,'last_message_seq',thread.last_message_seq));
 perform realtime.send(jsonb_build_object('thread_id',p_thread),'support_changed','mb:support:staff',true);
 if thread.user_hidden_at is null then
  perform realtime.send(jsonb_build_object('thread_id',p_thread),'support_thread_state','mb:inbox:user:'||thread.user_id::text,true);
 end if;
 return jsonb_build_object('closed_at',stamp);
end;
$$;
revoke all on function public.support_set_closed(uuid,boolean,bigint) from public,anon;
grant execute on function public.support_set_closed(uuid,boolean,bigint) to authenticated;


-- Read-only proposal preview. Reaching a threshold is NOT authorization to erase.
create or replace function public.preview_retention(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare stamp timestamptz:=clock_timestamp();result jsonb;
begin
 perform public.staff_require('access');
 with candidates as(
  select 'support'::text as category,t.id,t.closed_at as event_at,t.closed_at+interval '180 days' as proposed_limit
   from public.support_threads t where t.closed_at<=stamp-interval '180 days'
  union all
  select 'data_requests',r.id,r.responded_at,r.responded_at+interval '24 months'
   from public.data_rights_requests r where r.status='answered' and r.responded_at<=stamp-interval '24 months'
  union all
  select 'chats',c.id,a.delivered_at,a.delivered_at+interval '90 days'
   from public.chats c join public.articulos a on a.id=c.articulo_id
   where a.status='entregado' and a.delivered_at<=stamp-interval '90 days'
 ),counts as(select category,count(*) as total from candidates group by category),sample as(
  select * from candidates order by proposed_limit,category,id limit least(greatest(coalesce(p_limit,20),1),50)
 )
 select jsonb_build_object('as_of',stamp,'deletion_enabled',false,'requires_review',true,
  'counts',coalesce((select jsonb_object_agg(category,total) from counts),'{}'::jsonb),
  'sample',coalesce((select jsonb_agg(to_jsonb(s) order by s.proposed_limit,s.category,s.id) from sample s),'[]'::jsonb),
  'without_event',jsonb_build_object(
   'support',(select count(*) from public.support_threads where closed_at is null),
   'data_requests',(select count(*) from public.data_rights_requests where status<>'answered' or responded_at is null),
   'chats',(select count(*) from public.chats c left join public.articulos a on a.id=c.articulo_id where a.id is null or a.status is distinct from 'entregado' or a.delivered_at is null))) into result;
 return result;
end;
$$;
revoke all on function public.preview_retention(integer) from public,anon;
grant execute on function public.preview_retention(integer) to authenticated;

notify pgrst,'reload schema';
commit;
