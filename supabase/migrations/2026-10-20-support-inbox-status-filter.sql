begin;

-- Filter before counting/paging; preserve the existing three-argument API.
create or replace function public.support_inbox(p_staff boolean,p_search text,p_page integer,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();as_staff boolean:=coalesce(p_staff,false);term text:=left(btrim(coalesce(p_search,'')),120);
  total integer;page integer;rows jsonb;deadline timestamptz;
begin
  if uid is null then raise exception 'Inicia sesión.' using errcode='42501';end if;
  if as_staff then perform public.staff_require('access');end if;
  if coalesce(p_status,'all') not in('all','open','closed') then raise exception 'Estado de caso inválido.';end if;
  if not as_staff and coalesce(p_status,'all')<>'all' then raise exception 'Filtro exclusivo del equipo.' using errcode='42501';end if;
  select count(*) into total from public.support_threads t left join public.usuarios u on u.id=t.user_id
    where (as_staff or (t.user_id=uid and t.user_hidden_at is null)) and (coalesce(p_status,'all')='all' or (p_status='open' and t.closed_at is null) or (p_status='closed' and t.closed_at is not null)) and (term='' or position(lower(term) in lower(t.subject||' '||coalesce(u.nombre,'')))>0);
  page:=least(greatest(coalesce(p_page,1),1),greatest(1,ceil(total/20.0)::integer));
  select coalesce(jsonb_agg(to_jsonb(r) order by r.updated_at desc,r.id),'[]'::jsonb) into rows from (
    select t.id,t.subject,t.updated_at,t.created_at,t.last_author,t.user_hidden_at,t.closed_at,
      coalesce(u.nombre,'Usuario') as user_name,
      case when as_staff then t.last_user_seq>coalesce(sr.last_seen_seq,0) else t.last_staff_seq>t.user_read_seq end as unread
    from public.support_threads t left join public.usuarios u on u.id=t.user_id
    left join public.support_staff_reads sr on sr.thread_id=t.id and sr.staff_id=uid
    where (as_staff or (t.user_id=uid and t.user_hidden_at is null)) and (coalesce(p_status,'all')='all' or (p_status='open' and t.closed_at is null) or (p_status='closed' and t.closed_at is not null)) and (term='' or position(lower(term) in lower(t.subject||' '||coalesce(u.nombre,'')))>0)
    order by t.updated_at desc,t.id limit 20 offset (page-1)*20
  )r;
  if not as_staff then select max(created_at)+interval '24 hours' into deadline from public.support_threads where user_id=uid;end if;
  return jsonb_build_object('rows',rows,'total',total,'page',page,'pages',greatest(1,ceil(total/20.0)::integer),'next_thread_at',deadline);
end;
$$;
revoke all on function public.support_inbox(boolean,text,integer,text) from public,anon;
grant execute on function public.support_inbox(boolean,text,integer,text) to authenticated;
notify pgrst,'reload schema';
commit;
